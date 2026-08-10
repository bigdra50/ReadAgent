/**
 * サーバーからの SSE を、UI が扱うイベント列に戻す。
 *
 * 解析はチャンク境界に依存しない純粋な処理として切り出してある。
 * ネットワークの切れ目でイベントを取りこぼすのは、実機でしか出ない上に
 * 再現しにくい種類の不具合なので、ここだけはテストで固定しておく。
 */
import type { AgentEvent } from '@readagent/agent';

export interface SseParser {
  /** 受け取ったチャンクから、完成したイベントだけを返す */
  push(chunk: string): AgentEvent[];
}

export function createSseParser(): SseParser {
  let buffer = '';

  return {
    push(chunk) {
      buffer += chunk;
      const events: AgentEvent[] = [];
      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6))
          .join('\n');
        if (!data) continue;

        try {
          events.push(JSON.parse(data) as AgentEvent);
        } catch {
          // 壊れたフレームは捨てる。1つの取りこぼしで対話全体を落とさない
        }
      }

      return events;
    },
  };
}

export interface ChatRequest {
  readonly page: number;
  readonly start: number;
  readonly end: number;
  readonly question?: string;
}

/** チャットを開始し、届いたイベントを順に流す。signal で中断できる */
export async function* streamChat(
  request: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `チャットを開始できませんでした (${response.status})`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = createSseParser();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(value)) yield event;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
