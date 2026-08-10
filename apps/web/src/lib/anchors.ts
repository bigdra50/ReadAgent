/**
 * テキストレイヤの span と、ページ本文のオフセットの対応づけ。
 *
 * ここは DOM を触らない純粋な計算にしてある。選択位置の正しさはこのアプリの土台で、
 * ブラウザを起動しないと検証できない形にすると回帰に気づけないため。
 * 設計の根拠は docs/spike-pdf-text-anchor.md。
 */

/** 1つのテキストノードが受け持つ、ページ本文上の範囲 */
export interface Anchor {
  readonly start: number;
  readonly length: number;
}

export interface AnchorPosition {
  /** anchors 配列上の位置 */
  readonly index: number;
  /** そのテキストノード内のオフセット */
  readonly offset: number;
}

/** テキストアイテムから、span に持たせる範囲の一覧を作る（空文字のアイテムは span を持たない） */
export function buildAnchors(items: readonly { str: string }[]): Anchor[] {
  const anchors: Anchor[] = [];
  let cursor = 0;
  for (const item of items) {
    if (item.str.length > 0) {
      anchors.push({ start: cursor, length: item.str.length });
    }
    cursor += item.str.length;
  }
  return anchors;
}

/**
 * ページ本文上のオフセットを、テキストノード上の位置へ変換する。
 * `edge` が 'end' のときは範囲の終端として扱い、ノード末尾に一致する位置を許す。
 */
export function locateOffset(
  anchors: readonly Anchor[],
  offset: number,
  edge: 'start' | 'end' = 'start',
): AnchorPosition | null {
  for (const [index, anchor] of anchors.entries()) {
    const end = anchor.start + anchor.length;
    const inside =
      edge === 'end'
        ? offset > anchor.start && offset <= end
        : offset >= anchor.start && offset < end;
    if (inside) {
      return { index, offset: offset - anchor.start };
    }
  }
  return null;
}

/** テキストノード上の位置を、ページ本文上のオフセットへ戻す */
export function offsetOf(anchors: readonly Anchor[], position: AnchorPosition): number | null {
  const anchor = anchors[position.index];
  if (!anchor) return null;
  return anchor.start + Math.min(Math.max(position.offset, 0), anchor.length);
}

/** 選択の両端から、正規化した [start, end) を作る。start > end でも入れ替えて返す */
export function toRange(
  anchors: readonly Anchor[],
  from: AnchorPosition,
  to: AnchorPosition,
): { start: number; end: number } | null {
  const a = offsetOf(anchors, from);
  const b = offsetOf(anchors, to);
  if (a === null || b === null) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}
