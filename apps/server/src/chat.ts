/**
 * 選択範囲を起点にしたチャットの中継（要件 3.2）。
 *
 * ブラウザから受け取るのはオフセットだけで、引用文そのものは受け取らない。
 * DOM の選択文字列は正規テキストとずれるため（docs/spike-pdf-text-anchor.md）、
 * 引用はサーバー側で本文から切り出す。
 */
import type { ServerResponse } from 'node:http';
import type { AgentEvent } from '@readagent/agent';
import { type PartialNoteConfig, parsePartialNoteConfig, resolveNoteConfig } from '@readagent/core';
import { type PageText, renderQuote, sliceRange } from '@readagent/pdf';

/** 選択の前後から拾う文脈の量。予算の残りに収まる範囲で使う */
const CONTEXT_CHARS = 600;

export interface ChatRequest {
  readonly page: number;
  readonly start: number;
  readonly end: number;
  readonly question?: string;
  /** この問い合わせだけに効く設定（要件 3.4 のスコープ設定・UIからの一時上書き） */
  readonly config?: PartialNoteConfig;
}

export function parseChatRequest(body: unknown): ChatRequest | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'リクエストが不正です' };
  const raw = body as Record<string, unknown>;
  const { page, start, end, question } = raw;

  if (!Number.isInteger(page) || (page as number) < 1) return { error: 'page が不正です' };
  if (!Number.isInteger(start) || (start as number) < 0) return { error: 'start が不正です' };
  if (!Number.isInteger(end) || (end as number) <= (start as number)) {
    return { error: 'end が不正です' };
  }
  if (question !== undefined && typeof question !== 'string') {
    return { error: 'question が不正です' };
  }

  // 一時上書きの検証は core のパーサに任せる。不正な値は捨てて既定に従う
  const overrides = raw.config === undefined ? {} : parsePartialNoteConfig(raw.config).config;

  return {
    page: page as number,
    start: start as number,
    end: end as number,
    ...(typeof question === 'string' ? { question } : {}),
    ...(Object.keys(overrides).length > 0 ? { config: overrides } : {}),
  };
}

/**
 * 選択範囲から、エージェントへ渡す文脈とノート用の文脈を組み立てる。
 * 設定は「グローバル → 書籍 → スコープ」の解決結果を受け取る（要件 3.4）。
 * 現状はサーバー起動時の1層だけを渡している。書籍ごとの設定は Phase 3。
 */
export function buildContext(
  pageText: PageText,
  request: ChatRequest,
  bookConfig?: PartialNoteConfig,
) {
  // 書籍までの解決結果に、この問い合わせだけの上書きを重ねる（後勝ち）
  const config = resolveNoteConfig(bookConfig, request.config);
  const quote = renderQuote(pageText, request.start, request.end);

  return {
    context: {
      page: request.page,
      quote,
      before: sliceRange(pageText, request.start - CONTEXT_CHARS, request.start),
      after: sliceRange(pageText, request.end, request.end + CONTEXT_CHARS),
      ...(request.question ? { question: request.question } : {}),
    },
    budget: { maxContextChars: config.maxContextChars },
    // ノートに残す引用も、エージェントの出力ではなく本文から切り出したものを使う
    noteContext: {
      anchor: { page: request.page, start: request.start, end: request.end },
      quote,
      ...(request.question ? { question: request.question } : {}),
    },
    updateMode: config.updateMode,
    granularity: config.granularity,
  };
}

/**
 * イベント列を SSE として書き出す。
 * 読書とチャットを止めないため、接続が切れた時点で速やかに中断する（要件 5）。
 */
export async function streamEvents(
  res: ServerResponse,
  events: AsyncIterable<AgentEvent>,
): Promise<void> {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  try {
    for await (const event of events) {
      if (res.writableEnded) break;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!res.writableEnded) {
      const failed: AgentEvent = { type: 'done', ok: false, error: message };
      res.write(`data: ${JSON.stringify(failed)}\n\n`);
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
}
