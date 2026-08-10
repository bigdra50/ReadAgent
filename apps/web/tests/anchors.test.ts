import { describe, expect, it } from 'vitest';
import { buildAnchors, locateOffset, offsetOf, toRange } from '../src/lib/anchors';

const items = [{ str: 'Hello ' }, { str: '' }, { str: 'world' }, { str: '!' }];

describe('buildAnchors', () => {
  it('空のアイテムには範囲を作らないが、オフセットは進める', () => {
    const anchors = buildAnchors(items);

    expect(anchors).toEqual([
      { start: 0, length: 6 },
      { start: 6, length: 5 },
      { start: 11, length: 1 },
    ]);
  });
});

describe('locateOffset', () => {
  const anchors = buildAnchors(items);

  it('本文のオフセットをノード内の位置に変換する', () => {
    expect(locateOffset(anchors, 0)).toEqual({ index: 0, offset: 0 });
    expect(locateOffset(anchors, 7)).toEqual({ index: 1, offset: 1 });
  });

  it('終端はノード末尾に一致する位置を許す', () => {
    expect(locateOffset(anchors, 6, 'end')).toEqual({ index: 0, offset: 6 });
    expect(locateOffset(anchors, 6, 'start')).toEqual({ index: 1, offset: 0 });
  });

  it('範囲外は null を返す', () => {
    expect(locateOffset(anchors, 12)).toBeNull();
    expect(locateOffset(anchors, -1)).toBeNull();
  });
});

describe('往復', () => {
  const anchors = buildAnchors(items);
  const text = items.map((i) => i.str).join('');

  it('すべてのオフセットで往復が一致する', () => {
    for (let offset = 0; offset < text.length; offset++) {
      const position = locateOffset(anchors, offset);
      expect(position, `offset ${offset}`).not.toBeNull();
      if (position) expect(offsetOf(anchors, position)).toBe(offset);
    }
  });

  it('端を逆順に渡しても正規化される', () => {
    const forward = toRange(anchors, { index: 0, offset: 0 }, { index: 2, offset: 1 });
    const backward = toRange(anchors, { index: 2, offset: 1 }, { index: 0, offset: 0 });

    expect(forward).toEqual({ start: 0, end: 12 });
    expect(backward).toEqual(forward);
  });

  it('存在しないノードには null を返す', () => {
    expect(offsetOf(anchors, { index: 99, offset: 0 })).toBeNull();
  });
});
