/**
 * Claude Agent SDK のメッセージを、UI が扱う最小のイベントへ翻訳する。
 *
 * SDK のメッセージ型は広く、バージョンごとに種類が増えていく。UI をそこへ直接つなぐと、
 * SDK の更新がそのまま UI の改修になる。ここで細い境界に絞る。
 *
 * 入力を `unknown` として受け、必要な部分だけを実行時に確かめて読む。
 * SDK の型に構造ごと依存すると、知らない種類が増えるたびに型が壊れるうえ、
 * テストのために巨大なオブジェクトを組み立てる羽目になるため。
 */

export type AgentEvent =
  /** 本文の差分。ストリーミング表示に使う */
  | { readonly type: 'text'; readonly text: string }
  /** ツールの実行開始。要件 3.2 の「ツール実行状況の可視化」 */
  | { readonly type: 'tool-start'; readonly id: string; readonly name: string }
  | { readonly type: 'tool-end'; readonly id: string; readonly ok: boolean }
  | { readonly type: 'done'; readonly ok: boolean; readonly error?: string };

type Record_ = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Record_ =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** 本文の差分（content_block_delta / text_delta）だけを拾う */
function textEvents(event: unknown): AgentEvent[] {
  if (!isRecord(event) || event['type'] !== 'content_block_delta') return [];
  const delta = event['delta'];
  if (!isRecord(delta) || delta['type'] !== 'text_delta') return [];
  const text = asString(delta['text']);
  return text ? [{ type: 'text', text }] : [];
}

function contentBlocks(message: unknown): readonly unknown[] {
  if (!isRecord(message)) return [];
  const content = message['content'];
  return Array.isArray(content) ? content : [];
}

function toolStartEvents(message: unknown): AgentEvent[] {
  return contentBlocks(message).flatMap((block) => {
    if (!isRecord(block) || block['type'] !== 'tool_use') return [];
    const id = asString(block['id']);
    const name = asString(block['name']);
    return id && name ? [{ type: 'tool-start' as const, id, name }] : [];
  });
}

function toolEndEvents(message: unknown): AgentEvent[] {
  return contentBlocks(message).flatMap((block) => {
    if (!isRecord(block) || block['type'] !== 'tool_result') return [];
    const id = asString(block['tool_use_id']);
    return id ? [{ type: 'tool-end' as const, id, ok: block['is_error'] !== true }] : [];
  });
}

function resultEvent(message: Record_): AgentEvent {
  if (message['subtype'] === 'success' && message['is_error'] !== true) {
    return { type: 'done', ok: true };
  }
  return { type: 'done', ok: false, error: describeResultError(message['subtype']) };
}

function describeResultError(subtype: unknown): string {
  switch (subtype) {
    case 'error_max_turns':
      return 'ターン数の上限に達しました';
    case 'error_max_budget_usd':
      return '費用の上限に達しました';
    case 'error_during_execution':
      return '実行中にエラーが発生しました';
    default:
      return '応答を完了できませんでした';
  }
}

/** 1つの SDK メッセージから、0個以上の UI イベントを取り出す */
export function toAgentEvents(message: unknown): AgentEvent[] {
  if (!isRecord(message)) return [];

  switch (message['type']) {
    case 'stream_event':
      return textEvents(message['event']);
    // 完成した本文は stream_event 側で流し済みなので、ここではツールの開始だけを拾う
    case 'assistant':
      return toolStartEvents(message['message']);
    case 'user':
      return toolEndEvents(message['message']);
    case 'result':
      return [resultEvent(message)];
    default:
      return [];
  }
}
