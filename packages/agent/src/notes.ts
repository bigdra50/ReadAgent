/**
 * ノート更新のカスタムツール（要件 3.3）。
 *
 * 書き込み先はサーバー側で解決したノート1つに固定し、パスを引数で受け取らない。
 * エージェントが書き込み先を選べる設計にすると、本文に仕込まれた指示で
 * 任意のファイルを書き換えられる（ADR-0007）。技術書のPDFは信頼できない入力として扱う。
 */
import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  tool,
} from '@anthropic-ai/claude-agent-sdk';
import type { NoteAnchor, NoteEntryDraft } from '@readagent/notes';
import { z } from 'zod';

/** ノートに追記できるもの。@readagent/notes の NoteStore がそのまま満たす */
export interface NoteRecorder {
  append(entry: NoteEntryDraft): Promise<{ path: string }>;
}

export const NOTE_SERVER_NAME = 'readagent';
export const NOTE_TOOL_NAME = 'update_note';
/** allowedTools に渡す名前。SDK の MCP ツールは mcp__<server>__<tool> になる */
export const NOTE_TOOL_ID = `mcp__${NOTE_SERVER_NAME}__${NOTE_TOOL_NAME}`;

export interface NoteToolContext {
  readonly anchor: NoteAnchor;
  /** 引用は本文から切り出したものを使う。エージェントに書かせない */
  readonly quote: string;
  readonly question?: string;
  readonly now?: () => Date;
}

/**
 * ツール定義のうち、外から確かめたい部分だけ。
 * SDK の総称型をそのまま公開すると、スキーマの型引数が呼び出し側に漏れる。
 */
export interface NoteToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  // SDK は省略された引数も undefined として渡すため、tags は「必須だが undefined を取りうる」
  handler(
    args: { summary: string; tags: string[] | undefined },
    extra: unknown,
  ): Promise<{ content: unknown[]; isError?: boolean | undefined }>;
}

export interface NoteToolServer {
  readonly config: McpSdkServerConfigWithInstance;
  readonly toolId: string;
  /** ツール定義そのもの。振る舞いを直接検証できるように公開している */
  readonly definition: NoteToolDefinition;
  /** ツールが実際に呼ばれたか。always モードの二重書き込みを避けるために見る */
  used(): boolean;
}

export function createNoteToolServer(
  recorder: NoteRecorder,
  context: NoteToolContext,
  onRecorded?: (result: { path: string }) => void,
): NoteToolServer {
  let used = false;
  const now = context.now ?? (() => new Date());

  const updateNote = tool(
    NOTE_TOOL_NAME,
    [
      '読書ノートに、いま話している箇所の記録を追記する。',
      '引用と位置は自動で入るので、要点・補足・図解（Mermaid）だけを渡すこと。',
      '読者にとって後から読み返す価値があると判断したときに呼ぶ。',
    ].join('\n'),
    {
      summary: z
        .string()
        .describe('ノートに残す内容。要点、補足、図解（Mermaid のコードブロックも可）'),
      tags: z.array(z.string()).optional().describe('分類に使う短いタグ'),
    },
    async (args) => {
      const entry: NoteEntryDraft = {
        anchor: context.anchor,
        quote: context.quote,
        answer: args.summary,
        createdAt: now().toISOString(),
        ...(context.question ? { question: context.question } : {}),
        ...(args.tags?.length ? { tags: args.tags } : {}),
      };

      try {
        const result = await recorder.append(entry);
        used = true;
        onRecorded?.(result);
        return { content: [{ type: 'text' as const, text: 'ノートに追記しました。' }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // ノート更新の失敗で対話まで止めない（要件 5）
        return {
          content: [{ type: 'text' as const, text: `ノートに追記できませんでした: ${message}` }],
          isError: true,
        };
      }
    },
  );

  return {
    config: createSdkMcpServer({ name: NOTE_SERVER_NAME, version: '0.0.0', tools: [updateNote] }),
    toolId: NOTE_TOOL_ID,
    definition: updateNote,
    used: () => used,
  };
}
