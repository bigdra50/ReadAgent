/**
 * 目次から章の範囲を求める。
 *
 * 章ごとのまとめ（ADR-0009 の「章単位のまとめ」）に使う。
 * 目次はページ番号しか持たないので、章の終わりは「次の項目の直前」として決める。
 */
import type { TocEntry } from './domain.js';

export interface ChapterRange {
  readonly id: string;
  readonly title: string;
  readonly depth: number;
  /** 1 始まり。含む */
  readonly fromPage: number;
  /** 1 始まり。含む */
  readonly toPage: number;
}

/** 入れ子の目次を、出現順の平坦な並びにする */
function flatten(entries: readonly TocEntry[]): TocEntry[] {
  return entries.flatMap((entry) => [entry, ...flatten(entry.children)]);
}

/**
 * 章の範囲を求める。ページが解決できていない項目（page が 0）は対象外。
 *
 * 章の終わりは、**自分より後ろにある最初の項目**の1つ前のページとする。
 * 節を含む章では、章の範囲が節の範囲を包む形になる。
 */
export function chapterRanges(toc: readonly TocEntry[], pageCount: number): ChapterRange[] {
  const flat = flatten(toc).filter((entry) => entry.page > 0);
  const ranges: ChapterRange[] = [];

  for (const [index, entry] of flat.entries()) {
    // 同じ深さ以下（＝自分の外側）に戻る最初の項目が、この章の終わり
    const next = flat.slice(index + 1).find((candidate) => candidate.depth <= entry.depth);
    const end = next ? next.page - 1 : pageCount;

    ranges.push({
      id: entry.id,
      title: entry.title,
      depth: entry.depth,
      fromPage: entry.page,
      toPage: Math.max(entry.page, Math.min(end, pageCount)),
    });
  }

  return ranges;
}
