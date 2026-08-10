import type { AddressInfo } from 'node:net';
import type { AgentEvent } from '@readagent/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildContext, parseChatRequest } from '../src/chat.js';
import { createReadAgentServer } from '../src/server.js';
import { memoryLibrary } from './helpers/memory-library.js';

const pageText = {
  page: 1,
  text: '前の話です。トレースを記録する。次の話です。',
  lineBreaks: [6],
};
const document = { pageCount: 1, pages: [pageText], toc: [] };

const bookLibrary = (notes?: string) =>
  memoryLibrary([{ id: 'jit', title: 'JIT入門', document, ...(notes ? { notes } : {}) }]);

const listen = async (server: ReturnType<typeof createReadAgentServer>) => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
const close = (server: ReturnType<typeof createReadAgentServer>) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

describe('parseChatRequest', () => {
  it('妥当な入力を受け取る', () => {
    expect(parseChatRequest({ page: 1, start: 0, end: 5, question: 'なぜ？' })).toEqual({
      page: 1,
      start: 0,
      end: 5,
      question: 'なぜ？',
    });
  });

  it('質問は省略できる', () => {
    expect(parseChatRequest({ page: 1, start: 0, end: 5 })).toEqual({ page: 1, start: 0, end: 5 });
  });

  it('一時上書きの設定を受け取る', () => {
    const parsed = parseChatRequest({
      page: 1,
      start: 0,
      end: 5,
      config: { updateMode: 'always' },
    });

    expect(parsed).toMatchObject({ config: { updateMode: 'always' } });
  });

  it('一時上書きの不正な値は捨てて、問い合わせ自体は通す', () => {
    const parsed = parseChatRequest({
      page: 1,
      start: 0,
      end: 5,
      config: { updateMode: 'ときどき', granularity: 'summary' },
    });

    expect(parsed).toMatchObject({ config: { granularity: 'summary' } });
    expect(parsed).not.toHaveProperty('error');
  });

  it('壊れた入力は理由つきで弾く', () => {
    expect(parseChatRequest(null)).toHaveProperty('error');
    expect(parseChatRequest({ page: 0, start: 0, end: 1 })).toHaveProperty('error');
    expect(parseChatRequest({ page: 1, start: -1, end: 1 })).toHaveProperty('error');
    expect(parseChatRequest({ page: 1, start: 5, end: 5 })).toHaveProperty('error');
    expect(parseChatRequest({ page: 1, start: 0, end: 1, question: 42 })).toHaveProperty('error');
  });
});

describe('buildContext', () => {
  it('引用はオフセットから本文を切り出して作る', () => {
    expect(buildContext(pageText, { page: 1, start: 6, end: 15 }).context.quote).toBe(
      'トレースを記録する',
    );
  });

  it('選択の前後を文脈として添える', () => {
    const { context } = buildContext(pageText, { page: 1, start: 6, end: 15 });

    expect(context.before).toBe('前の話です。');
    expect(context.after).toBe('。次の話です。');
  });

  it('文脈の予算を持つ（全文を投げない）', () => {
    expect(
      buildContext(pageText, { page: 1, start: 0, end: 5 }).budget.maxContextChars,
    ).toBeGreaterThan(0);
  });

  it('設定の上書きを反映する', () => {
    const { updateMode } = buildContext(
      pageText,
      { page: 1, start: 0, end: 5 },
      {
        updateMode: 'always',
      },
    );

    expect(updateMode).toBe('always');
  });
});

describe('POST /api/books/:id/chat', () => {
  const events: AgentEvent[] = [
    { type: 'text', text: 'まず' },
    { type: 'tool-start', id: 't1', name: 'WebSearch' },
    { type: 'tool-end', id: 't1', ok: true },
    { type: 'done', ok: true },
  ];

  let seen: { quote: string; question?: string; updateMode: string } | undefined;
  const server = createReadAgentServer({
    library: bookLibrary(),
    ask: (input) => {
      const notes = input.notes;
      seen = {
        quote: input.context.quote,
        updateMode: notes?.updateMode ?? 'なし',
        ...(input.context.question ? { question: input.context.question } : {}),
      };
      return (async function* () {
        for (const event of events) yield event;
      })();
    },
  });
  let base = '';

  beforeAll(async () => {
    base = await listen(server);
  });
  afterAll(() => close(server));

  const post = (body: unknown) =>
    fetch(`${base}/api/books/jit/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('イベントを SSE として流す', async () => {
    const response = await post({ page: 1, start: 6, end: 15, question: 'なぜ？' });

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const received = (await response.text())
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => JSON.parse(chunk.slice(6)) as AgentEvent);

    expect(received).toEqual(events);
  });

  it('引用はブラウザから受け取らず、サーバー側で切り出す', async () => {
    await post({ page: 1, start: 6, end: 15, question: 'なぜ？' }).then((r) => r.text());

    expect(seen?.quote).toBe('トレースを記録する');
    expect(seen?.question).toBe('なぜ？');
  });

  it('書籍ごとの設定をエージェントに渡す', async () => {
    await post({ page: 1, start: 6, end: 15 }).then((r) => r.text());

    expect(seen?.updateMode).toBe('agent');
  });

  it('壊れた入力は 400 で返す', async () => {
    expect((await post({ page: 1, start: 10, end: 3 })).status).toBe(400);
  });

  it('存在しないページは 404 で返す', async () => {
    expect((await post({ page: 99, start: 0, end: 3 })).status).toBe(404);
  });

  it('接続が切れたら問い合わせを中断する（要件 5 のキャンセル可能性）', async () => {
    let signal: AbortSignal | undefined;
    const slow = createReadAgentServer({
      library: bookLibrary(),
      ask: (input) => {
        signal = input.signal;
        return (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: 'text', text: '書き始め' };
          await new Promise((resolve) => setTimeout(resolve, 3000));
          yield { type: 'done', ok: true };
        })();
      },
    });
    const slowBase = await listen(slow);

    const controller = new AbortController();
    const response = await fetch(`${slowBase}/api/books/jit/chat`, {
      method: 'POST',
      body: JSON.stringify({ page: 1, start: 0, end: 3 }),
      signal: controller.signal,
    });
    await response.body?.getReader().read();
    controller.abort();

    await vi.waitFor(() => {
      expect(signal?.aborted).toBe(true);
    });
    await close(slow);
  });

  it('エージェントが落ちても、終了イベントを返して接続を閉じる', async () => {
    const failing = createReadAgentServer({
      library: bookLibrary(),
      // 最初の取り出しで失敗する反復子。SDK が起動直後に落ちる状況を模す
      ask: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error('SDK が落ちました')),
        }),
      }),
    });
    const failingBase = await listen(failing);

    const body = await fetch(`${failingBase}/api/books/jit/chat`, {
      method: 'POST',
      body: JSON.stringify({ page: 1, start: 0, end: 3 }),
    }).then((r) => r.text());

    expect(body).toContain('"type":"done"');
    expect(body).toContain('SDK が落ちました');
    await close(failing);
  });
});

describe('GET /api/books/:id/notes', () => {
  it('ノート全文を返す', async () => {
    const server = createReadAgentServer({ library: bookLibrary('# ノート\n\n引用あり\n') });
    const base = await listen(server);

    const body = (await (await fetch(`${base}/api/books/jit/notes`)).json()) as {
      markdown: string;
    };

    expect(body.markdown).toContain('引用あり');
    await close(server);
  });

  it('まだノートが無ければ空を返す', async () => {
    const server = createReadAgentServer({ library: bookLibrary() });
    const base = await listen(server);

    await expect((await fetch(`${base}/api/books/jit/notes`)).json()).resolves.toEqual({
      markdown: '',
    });
    await close(server);
  });
});

describe('一時上書きの適用範囲', () => {
  it('モデルを指定するとエージェントに渡す', async () => {
    let seenModel: string | undefined;
    const server = createReadAgentServer({
      library: bookLibrary(),
      ask: (input) => {
        seenModel = input.model;
        return (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: 'done', ok: true };
        })();
      },
    });
    const base = await listen(server);

    await fetch(`${base}/api/books/jit/chat`, {
      method: 'POST',
      body: JSON.stringify({ page: 1, start: 0, end: 3, model: 'sonnet' }),
    }).then((r) => r.text());

    expect(seenModel).toBe('sonnet');
    await close(server);
  });

  it('空のモデル指定は 400 で弾く', async () => {
    const server = createReadAgentServer({ library: bookLibrary() });
    const base = await listen(server);

    const response = await fetch(`${base}/api/books/jit/chat`, {
      method: 'POST',
      body: JSON.stringify({ page: 1, start: 0, end: 3, model: '   ' }),
    });

    expect(response.status).toBe(400);
    await close(server);
  });

  it('文脈の上限を上書きできる', async () => {
    let budget: { maxContextChars: number } | undefined;
    const server = createReadAgentServer({
      library: bookLibrary(),
      ask: (input) => {
        budget = input.budget;
        return (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: 'done', ok: true };
        })();
      },
    });
    const base = await listen(server);

    await fetch(`${base}/api/books/jit/chat`, {
      method: 'POST',
      body: JSON.stringify({ page: 1, start: 0, end: 3, config: { maxContextChars: 1234 } }),
    }).then((r) => r.text());

    expect(budget?.maxContextChars).toBe(1234);
    await close(server);
  });

  it('ノートの位置を上書きすると、その位置の保存先を使う', () => {
    const { notePath } = buildContext(
      pageText,
      { page: 1, start: 0, end: 5, config: { notePath: 'chapter3.md' } },
      { notePath: 'notes.md' },
    );

    expect(notePath).toBe('chapter3.md');
  });
});
