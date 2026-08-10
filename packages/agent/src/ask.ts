/**
 * 選択範囲を起点にした問い合わせ。
 *
 * SDK の query は差し替えられるようにしてある。実際に Claude を呼ばずに
 * ストリーミングと中断の振る舞いを検証するため（要件 5 のキャンセル可能性）。
 */
import { type Options, query } from '@anthropic-ai/claude-agent-sdk';
import type { Granularity, UpdateMode } from '@readagent/core';
import type { AgentEvent } from './events.js';
import { toAgentEvents } from './events.js';
import { createNoteToolServer, type NoteRecorder, type NoteToolContext } from './notes.js';
import {
  buildSelectionPrompt,
  GRANULARITY_GUIDANCE,
  type PromptBudget,
  type SelectionContext,
  SYSTEM_PROMPT,
} from './prompt.js';

/**
 * 許可するツール。読み取り専用の外部参照だけに絞る（ADR-0007）。
 * ファイルシステムとシェルは渡さない。書き込みはノート更新ツールのみ。
 */
export const ALLOWED_TOOLS = ['WebSearch', 'WebFetch'] as const;

/**
 * SDK の query と同じ形。メッセージは unknown として受ける。
 * 種類を絞り込むのは events.ts の役目で、ここは素通しさせるだけ。
 */
export type QueryFn = (params: { prompt: string; options?: Options }) => AsyncIterable<unknown>;

export interface NoteIntegration {
  readonly updateMode: UpdateMode;
  readonly granularity: Granularity;
  readonly recorder: NoteRecorder;
  readonly context: NoteToolContext;
}

export interface AskOptions {
  readonly context: SelectionContext;
  readonly budget: PromptBudget;
  readonly signal?: AbortSignal;
  readonly model?: string;
  /** ノート更新の設定。省略するとノートは更新しない */
  readonly notes?: NoteIntegration;
  /** テストや別実装の差し込み口。既定は Claude Agent SDK の query */
  readonly queryFn?: QueryFn;
}

export async function* askAboutSelection(options: AskOptions): AsyncGenerator<AgentEvent> {
  const run = options.queryFn ?? query;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();

  // ツールの中で起きたことは、SDK のメッセージには現れない。
  // ここに積んでおき、メッセージの合間に流す。
  const pending: AgentEvent[] = [];
  const notes = options.notes;
  const useTool = notes?.updateMode === 'agent';
  const noteServer = useTool
    ? createNoteToolServer(notes.recorder, notes.context, (result) => {
        pending.push({ type: 'note-updated', path: result.path });
      })
    : null;

  // ノートを書ける場合だけ、粒度の指示を足す。書けないのに粒度を語っても意味がない
  const systemPrompt =
    noteServer && notes
      ? `${SYSTEM_PROMPT}\n\nノートを残すときの粒度: ${GRANULARITY_GUIDANCE[notes.granularity]}`
      : SYSTEM_PROMPT;

  const sdkOptions: Options = {
    abortController: controller,
    systemPrompt,
    allowedTools: [...ALLOWED_TOOLS, ...(noteServer ? [noteServer.toolId] : [])],
    includePartialMessages: true, // ストリーミング表示に必要
    maxTurns: 8,
    ...(noteServer ? { mcpServers: { readagent: noteServer.config } } : {}),
    ...(options.model ? { model: options.model } : {}),
  };

  let answer = '';

  try {
    for await (const message of run({
      prompt: buildSelectionPrompt(options.context, options.budget),
      options: sdkOptions,
    })) {
      for (const event of toAgentEvents(message)) {
        if (event.type === 'text') answer += event.text;
        yield event;
      }
      while (pending.length > 0) {
        const event = pending.shift();
        if (event) yield event;
      }
      if (controller.signal.aborted) return;
    }
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }

  if (controller.signal.aborted) return;

  // always は「毎回必ず更新する」。エージェントが自分で書いた場合は二重に書かない。
  const shouldForce = notes?.updateMode === 'always' && !noteServer?.used();
  if (shouldForce && answer.trim()) {
    yield { type: 'note-start' };
    try {
      const result = await notes.recorder.append({
        anchor: notes.context.anchor,
        quote: notes.context.quote,
        answer,
        createdAt: (notes.context.now ?? (() => new Date()))().toISOString(),
        ...(notes.context.question ? { question: notes.context.question } : {}),
      });
      yield { type: 'note-updated', path: result.path };
    } catch (error) {
      // ノートに書けなくても、読者はすでに回答を受け取っている（要件 5）
      yield { type: 'note-failed', error: error instanceof Error ? error.message : String(error) };
    }
  }
}
