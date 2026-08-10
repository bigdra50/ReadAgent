import { describe, expect, it } from 'vitest';
import { createSseParser } from '../src/lib/chat';

describe('createSseParser', () => {
  it('1つのフレームからイベントを取り出す', () => {
    const parser = createSseParser();

    expect(parser.push('data: {"type":"text","text":"あ"}\n\n')).toEqual([
      { type: 'text', text: 'あ' },
    ]);
  });

  it('チャンクが途中で切れてもイベントを落とさない', () => {
    const parser = createSseParser();

    expect(parser.push('data: {"type":"te')).toEqual([]);
    expect(parser.push('xt","text":"あ"}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ type: 'text', text: 'あ' }]);
  });

  it('1チャンクに複数フレームが入っていても順に返す', () => {
    const parser = createSseParser();

    const events = parser.push(
      'data: {"type":"text","text":"1"}\n\ndata: {"type":"done","ok":true}\n\n',
    );

    expect(events).toEqual([
      { type: 'text', text: '1' },
      { type: 'done', ok: true },
    ]);
  });

  it('壊れたフレームは捨てて、後続は処理する', () => {
    const parser = createSseParser();

    const events = parser.push('data: {壊れている}\n\ndata: {"type":"done","ok":true}\n\n');

    expect(events).toEqual([{ type: 'done', ok: true }]);
  });

  it('data 以外の行は無視する', () => {
    const parser = createSseParser();

    expect(parser.push(': keep-alive\n\n')).toEqual([]);
    expect(parser.push('event: ping\ndata: {"type":"done","ok":true}\n\n')).toEqual([
      { type: 'done', ok: true },
    ]);
  });

  it('未完のフレームは次のチャンクまで持ち越す', () => {
    const parser = createSseParser();

    parser.push('data: {"type":"text","text":"先頭"}\n\ndata: {"type":"text"');
    expect(parser.push(',"text":"続き"}\n\n')).toEqual([{ type: 'text', text: '続き' }]);
  });
});
