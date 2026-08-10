import type { AddressInfo } from 'node:net';
import type { AgentEvent } from '@readagent/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildContext, parseChatRequest } from '../src/chat.js';
import { createReadAgentServer, type LoadedDocument } from '../src/server.js';

const pageText = {
  page: 1,
  text: '前の話です。トレースを記録する。次の話です。',
  lineBreaks: [6],
};

const loaded: LoadedDocument = {
  bytes: new Uint8Array(),
  document: { pageCount: 1, pages: [pageText], toc: [] },
};

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
    const { context } = buildContext(pageText, { page: 1, start: 6, end: 15 });

    expect(context.quote).toBe('トレースを記録する');
  });

  it('選択の前後を文脈として添える', () => {
    const { context } = buildContext(pageText, { page: 1, start: 6, end: 15 });

    expect(context.before).toBe('前の話です。');
    expect(context.after).toBe('。次の話です。');
  });

  it('文脈の予算を持つ（全文を投げない）', () => {
    const { budget } = buildContext(pageText, { page: 1, start: 0, end: 5 });

    expect(budget.maxContextChars).toBeGreaterThan(0);
  });
});

describe('POST /api/chat', () => {
  const events: AgentEvent[] = [
    { type: 'text', text: 'まず' },
    { type: 'tool-start', id: 't1', name: 'WebSearch' },
    { type: 'tool-end', id: 't1', ok: true },
    { type: 'done', ok: true },
  ];

  let seen: { quote: string; question?: string } | undefined;
  const server = createReadAgentServer({
    loadDocument: () => Promise.resolve(loaded),
    ask: ({ context }) => {
      seen = { quote: context.quote, ...(context.question ? { question: context.question } : {}) };
      return (async function* () {
        for (const event of events) yield event;
      })();
    },
  });
  let base = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  const post = (body: unknown) =>
    fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('イベントを SSE として流す', async () => {
    const response = await post({ page: 1, start: 6, end: 15, question: 'なぜ？' });

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    const received = body
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

  it('壊れた入力は 400 で返す', async () => {
    const response = await post({ page: 1, start: 10, end: 3 });

    expect(response.status).toBe(400);
  });

  it('存在しないページは 404 で返す', async () => {
    const response = await post({ page: 99, start: 0, end: 3 });

    expect(response.status).toBe(404);
  });

  it('接続が切れたら問い合わせを中断する（要件 5 のキャンセル可能性）', async () => {
    let signal: AbortSignal | undefined;
    const slow = createReadAgentServer({
      loadDocument: () => Promise.resolve(loaded),
      ask: (input) => {
        signal = input.signal;
        return (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: 'text', text: '書き始め' };
          // 読者が待っている間、応答が続いている状況を作る
          await new Promise((resolve) => setTimeout(resolve, 3000));
          yield { type: 'done', ok: true };
        })();
      },
    });
    await new Promise<void>((resolve) => slow.listen(0, '127.0.0.1', resolve));
    const port = (slow.address() as AddressInfo).port;

    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({ page: 1, start: 0, end: 3 }),
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    await reader?.read(); // 最初のイベントを受け取る
    controller.abort();

    await vi.waitFor(() => {
      expect(signal?.aborted).toBe(true);
    });

    await new Promise<void>((resolve, reject) =>
      slow.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('エージェントが落ちても、終了イベントを返して接続を閉じる', async () => {
    const failing = createReadAgentServer({
      loadDocument: () => Promise.resolve(loaded),
      // 最初の取り出しで失敗する反復子。SDK が起動直後に落ちる状況を模す
      ask: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error('SDK が落ちました')),
        }),
      }),
    });
    await new Promise<void>((resolve) => failing.listen(0, '127.0.0.1', resolve));
    const port = (failing.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({ page: 1, start: 0, end: 3 }),
    });
    const body = await response.text();

    expect(body).toContain('"type":"done"');
    expect(body).toContain('SDK が落ちました');

    await new Promise<void>((resolve, reject) =>
      failing.close((error) => (error ? reject(error) : resolve())),
    );
  });
});
