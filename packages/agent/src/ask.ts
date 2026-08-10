/**
 * 選択範囲を起点にした問い合わせ。
 *
 * SDK の query は差し替えられるようにしてある。実際に Claude を呼ばずに
 * ストリーミングと中断の振る舞いを検証するため（要件 5 のキャンセル可能性）。
 */
import { type Options, query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent } from './events.js';
import { toAgentEvents } from './events.js';
import {
  buildSelectionPrompt,
  type PromptBudget,
  type SelectionContext,
  SYSTEM_PROMPT,
} from './prompt.js';

/**
 * Phase 1 で許可するツール。読み取り専用のものだけに絞る。
 * ファイルシステムとシェルは、権限方針を決める Phase 2 まで開けない。
 */
export const PHASE1_ALLOWED_TOOLS = ['WebSearch', 'WebFetch'] as const;

/**
 * SDK の query と同じ形。メッセージは unknown として受ける。
 * 種類を絞り込むのは events.ts の役目で、ここは素通しさせるだけ。
 */
export type QueryFn = (params: { prompt: string; options?: Options }) => AsyncIterable<unknown>;

export interface AskOptions {
  readonly context: SelectionContext;
  readonly budget: PromptBudget;
  readonly signal?: AbortSignal;
  readonly model?: string;
  /** テストや別実装の差し込み口。既定は Claude Agent SDK の query */
  readonly queryFn?: QueryFn;
}

export async function* askAboutSelection(options: AskOptions): AsyncGenerator<AgentEvent> {
  const run = options.queryFn ?? query;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();

  const sdkOptions: Options = {
    abortController: controller,
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: [...PHASE1_ALLOWED_TOOLS],
    includePartialMessages: true, // ストリーミング表示に必要
    maxTurns: 8,
    ...(options.model ? { model: options.model } : {}),
  };

  try {
    for await (const message of run({
      prompt: buildSelectionPrompt(options.context, options.budget),
      options: sdkOptions,
    })) {
      for (const event of toAgentEvents(message)) {
        yield event;
      }
      if (controller.signal.aborted) return;
    }
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
}
