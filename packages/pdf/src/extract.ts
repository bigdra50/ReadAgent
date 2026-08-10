/**
 * pdf.js を使ったテキスト抽出。ここは副作用を持つアダプタ層で、
 * 純粋な組み立てロジックは text.ts 側にある。
 */
// Node 側では legacy ビルドを使う。既定のビルドは DOMMatrix など DOM のグローバルを要求し、
// Node では読み込んだ時点で落ちる。

import type { TocEntry } from '@readagent/core';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPageText, type PageText } from './text.js';

export interface ExtractedPage extends PageText {
  /** 1始まりのページ番号 */
  readonly page: number;
}

export interface ExtractedDocument {
  readonly pageCount: number;
  readonly pages: readonly ExtractedPage[];
  readonly toc: readonly TocEntry[];
}

interface RawOutlineItem {
  title: string;
  dest?: string | unknown[] | null;
  items?: RawOutlineItem[];
}

/** 宛先の参照を解決できる最小限の窓口。テストで差し替えられるようにしてある */
interface DestinationResolver {
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: { num: number; gen: number }): Promise<number>;
}

function isPageRef(value: unknown): value is { num: number; gen: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { num?: unknown }).num === 'number' &&
    typeof (value as { gen?: unknown }).gen === 'number'
  );
}

/**
 * 目次項目の宛先を 1 始まりのページ番号へ解決する。
 * 解決できない項目は 0 を返す。目次の1項目が壊れていても、目次全体は出したい。
 */
async function resolvePage(
  dest: string | unknown[] | null | undefined,
  doc: DestinationResolver,
): Promise<number> {
  if (!dest) return 0;

  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    const target = explicit?.[0];
    if (target === undefined) return 0;

    // 参照ではなく、ページ番号が直接入っている PDF もある
    if (typeof target === 'number') return target + 1;
    if (!isPageRef(target)) return 0;

    return (await doc.getPageIndex(target)) + 1;
  } catch {
    return 0;
  }
}

/** 目次を TocEntry へ変換する。ページ番号もここで解決する */
async function toTocEntries(
  items: readonly RawOutlineItem[],
  depth: number,
  path: string,
  doc: DestinationResolver,
): Promise<TocEntry[]> {
  const entries: TocEntry[] = [];

  for (const [index, item] of items.entries()) {
    const id = `${path}${index}`;
    entries.push({
      id,
      title: item.title,
      page: await resolvePage(item.dest, doc),
      depth,
      children: await toTocEntries(item.items ?? [], depth + 1, `${id}.`, doc),
    });
  }

  return entries;
}

export async function extractDocument(data: Uint8Array): Promise<ExtractedDocument> {
  // pdf.js は渡した Uint8Array を破棄するため、呼び出し側のバッファを守る意味でも複製する
  const loadingTask = getDocument({ data: new Uint8Array(data) });
  const doc = await loadingTask.promise;

  try {
    const pages: ExtractedPage[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const handle = await doc.getPage(page);
      const content = await handle.getTextContent();
      const items = content.items.filter(
        (item): item is Extract<(typeof content.items)[number], { str: string }> => 'str' in item,
      );
      pages.push({ page, ...buildPageText(items) });
      handle.cleanup();
    }

    const outline = (await doc.getOutline()) as RawOutlineItem[] | null;
    return {
      pageCount: doc.numPages,
      pages,
      toc: await toTocEntries(outline ?? [], 0, '', doc),
    };
  } finally {
    await loadingTask.destroy();
  }
}
