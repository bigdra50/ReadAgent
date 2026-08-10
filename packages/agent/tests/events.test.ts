import { describe, expect, it } from 'vitest';
import { toAgentEvents } from '../src/events.js';

const textDelta = (text: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
});
const toolUse = (id: string, name: string) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name, input: {} }] },
});
const toolResult = (toolUseId: string, isError = false) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError }] },
});

describe('toAgentEvents', () => {
  it('本文の差分をテキストイベントにする', () => {
    expect(toAgentEvents(textDelta('こんにちは'))).toEqual([{ type: 'text', text: 'こんにちは' }]);
  });

  it('空の差分は捨てる', () => {
    expect(toAgentEvents(textDelta(''))).toEqual([]);
  });

  it('本文以外の差分（thinking など）は流さない', () => {
    const thinking = {
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '…' } },
    };

    expect(toAgentEvents(thinking)).toEqual([]);
  });

  it('ツールの使用開始を拾う', () => {
    expect(toAgentEvents(toolUse('t1', 'WebSearch'))).toEqual([
      { type: 'tool-start', id: 't1', name: 'WebSearch' },
    ]);
  });

  it('1メッセージに複数のツール呼び出しがあれば全て拾う', () => {
    const message = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: '調べます' },
          { type: 'tool_use', id: 't1', name: 'WebSearch' },
          { type: 'tool_use', id: 't2', name: 'WebFetch' },
        ],
      },
    };

    expect(toAgentEvents(message)).toEqual([
      { type: 'tool-start', id: 't1', name: 'WebSearch' },
      { type: 'tool-start', id: 't2', name: 'WebFetch' },
    ]);
  });

  it('ツールの結果を成否つきで拾う', () => {
    expect(toAgentEvents(toolResult('t1'))).toEqual([{ type: 'tool-end', id: 't1', ok: true }]);
    expect(toAgentEvents(toolResult('t1', true))).toEqual([
      { type: 'tool-end', id: 't1', ok: false },
    ]);
  });

  it('成功の終了を伝える', () => {
    expect(toAgentEvents({ type: 'result', subtype: 'success', is_error: false })).toEqual([
      { type: 'done', ok: true },
    ]);
  });

  it('失敗は理由つきで終了を伝える', () => {
    expect(toAgentEvents({ type: 'result', subtype: 'error_max_turns', is_error: true })).toEqual([
      { type: 'done', ok: false, error: 'ターン数の上限に達しました' },
    ]);
    expect(toAgentEvents({ type: 'result', subtype: 'なにか新しい失敗' })).toEqual([
      { type: 'done', ok: false, error: '応答を完了できませんでした' },
    ]);
  });

  it('知らない種類のメッセージは無視する（SDK の更新でUIを壊さない）', () => {
    expect(toAgentEvents({ type: 'system', subtype: 'init' })).toEqual([]);
    expect(toAgentEvents({ type: 'これから増える種類' })).toEqual([]);
  });

  it('形の壊れた入力でも落ちない', () => {
    for (const broken of [null, undefined, 42, 'text', [], { noType: true }]) {
      expect(toAgentEvents(broken)).toEqual([]);
    }
    expect(toAgentEvents({ type: 'assistant', message: null })).toEqual([]);
    expect(toAgentEvents({ type: 'user', message: { content: 'not an array' } })).toEqual([]);
    expect(toAgentEvents({ type: 'assistant', message: { content: [null, 3] } })).toEqual([]);
  });
});
