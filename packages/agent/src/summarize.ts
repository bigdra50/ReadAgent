/**
 * 溜まったノートを読み直して、まとめを1件書き足す（要件 6 Phase 4 のノート再構成）。
 *
 * 既存のエントリは書き換えない。再構成とは「読み直して要約を足す」ことであって、
 * 記録の改変ではない（ADR-0009）。
 */
import { type Options, query } from '@anthropic-ai/claude-agent-sdk';
import type { NoteSummaryDraft, ParsedNoteEntry } from '@readagent/notes';
import type { QueryFn } from './ask.js';
import type { AgentEvent } from './events.js';
import { toAgentEvents } from './events.js';

export const SUMMARY_SYSTEM_PROMPT = [
  'あなたは読者が書き溜めた読書ノートを読み直し、通して読める要約を作ります。',
  '',
  '守ること:',
  '- ノートに書かれていることだけを使う。新しい主張を持ち込まない。',
  '- 個々の質問と回答を並べ直すのではなく、話の筋としてまとめる。',
  '- 繰り返し出てくる論点は1つにまとめ、どのページの話かを添える。',
  '- 構造が見えるなら Mermaid の図を1つだけ添えてよい。無理に描かない。',
  '- 日本語で書く。前置きと自己言及はしない。',
].join('\n');

export interface SummarizeRecorder {
  appendSummary(summary: NoteSummaryDraft): Promise<{ path: string }>;
}

export interface SummarizeOptions {
  readonly entries: readonly ParsedNoteEntry[];
  readonly bookTitle: string;
  readonly recorder: SummarizeRecorder;
  /** まとめ全体の文字数上限。ノートが増えても投げる量を抑える（要件 5） */
  readonly maxContextChars: number;
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
  readonly queryFn?: QueryFn;
}

/** ノートのエントリを、要約のための入力テキストに畳む */
export function buildSummaryPrompt(
  entries: readonly ParsedNoteEntry[],
  bookTitle: string,
  maxContextChars: number,
): string {
  const header = `書籍: ${bookTitle}\nこれまでのノート:\n`;
  let body = '';

  for (const entry of entries) {
    const block = [
      `\n--- p.${entry.anchor.page} ${entry.heading}`,
      `引用: ${entry.quote}`,
      entry.body ? `記録: ${entry.body}` : '',
      // タグは整理の手がかりになるので、まとめる側にも渡す
      entry.tags.length > 0 ? `タグ: ${entry.tags.map((tag) => `#${tag}`).join(' ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // 予算を超えたら、そこで打ち切る。全文を投げない（要件 5）
    if (header.length + body.length + block.length > maxContextChars) break;
    body += block;
  }

  return `${header}${body}\n\n上のノートを読み直し、通して読めるまとめを書いてください。`;
}

export async function* summarizeNotes(options: SummarizeOptions): AsyncGenerator<AgentEvent> {
  if (options.entries.length === 0) {
    yield { type: 'done', ok: false, error: 'まとめるノートがありません' };
    return;
  }

  const run = options.queryFn ?? query;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();

  const sdkOptions: Options = {
    abortController: controller,
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    // 既存のノートだけを見て書く。外部を引きに行く必要はない
    allowedTools: [],
    includePartialMessages: true,
    maxTurns: 4,
  };

  let summary = '';

  try {
    for await (const message of run({
      prompt: buildSummaryPrompt(options.entries, options.bookTitle, options.maxContextChars),
      options: sdkOptions,
    })) {
      for (const event of toAgentEvents(message)) {
        if (event.type === 'text') summary += event.text;
        yield event;
      }
      if (controller.signal.aborted) return;
    }
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }

  if (controller.signal.aborted || !summary.trim()) return;

  const pages = options.entries.map((entry) => entry.anchor.page);
  yield { type: 'note-start' };
  try {
    const result = await options.recorder.appendSummary({
      fromPage: Math.min(...pages),
      toPage: Math.max(...pages),
      body: summary,
      createdAt: (options.now ?? (() => new Date()))().toISOString(),
    });
    yield { type: 'note-updated', path: result.path };
  } catch (error) {
    yield { type: 'note-failed', error: error instanceof Error ? error.message : String(error) };
  }
}
