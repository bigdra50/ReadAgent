import { appendEntry, createMemoryNoteStore } from '@readagent/notes';
import { describe, expect, it } from 'vitest';
import type { BookHandle, Library } from '../src/library.js';
import { searchNotes } from '../src/search.js';

const entry = (page: number, question: string, answer: string) => ({
  anchor: { page, start: 0, end: 10 },
  quote: `${page}ページの引用`,
  question,
  answer,
  createdAt: '2026-08-10T00:00:00.000Z',
});

/** ファイルを使わないライブラリ。アダプタを差し替えられることの確認も兼ねる */
function memoryLibrary(books: { id: string; title: string; notes: string }[]): Library {
  const handles = new Map<string, BookHandle>(
    books.map((book) => [
      book.id,
      {
        ref: { id: book.id, title: book.title },
        config: {
          updateMode: 'agent',
          granularity: 'per-question',
          notePath: 'notes.md',
          autoTag: true,
          maxContextChars: 8000,
        },
        notes: createMemoryNoteStore(book.notes),
        notesAt: () => createMemoryNoteStore(book.notes),
        load: () =>
          Promise.resolve({
            document: { pageCount: 0, pages: [], toc: [] },
            bytes: new Uint8Array(),
          }),
      },
    ]),
  );

  return {
    list: () => Promise.resolve([...handles.values()].map((handle) => handle.ref)),
    get: (id) => Promise.resolve(handles.get(id)),
  };
}

const libraryWithNotes = () =>
  memoryLibrary([
    {
      id: 'jit',
      title: 'JIT入門',
      notes: appendEntry('', entry(3, 'ガードとは？', 'トレースの前提を確認する仕組み。')),
    },
    {
      id: 'types',
      title: '型システム入門',
      notes: appendEntry('', entry(12, '部分型とは？', '置換可能性を保証するトレース不要の話。')),
    },
  ]);

describe('searchNotes', () => {
  it('書籍をまたいで一致するエントリを返す', async () => {
    const hits = await searchNotes(libraryWithNotes(), 'トレース');

    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => hit.bookTitle).sort()).toEqual(['JIT入門', '型システム入門']);
  });

  it('本文へ戻れるアンカーを持つ', async () => {
    const hits = await searchNotes(libraryWithNotes(), 'ガード');

    expect(hits[0]?.anchor).toEqual({ page: 3, start: 0, end: 10 });
    expect(hits[0]?.bookId).toBe('jit');
  });

  it('一致箇所の周辺を抜粋する', async () => {
    const hits = await searchNotes(libraryWithNotes(), '置換可能性');

    expect(hits[0]?.excerpt).toContain('置換可能性');
    expect(hits[0]?.excerpt).not.toContain('\n');
  });

  it('大文字小文字を区別しない', async () => {
    const library = memoryLibrary([
      {
        id: 'a',
        title: 'A',
        notes: appendEntry('', entry(1, 'SSA とは？', 'Static Single Assignment')),
      },
    ]);

    await expect(searchNotes(library, 'static single')).resolves.toHaveLength(1);
  });

  it('見出し・引用・本文のどこに当たっても拾う', async () => {
    const library = libraryWithNotes();

    await expect(searchNotes(library, '部分型')).resolves.toHaveLength(1); // 見出し
    await expect(searchNotes(library, '12ページの引用')).resolves.toHaveLength(1); // 引用
    await expect(searchNotes(library, '置換可能性')).resolves.toHaveLength(1); // 本文
  });

  it('空の問い合わせでは何も返さない', async () => {
    await expect(searchNotes(libraryWithNotes(), '   ')).resolves.toEqual([]);
  });

  it('一致が無ければ空を返す', async () => {
    await expect(searchNotes(libraryWithNotes(), 'まったく無い語')).resolves.toEqual([]);
  });

  it('件数の上限を守る', async () => {
    const hits = await searchNotes(libraryWithNotes(), 'ページの引用', 1);

    expect(hits).toHaveLength(1);
  });

  it('ノートが空の書籍があっても止まらない', async () => {
    const library = memoryLibrary([
      { id: 'empty', title: '未読', notes: '' },
      {
        id: 'jit',
        title: 'JIT入門',
        notes: appendEntry('', entry(3, 'ガードとは？', '確認の仕組み')),
      },
    ]);

    await expect(searchNotes(library, 'ガード')).resolves.toHaveLength(1);
  });
});
