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
  items?: RawOutlineItem[];
}

/**
 * 目次を TocEntry へ変換する。
 * ページ番号の解決には宛先の解決（dest → page index）が要るが、
 * それは表示側の関心なので Phase 1 では 0 のままにしてある。
 */
function toTocEntries(items: readonly RawOutlineItem[], depth: number, path: string): TocEntry[] {
  return items.map((item, index) => {
    const id = `${path}${index}`;
    return {
      id,
      title: item.title,
      page: 0,
      depth,
      children: toTocEntries(item.items ?? [], depth + 1, `${id}.`),
    };
  });
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
      toc: toTocEntries(outline ?? [], 0, ''),
    };
  } finally {
    await loadingTask.destroy();
  }
}
