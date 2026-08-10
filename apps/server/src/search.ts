/**
 * 書籍を横断したノート検索（要件 6 Phase 4）。
 *
 * 索引は持たない。ノートは書籍ごとの Markdown 1ファイルで、量も人が読める程度に収まる。
 * 索引を先に作ると、更新のたびに同期を考えることになり、
 * 「ノートは手で編集してよい」という前提（ADR-0006）と噛み合わない。
 * 遅くなってから索引を考える。
 */
import { type NoteAnchor, parseEntries } from '@readagent/notes';
import type { Library } from './library.js';

export interface SearchHit {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly anchor: NoteAnchor;
  readonly heading: string;
  /** 一致箇所の周辺。どこが当たったかを見せる */
  readonly excerpt: string;
}

const EXCERPT_RADIUS = 40;

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + length + EXCERPT_RADIUS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\n/g, ' ')}${
    end < text.length ? '…' : ''
  }`;
}

/**
 * ノートを横断して素朴に部分一致で探す。
 * 大文字小文字は区別しない。日本語には語の区切りが無いので、
 * 単語単位ではなく部分一致にしている。
 */
export async function searchNotes(
  library: Library,
  query: string,
  limit = 50,
): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const hits: SearchHit[] = [];

  for (const ref of await library.list()) {
    if (hits.length >= limit) break;
    const handle = await library.get(ref.id);
    if (!handle) continue;

    const markdown = await handle.notes.read();
    for (const entry of parseEntries(markdown)) {
      if (hits.length >= limit) break;
      const haystack = `${entry.heading}\n${entry.quote}\n${entry.body}`;
      const index = haystack.toLowerCase().indexOf(needle);
      if (index < 0) continue;

      hits.push({
        bookId: ref.id,
        bookTitle: ref.title,
        anchor: entry.anchor,
        heading: entry.heading,
        excerpt: excerptAround(haystack, index, needle.length),
      });
    }
  }

  return hits;
}
