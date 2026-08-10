import { createMemoryNoteStore, parseSummaries } from '@readagent/notes';
import { describe, expect, it } from 'vitest';
import type { QueryFn } from '../src/ask.js';
import { buildSummaryPrompt, summarizeNotes } from '../src/summarize.js';

const entries = [
  {
    anchor: { page: 3, start: 0, end: 5 },
    heading: 'ガードとは？',
    quote: 'ガードは前提を確認する',
    body: '崩れたらサイドイグジット。',
  },
  {
    anchor: { page: 12, start: 0, end: 5 },
    heading: 'トレースとは？',
    quote: '実行経路を記録する',
    body: '線形なので最適化しやすい。',
  },
];

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

describe('buildSummaryPrompt', () => {
  it('ノートのエントリをページつきで畳む', () => {
    const prompt = buildSummaryPrompt(entries, 'JIT入門', 8000);

    expect(prompt).toContain('書籍: JIT入門');
    expect(prompt).toContain('p.3 ガードとは？');
    expect(prompt).toContain('崩れたらサイドイグジット。');
  });

  it('予算を超えたら途中で打ち切る（全文を投げない）', () => {
    const many = Array.from({ length: 200 }, (_, index) => ({
      anchor: { page: index + 1, start: 0, end: 5 },
      heading: `見出し${index}`,
      quote: 'あ'.repeat(200),
      body: 'い'.repeat(200),
    }));

    const prompt = buildSummaryPrompt(many, '厚い本', 1000);

    expect(prompt.length).toBeLessThan(1200);
  });
});

describe('summarizeNotes', () => {
  const base = {
    entries,
    bookTitle: 'JIT入門',
    maxContextChars: 8000,
    now: () => new Date('2026-08-10T02:00:00.000Z'),
  };

  it('要約を流し、まとめとして追記する', async () => {
    const store = createMemoryNoteStore();

    const events = await collect(
      summarizeNotes({
        ...base,
        recorder: store,
        queryFn: fakeQuery([textDelta('記録と'), textDelta('最適化の話。'), success()]),
      }),
    );

    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      'text',
      'text',
      'done',
      'note-start',
      'note-updated',
    ]);
    const summaries = parseSummaries(store.content());
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.body).toContain('記録と最適化の話。');
  });

  it('対象ページの範囲を記録する', async () => {
    const store = createMemoryNoteStore();

    await collect(
      summarizeNotes({
        ...base,
        recorder: store,
        queryFn: fakeQuery([textDelta('요약'), success()]),
      }),
    );

    expect(parseSummaries(store.content())[0]).toMatchObject({ fromPage: 3, toPage: 12 });
  });

  it('既存のエントリを書き換えない（ADR-0009）', async () => {
    const store = createMemoryNoteStore('# 本 読書ノート\n\n手で書いたメモ\n');

    await collect(
      summarizeNotes({
        ...base,
        recorder: store,
        queryFn: fakeQuery([textDelta('まとめ'), success()]),
      }),
    );

    expect(store.content()).toContain('手で書いたメモ');
  });

  it('ノートが無ければ何もせずに終える', async () => {
    const store = createMemoryNoteStore();

    const events = await collect(
      summarizeNotes({ ...base, entries: [], recorder: store, queryFn: fakeQuery([success()]) }),
    );

    expect(events).toEqual([{ type: 'done', ok: false, error: 'まとめるノートがありません' }]);
    expect(store.content()).toBe('');
  });

  it('外部を引くツールは渡さない', async () => {
    let allowed: string[] | undefined;
    await collect(
      summarizeNotes({
        ...base,
        recorder: createMemoryNoteStore(),
        queryFn: fakeQuery([success()], (params) => {
          allowed = (params as { options?: { allowedTools?: string[] } }).options?.allowedTools;
        }),
      }),
    );

    expect(allowed).toEqual([]);
  });

  it('中断されたらまとめを書かない', async () => {
    const store = createMemoryNoteStore();
    const controller = new AbortController();

    const stream = summarizeNotes({
      ...base,
      recorder: store,
      signal: controller.signal,
      queryFn: fakeQuery([textDelta('途中'), textDelta('まで'), success()]),
    });
    for await (const _ of stream) {
      controller.abort();
    }

    expect(store.content()).toBe('');
  });

  it('書き込みに失敗しても、要約は届いている', async () => {
    const failing = { appendSummary: () => Promise.reject(new Error('書き込めません')) };

    const events = await collect(
      summarizeNotes({
        ...base,
        recorder: failing,
        queryFn: fakeQuery([textDelta('要約'), success()]),
      }),
    );

    expect(events).toContainEqual({ type: 'note-failed', error: '書き込めません' });
  });
});
