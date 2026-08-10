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
  /** この問い合わせだけに効く設定（要件 3.4 のスコープ設定） */
  readonly config?: { updateMode?: string; granularity?: string };
}

/** SSE を読み、イベントに戻して流す */
async function* readEvents(response: Response): AsyncGenerator<AgentEvent> {
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `開始できませんでした (${response.status})`);
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

/** チャットを開始し、届いたイベントを順に流す。signal で中断できる */
export async function* streamChat(
  bookId: string,
  request: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<AgentEvent> {
  yield* readEvents(
    await fetch(`/api/books/${bookId}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    }),
  );
}

export interface SummaryScope {
  readonly fromPage?: number;
  readonly toPage?: number;
  readonly title?: string;
}

/** ノートの再構成を始め、届いたイベントを流す。範囲を渡すと章単位になる */
export async function* streamSummary(
  bookId: string,
  scope: SummaryScope,
  signal: AbortSignal,
): AsyncGenerator<AgentEvent> {
  yield* readEvents(
    await fetch(`/api/books/${bookId}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(scope),
      signal,
    }),
  );
}
