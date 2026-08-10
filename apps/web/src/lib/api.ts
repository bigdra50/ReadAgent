import type { TocEntry } from '@readagent/core';
import type { NoteAnchor } from '@readagent/notes/markdown';
import type { PageText } from '@readagent/pdf/text';

export interface BookRef {
  readonly id: string;
  readonly title: string;
}

export interface DocumentSummary extends BookRef {
  readonly pageCount: number;
  readonly toc: readonly TocEntry[];
}

export interface PageResponse extends PageText {
  readonly page: number;
}

export interface SearchHit {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly anchor: NoteAnchor;
  readonly heading: string;
  readonly excerpt: string;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} が ${response.status} を返しました`);
  }
  return (await response.json()) as T;
}

export const fetchBooks = async () => (await getJson<{ books: BookRef[] }>('/api/books')).books;

export const fetchDocument = (bookId: string) =>
  getJson<DocumentSummary>(`/api/books/${bookId}/document`);

export const fetchPage = (bookId: string, page: number) =>
  getJson<PageResponse>(`/api/books/${bookId}/pages/${page}`);

export const fetchNotes = (bookId: string) =>
  getJson<{ markdown: string }>(`/api/books/${bookId}/notes`);

export const searchNotes = async (query: string) =>
  (await getJson<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(query)}`)).hits;

export const pdfFileUrl = (bookId: string) => `/api/books/${bookId}/file`;
