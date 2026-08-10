import type { TocEntry } from '@readagent/core';
import type { PageText } from '@readagent/pdf/text';

export interface DocumentSummary {
  readonly pageCount: number;
  readonly toc: readonly TocEntry[];
}

export interface PageResponse extends PageText {
  readonly page: number;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} が ${response.status} を返しました`);
  }
  return (await response.json()) as T;
}

export const fetchDocument = () => getJson<DocumentSummary>('/api/document');
export const fetchPage = (page: number) => getJson<PageResponse>(`/api/document/pages/${page}`);
export const pdfFileUrl = '/api/document/file';
