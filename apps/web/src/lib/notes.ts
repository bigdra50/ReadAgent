import { type ParsedNoteEntry, parseEntries } from '@readagent/notes/markdown';
import { fetchNotes } from './api';

/**
 * ノートを取得して、読み返し用の構造に戻す。
 * 解析は @readagent/notes の純粋な処理を使う。サーバーと同じ規則で読むため。
 */
export async function fetchNoteEntries(bookId: string): Promise<{
  entries: ParsedNoteEntry[];
  markdown: string;
}> {
  const { markdown } = await fetchNotes(bookId);
  return { entries: parseEntries(markdown), markdown };
}

export type { ParsedNoteEntry };
