import { describe, expect, it } from 'vitest';
import { buildPageText, renderQuote, sliceRange } from '../src/text.js';

const item = (str: string, hasEOL = false) => ({ str, hasEOL });

describe('buildPageText', () => {
  it('アイテム文字列を連結するだけで、改行は本文に混ぜない', () => {
    const page = buildPageText([item('Hello ', false), item('world', true), item('again', false)]);

    expect(page.text).toBe('Hello worldagain');
    expect(page.text).not.toContain('\n');
  });

  it('行の区切りをオフセットとして記録する', () => {
    const page = buildPageText([item('abc', true), item('de', true), item('f', false)]);

    expect(page.text).toBe('abcdef');
    expect(page.lineBreaks).toEqual([3, 5]);
  });

  it('同じ位置に複数の区切りを記録しない', () => {
    const page = buildPageText([item('abc', true), item('', true), item('d', false)]);

    expect(page.lineBreaks).toEqual([3]);
  });

  it('アイテムが無ければ空になる', () => {
    const page = buildPageText([]);

    expect(page.text).toBe('');
    expect(page.lineBreaks).toEqual([]);
  });
});

describe('sliceRange', () => {
  const page = buildPageText([item('0123456789', false)]);

  it('範囲を切り出す', () => {
    expect(sliceRange(page, 2, 5)).toBe('234');
  });

  it('範囲外は本文の長さに丸める', () => {
    expect(sliceRange(page, -5, 3)).toBe('012');
    expect(sliceRange(page, 8, 100)).toBe('89');
    expect(sliceRange(page, 5, 2)).toBe('');
  });
});

describe('renderQuote', () => {
  it('選択範囲の内側にある区切りだけを改行に戻す', () => {
    const page = buildPageText([item('one', true), item('two', true), item('three', false)]);

    expect(renderQuote(page, 0, 11)).toBe('one\ntwo\nthree');
    expect(renderQuote(page, 3, 6)).toBe('two');
  });

  it('行末ハイフンで割れた語を繋ぐ', () => {
    const page = buildPageText([item('discov-', true), item('ered paths', false)]);

    expect(renderQuote(page, 0, page.text.length)).toBe('discovered paths');
  });

  it('大文字で始まる語は複合語とみなして繋がない', () => {
    const page = buildPageText([item('TCP-', true), item('IP stack', false)]);

    expect(renderQuote(page, 0, page.text.length)).toBe('TCP-\nIP stack');
  });

  it('joinHyphenated を切ると原文のまま返す', () => {
    const page = buildPageText([item('discov-', true), item('ered', false)]);

    expect(renderQuote(page, 0, page.text.length, { joinHyphenated: false })).toBe('discov-\nered');
  });

  it('引用の整形は正規テキストのオフセットに影響しない', () => {
    const page = buildPageText([item('alpha', true), item('beta', false)]);

    expect(page.text).toBe('alphabeta');
    expect(sliceRange(page, 5, 9)).toBe('beta');
    expect(renderQuote(page, 0, 9)).toBe('alpha\nbeta');
  });
});
