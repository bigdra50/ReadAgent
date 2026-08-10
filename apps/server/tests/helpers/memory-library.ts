/**
 * ファイルシステムを一切使わないライブラリ。
 *
 * テストを速く保つためだけでなく、「コアを変えずにアダプタを差し替えられるか」
 * （ADR-0003 / 要件 2 のWebサーバー化）を実際に確かめるための道具でもある。
 */
import { DEFAULT_NOTE_CONFIG, type NoteConfig } from '@readagent/core';
import { createMemoryNoteStore, type NoteStore } from '@readagent/notes';
import type { ExtractedDocument } from '@readagent/pdf';
import type { BookHandle, Library } from '../../src/library.js';

export interface MemoryBook {
  readonly id: string;
  readonly title: string;
  readonly document?: ExtractedDocument;
  readonly bytes?: Uint8Array;
  readonly notes?: string;
  readonly config?: Partial<NoteConfig>;
}

const emptyDocument: ExtractedDocument = { pageCount: 0, pages: [], toc: [] };

export function memoryLibrary(books: readonly MemoryBook[]): Library & {
  store(id: string): NoteStore & { content: () => string };
} {
  const stores = new Map<string, NoteStore & { content: () => string }>();
  const handles = new Map<string, BookHandle>();

  for (const book of books) {
    const store = createMemoryNoteStore(book.notes ?? '');
    stores.set(book.id, store);
    handles.set(book.id, {
      ref: { id: book.id, title: book.title },
      config: { ...DEFAULT_NOTE_CONFIG, ...book.config },
      notes: store,
      load: () =>
        Promise.resolve({
          document: book.document ?? emptyDocument,
          bytes: book.bytes ?? new Uint8Array(),
        }),
    });
  }

  return {
    list: () => Promise.resolve([...handles.values()].map((handle) => handle.ref)),
    get: (id) => Promise.resolve(handles.get(id)),
    store: (id) => {
      const store = stores.get(id);
      if (!store) throw new Error(`未知の書籍: ${id}`);
      return store;
    },
  };
}
