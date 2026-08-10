import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { useEffect, useRef } from 'react';
import { buildAnchors, locateOffset, toRange } from '../lib/anchors';

export interface SelectionRange {
  readonly page: number;
  readonly start: number;
  readonly end: number;
}

interface Props {
  readonly page: PDFPageProxy;
  readonly pageNumber: number;
  readonly scale: number;
  readonly onSelect: (range: SelectionRange) => void;
  /** ノートから戻ってきたときに復元する範囲（要件 3.3 の双方向リンク） */
  readonly highlight?: SelectionRange | null;
}

/**
 * pdf.js のテキストレイヤ。
 *
 * ここは **React の管理外の DOM** として扱う（ADR-0005）。
 * span を state で持つと選択のたびに再描画が走り、ブラウザの選択が壊れる。
 * 構築は useEffect の中だけで行い、React には中身を触らせない。
 */
export function TextLayer({ page, pageNumber, scale, onSelect, highlight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const nodes: Text[] = [];

    void (async () => {
      const viewport = page.getViewport({ scale });
      const content = await page.getTextContent();
      if (cancelled) return;

      const items = content.items.flatMap((item) => ('str' in item ? [item] : []));
      const anchors = buildAnchors(items);

      container.replaceChildren();
      container.style.width = `${viewport.width}px`;
      container.style.height = `${viewport.height}px`;

      for (const item of items) {
        if (item.str.length === 0) continue;
        const span = document.createElement('span');
        span.textContent = item.str;
        const tx = Util.transform(viewport.transform, item.transform);
        span.style.left = `${tx[4]}px`;
        span.style.top = `${tx[5] - item.height}px`;
        span.style.fontSize = `${Math.hypot(tx[2], tx[3])}px`;
        container.append(span);
        if (span.firstChild instanceof Text) nodes.push(span.firstChild);
      }

      const handleSelection = () => {
        const selection = document.getSelection();
        // 選択が消えても直前の選択を保持する。質問欄にフォーカスを移した時点で
        // ブラウザの選択は解除されるため、ここで null にすると質問できなくなる。
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        const from = nodes.indexOf(range.startContainer as Text);
        const to = nodes.indexOf(range.endContainer as Text);
        // 本文の外での選択は、この本文ペインの選択ではない
        if (from < 0 || to < 0) return;
        const offsets = toRange(
          anchors,
          { index: from, offset: range.startOffset },
          { index: to, offset: range.endOffset },
        );
        if (offsets) onSelectRef.current({ page: pageNumber, ...offsets });
      };

      document.addEventListener('selectionchange', handleSelection);
      container.dataset.ready = '1';
      cleanup = () => document.removeEventListener('selectionchange', handleSelection);

      // ノートから戻ってきた場合は、保存されたオフセットから選択を組み直す
      if (highlight && highlight.page === pageNumber) {
        const from = locateOffset(anchors, highlight.start, 'start');
        const to = locateOffset(anchors, highlight.end, 'end');
        const startNode = from ? nodes[from.index] : undefined;
        const endNode = to ? nodes[to.index] : undefined;
        if (from && to && startNode && endNode) {
          const range = document.createRange();
          range.setStart(startNode, from.offset);
          range.setEnd(endNode, to.offset);
          const selection = document.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          startNode.parentElement?.scrollIntoView({ block: 'center' });
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      container.replaceChildren();
      delete container.dataset.ready;
    };
  }, [page, pageNumber, scale, highlight]);

  return <div ref={containerRef} className="text-layer" />;
}
