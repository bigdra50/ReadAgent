import { type ParsedNoteEntry, parseEntries } from '@readagent/notes/markdown';

/**
 * ノートを取得して、読み返し用の構造に戻す。
 * 解析は @readagent/notes の純粋な処理を使う。サーバーと同じ規則で読むため。
 */
export async function fetchNoteEntries(): Promise<{
  entries: ParsedNoteEntry[];
  markdown: string;
}> {
  const response = await fetch('/api/notes');
  if (!response.ok) {
    throw new Error(`ノートを読めませんでした (${response.status})`);
  }
  const { markdown } = (await response.json()) as { markdown: string };
  return { entries: parseEntries(markdown), markdown };
}

export type { ParsedNoteEntry };
