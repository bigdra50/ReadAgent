import { createMemoryNoteStore } from '@readagent/notes';
import { describe, expect, it } from 'vitest';
import { askAboutSelection, type QueryFn } from '../src/ask.js';
import { createNoteToolServer, NOTE_TOOL_ID } from '../src/notes.js';
import { GRANULARITY_GUIDANCE } from '../src/prompt.js';

const anchor = { page: 5, start: 10, end: 30 };
const noteContext = {
  anchor,
  quote: 'トレースを記録する',
  question: 'なぜ？',
  now: () => new Date('2026-08-10T00:00:00.000Z'),
};
const selection = { page: 5, quote: 'トレースを記録する', question: 'なぜ？' };
const budget = { maxContextChars: 8000 };

const textDelta = (text: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
});
const success = () => ({ type: 'result', subtype: 'success', is_error: false });

function fakeQuery(messages: unknown[], onCall?: (params: unknown) => void): QueryFn {
  return (params) => {
    onCall?.(params);
    return (async function* () {
      for (const message of messages) yield message;
    })();
  };
}

const collect = async (stream: AsyncIterable<unknown>) => {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
};

describe('createNoteToolServer', () => {
  it('書き込み先のパスを引数に取らない（ADR-0007）', () => {
    const server = createNoteToolServer(createMemoryNoteStore(), noteContext);

    expect(server.toolId).toBe('mcp__readagent__update_note');
    expect(Object.keys(server.definition.inputSchema).sort()).toEqual(['summary', 'tags']);
  });

  it('呼ばれるまでは未使用として扱う', () => {
    const server = createNoteToolServer(createMemoryNoteStore(), noteContext);

    expect(server.used()).toBe(false);
  });

  it('引用と位置はエージェントの入力ではなく、渡された文脈から入る', async () => {
    const store = createMemoryNoteStore();
    const server = createNoteToolServer(store, noteContext);

    await server.definition.handler(
      { summary: 'エージェントが書いた要点', tags: undefined },
      undefined,
    );

    const note = store.content();
    expect(note).toContain('エージェントが書いた要点');
    expect(note).toContain('> トレースを記録する');
    expect(note).toContain('<!-- readagent:anchor page=5 start=10 end=30 -->');
    expect(server.used()).toBe(true);
  });

  it('タグを受け取ればノートに残す', async () => {
    const store = createMemoryNoteStore();
    const server = createNoteToolServer(store, noteContext);

    await server.definition.handler({ summary: '要点', tags: ['jit', 'trace'] }, undefined);

    expect(store.content()).toContain('#jit #trace');
  });

  it('書き込みに失敗してもツールは例外を投げず、失敗として返す', async () => {
    const failing = { append: () => Promise.reject(new Error('書き込めません')) };
    const server = createNoteToolServer(failing, noteContext);

    const result = await server.definition.handler({ summary: '要点', tags: undefined }, undefined);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('書き込めません');
    expect(server.used()).toBe(false);
  });
});

describe('updateMode', () => {
  it('manual ではノートを更新せず、ツールも渡さない', async () => {
    const store = createMemoryNoteStore();
    let allowed: string[] | undefined;

    await collect(
      askAboutSelection({
        context: selection,
        budget,
        notes: {
          updateMode: 'manual',
          granularity: 'per-question',
          recorder: store,
          context: noteContext,
        },
        queryFn: fakeQuery([textDelta('答え'), success()], (params) => {
          allowed = (params as { options?: { allowedTools?: string[] } }).options?.allowedTools;
        }),
      }),
    );

    expect(allowed).not.toContain(NOTE_TOOL_ID);
    expect(store.content()).toBe('');
  });

  it('agent ではツールを渡し、書くかどうかはエージェントに委ねる', async () => {
    const store = createMemoryNoteStore();
    let allowed: string[] | undefined;

    await collect(
      askAboutSelection({
        context: selection,
        budget,
        notes: {
          updateMode: 'agent',
          granularity: 'per-question',
          recorder: store,
          context: noteContext,
        },
        queryFn: fakeQuery([textDelta('答え'), success()], (params) => {
          allowed = (params as { options?: { allowedTools?: string[] } }).options?.allowedTools;
        }),
      }),
    );

    expect(allowed).toContain(NOTE_TOOL_ID);
    // エージェントがツールを呼ばなければ、ノートは変わらない
    expect(store.content()).toBe('');
  });

  it('always では回答のあと必ず1件追記する', async () => {
    const store = createMemoryNoteStore();

    const events = await collect(
      askAboutSelection({
        context: selection,
        budget,
        notes: {
          updateMode: 'always',
          granularity: 'per-question',
          recorder: store,
          context: noteContext,
        },
        queryFn: fakeQuery([textDelta('前半'), textDelta('後半'), success()]),
      }),
    );

    expect(store.content()).toContain('前半後半');
    expect(store.content()).toContain('トレースを記録する');
    expect(events.at(-2)).toEqual({ type: 'note-start' });
    expect(events.at(-1)).toMatchObject({ type: 'note-updated' });
  });

  it('always でも回答が空なら書かない', async () => {
    const store = createMemoryNoteStore();

    await collect(
      askAboutSelection({
        context: selection,
        budget,
        notes: {
          updateMode: 'always',
          granularity: 'per-question',
          recorder: store,
          context: noteContext,
        },
        queryFn: fakeQuery([success()]),
      }),
    );

    expect(store.content()).toBe('');
  });

  it('ノート更新の完了は回答の完了より後に流す（回答表示を待たせない）', async () => {
    const store = createMemoryNoteStore();

    const events = await collect(
      askAboutSelection({
        context: selection,
        budget,
        notes: {
          updateMode: 'always',
          granularity: 'per-question',
          recorder: store,
          context: noteContext,
        },
        queryFn: fakeQuery([textDelta('答え'), success()]),
      }),
    );

    const doneAt = events.findIndex((e) => (e as { type: string }).type === 'done');
    const noteAt = events.findIndex((e) => (e as { type: string }).type === 'note-updated');
    expect(doneAt).toBeGreaterThanOrEqual(0);
    expect(noteAt).toBeGreaterThan(doneAt);
  });

  it('ノートに書けなくても対話は壊さない', async () => {
    const failing = { append: () => Promise.reject(new Error('書き込めません')) };

    const events = await collect(
      askAboutSelection({
        context: selection,
        budget,
        notes: {
          updateMode: 'always',
          granularity: 'per-question',
          recorder: failing,
          context: noteContext,
        },
        queryFn: fakeQuery([textDelta('答え'), success()]),
      }),
    );

    expect(events).toContainEqual({ type: 'done', ok: true });
    expect(events.at(-1)).toEqual({ type: 'note-failed', error: '書き込めません' });
  });

  it('中断されたらノートを書かない', async () => {
    const store = createMemoryNoteStore();
    const controller = new AbortController();

    const stream = askAboutSelection({
      context: selection,
      budget,
      signal: controller.signal,
      notes: {
        updateMode: 'always',
        granularity: 'per-question',
        recorder: store,
        context: noteContext,
      },
      queryFn: fakeQuery([textDelta('途中'), textDelta('まで'), success()]),
    });

    const events = [];
    for await (const event of stream) {
      events.push(event);
      controller.abort();
    }

    expect(store.content()).toBe('');
  });
});

describe('granularity', () => {
  it('ノートを書けるときだけ、粒度の指示をシステムプロンプトに足す', async () => {
    let prompt: string | undefined;
    await collect(
      askAboutSelection({
        context: selection,
        budget,
        notes: {
          updateMode: 'agent',
          granularity: 'summary',
          recorder: createMemoryNoteStore(),
          context: noteContext,
        },
        queryFn: fakeQuery([success()], (params) => {
          prompt = (params as { options?: { systemPrompt?: string } }).options?.systemPrompt;
        }),
      }),
    );

    expect(prompt).toContain('要約だけを残す');
  });

  it('ノートを書けないときは粒度を語らない', async () => {
    let prompt: string | undefined;
    await collect(
      askAboutSelection({
        context: selection,
        budget,
        queryFn: fakeQuery([success()], (params) => {
          prompt = (params as { options?: { systemPrompt?: string } }).options?.systemPrompt;
        }),
      }),
    );

    expect(prompt).not.toContain('粒度');
  });

  it('粒度ごとに違う指示になる', () => {
    const values = Object.values(GRANULARITY_GUIDANCE);

    expect(new Set(values).size).toBe(values.length);
  });
});
