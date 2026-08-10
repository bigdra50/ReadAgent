/**
 * ADR-0003 の主張「コアを変えずにアダプタを差し替えられる」を実際に確かめる。
 *
 * ここでは書籍の供給・本文の抽出・ノートの永続化・エージェント呼び出しの
 * すべてをメモリ上の実装に差し替え、ファイルシステムにも pdf.js にも
 * Claude Agent SDK にも触れずに、読書からノート更新までを通す。
 *
 * 要件 2 後半（Webサーバー化）で置き換わるのは、まさにこの4つである。
 */
import type { AddressInfo } from 'node:net';
import type { AgentEvent } from '@readagent/agent';
import { parseEntries } from '@readagent/notes';
import { describe, expect, it } from 'vitest';
import { createReadAgentServer } from '../src/server.js';
import { memoryLibrary } from './helpers/memory-library.js';

const document = {
  pageCount: 1,
  pages: [{ page: 1, text: '前置き。トレースを記録する。あとがき。', lineBreaks: [4] }],
  toc: [],
};

describe('アダプタを全て差し替えても成立するか', () => {
  it('ファイル・pdf.js・SDK に触れずに、選択からノート更新まで通る', async () => {
    const library = memoryLibrary([
      { id: 'jit', title: 'JIT入門', document, config: { updateMode: 'always' } },
    ]);

    const server = createReadAgentServer({
      library,
      // エージェントも差し替える。ノート更新は本物の経路（notes 引数）を通す
      ask: (input) =>
        (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: 'text', text: '前提の再確認です。' };
          yield { type: 'done', ok: true };
          const notes = input.notes;
          if (notes) {
            const result = await notes.recorder.append({
              anchor: notes.context.anchor,
              quote: notes.context.quote,
              answer: '前提の再確認です。',
              createdAt: '2026-08-10T00:00:00.000Z',
              ...(notes.context.question ? { question: notes.context.question } : {}),
            });
            yield { type: 'note-updated', path: result.path };
          }
        })(),
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // 1. 書籍を選ぶ
    const books = (await (await fetch(`${base}/api/books`)).json()) as {
      books: { id: string }[];
    };
    expect(books.books).toHaveLength(1);

    // 2. 本文を読む
    const page = (await (await fetch(`${base}/api/books/jit/pages/1`)).json()) as { text: string };
    expect(page.text).toContain('トレースを記録する');

    // 3. 選択して質問する
    const stream = await fetch(`${base}/api/books/jit/chat`, {
      method: 'POST',
      body: JSON.stringify({ page: 1, start: 4, end: 13, question: 'なぜ？' }),
    });
    const received = (await stream.text())
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => JSON.parse(chunk.slice(6)) as AgentEvent);
    expect(received.map((event) => event.type)).toEqual(['text', 'done', 'note-updated']);

    // 4. ノートが残り、本文へ戻れる
    const notes = (await (await fetch(`${base}/api/books/jit/notes`)).json()) as {
      markdown: string;
    };
    const entries = parseEntries(notes.markdown);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.quote).toBe('トレースを記録する');
    expect(entries[0]?.anchor).toEqual({ page: 1, start: 4, end: 13 });

    // 5. 横断検索から引ける
    const search = (await (await fetch(`${base}/api/search?q=前提の再確認`)).json()) as {
      hits: { bookId: string }[];
    };
    expect(search.hits[0]?.bookId).toBe('jit');

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('コアの解決規則はアダプタが変わっても同じ', async () => {
    // 設定の解決も、ノートの組み立ても core / notes の純粋な処理を通っている
    const library = memoryLibrary([
      { id: 'a', title: 'A', document, config: { granularity: 'summary' } },
    ]);

    const handle = await library.get('a');

    expect(handle?.config.granularity).toBe('summary');
    expect(handle?.config.updateMode).toBe('agent'); // 既定値はコアが持つ
  });
});
