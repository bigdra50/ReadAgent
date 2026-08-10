import { describe, expect, it } from 'vitest';
import type { TocEntry } from '../src/domain.js';
import { chapterRanges } from '../src/toc.js';

const entry = (
  id: string,
  title: string,
  page: number,
  depth = 0,
  children: readonly TocEntry[] = [],
): TocEntry => ({ id, title, page, depth, children });

describe('chapterRanges', () => {
  it('次の章の直前までを1つの章とする', () => {
    const toc = [entry('0', '第1章', 1), entry('1', '第2章', 10), entry('2', '第3章', 20)];

    expect(chapterRanges(toc, 30)).toEqual([
      { id: '0', title: '第1章', depth: 0, fromPage: 1, toPage: 9 },
      { id: '1', title: '第2章', depth: 0, fromPage: 10, toPage: 19 },
      { id: '2', title: '第3章', depth: 0, fromPage: 20, toPage: 30 },
    ]);
  });

  it('最後の章は本の終わりまで', () => {
    expect(chapterRanges([entry('0', '唯一の章', 5)], 12)[0]).toMatchObject({
      fromPage: 5,
      toPage: 12,
    });
  });

  it('節は章の内側に収まり、章は節を包む', () => {
    const toc = [
      entry('0', '第1章', 1, 0, [entry('0.0', '1.1', 2, 1), entry('0.1', '1.2', 5, 1)]),
      entry('1', '第2章', 10),
    ];

    const ranges = chapterRanges(toc, 20);

    expect(ranges.map((range) => [range.title, range.fromPage, range.toPage])).toEqual([
      ['第1章', 1, 9],
      ['1.1', 2, 4],
      ['1.2', 5, 9],
      ['第2章', 10, 20],
    ]);
  });

  it('ページが解決できていない項目は対象外', () => {
    const toc = [entry('0', '解決済み', 3), entry('1', '未解決', 0)];

    expect(chapterRanges(toc, 10)).toHaveLength(1);
  });

  it('総ページ数を超えない', () => {
    expect(chapterRanges([entry('0', '章', 8)], 5)[0]).toMatchObject({ fromPage: 8, toPage: 8 });
  });

  it('目次が空なら空を返す', () => {
    expect(chapterRanges([], 10)).toEqual([]);
  });
});
