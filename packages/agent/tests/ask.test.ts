import { describe, expect, it } from 'vitest';
import { ALLOWED_TOOLS, askAboutSelection, type QueryFn } from '../src/ask.js';

const textDelta = (text: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
});
const toolUse = (id: string, name: string) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name }] },
});
const toolResult = (toolUseId: string) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: toolUseId }] },
});
const success = () => ({ type: 'result', subtype: 'success', is_error: false });

const context = { page: 1, quote: 'トレースを記録する', question: 'なぜ？' };
const budget = { maxContextChars: 8000 };

/** 渡されたメッセージを順に流す偽の query */
function fakeQuery(messages: unknown[], onCall?: (params: unknown) => void): QueryFn {
  return (params) => {
    onCall?.(params);
    return (async function* () {
      for (const message of messages) yield message;
    })();
  };
}

describe('askAboutSelection', () => {
  it('SDK のメッセージを UI のイベント列に変換して流す', async () => {
    const events = [];
    for await (const event of askAboutSelection({
      context,
      budget,
      queryFn: fakeQuery([
        textDelta('まず'),
        toolUse('t1', 'WebSearch'),
        toolResult('t1'),
        textDelta('結論'),
        success(),
      ]),
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'text', text: 'まず' },
      { type: 'tool-start', id: 't1', name: 'WebSearch' },
      { type: 'tool-end', id: 't1', ok: true },
      { type: 'text', text: '結論' },
      { type: 'done', ok: true },
    ]);
  });

  it('組み立てたプロンプトと、読み取り専用のツール設定を渡す', async () => {
    let params:
      | { prompt: string; options?: { allowedTools?: string[]; includePartialMessages?: boolean } }
      | undefined;
    const stream = askAboutSelection({
      context,
      budget,
      queryFn: fakeQuery([success()], (p) => {
        params = p as typeof params;
      }),
    });
    for await (const _ of stream) {
      // 消費するだけ
    }

    expect(params?.prompt).toContain('トレースを記録する');
    expect(params?.prompt).toContain('なぜ？');
    expect(params?.options?.allowedTools).toEqual([...ALLOWED_TOOLS]);
    expect(params?.options?.includePartialMessages).toBe(true);
  });

  it('ファイルシステムやシェルのツールは許可しない（ADR-0007）', () => {
    for (const forbidden of ['Bash', 'Write', 'Edit', 'Read', 'Glob', 'Grep']) {
      expect(ALLOWED_TOOLS).not.toContain(forbidden);
    }
  });

  it('中断されたら途中で止める', async () => {
    const controller = new AbortController();
    const events = [];

    for await (const event of askAboutSelection({
      context,
      budget,
      signal: controller.signal,
      queryFn: fakeQuery([textDelta('1'), textDelta('2'), textDelta('3'), success()]),
    })) {
      events.push(event);
      if (events.length === 2) controller.abort();
    }

    expect(events).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: 'text', text: '2' });
  });

  it('最初から中断済みなら SDK に中断を伝える', async () => {
    const controller = new AbortController();
    controller.abort();
    let aborted: boolean | undefined;

    const stream = askAboutSelection({
      context,
      budget,
      signal: controller.signal,
      queryFn: fakeQuery([success()], (params) => {
        aborted = (params as { options?: { abortController?: AbortController } }).options
          ?.abortController?.signal.aborted;
      }),
    });
    for await (const _ of stream) {
      // 消費するだけ
    }

    expect(aborted).toBe(true);
  });
});
