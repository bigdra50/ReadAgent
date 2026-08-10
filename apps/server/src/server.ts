/**
 * ローカル完結版のサーバー（ADR-0004）。
 *
 * PDFの本文・目次の提供と、選択範囲を起点にしたエージェントへの中継を担う。
 * Agent SDK をこのプロセスに載せる理由は ADR-0004 にある。
 *
 * 読み込みは引数で差し替えられるようにしてある。HTTP の振る舞いを、
 * 実ファイルと pdf.js を用意せずに検証できるようにするため。
 */

import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { type AgentEvent, askAboutSelection } from '@readagent/agent';
import type { PartialNoteConfig } from '@readagent/core';
import type { NoteStore } from '@readagent/notes';
import { type ExtractedDocument, extractDocument } from '@readagent/pdf';
import { buildContext, parseChatRequest, streamEvents } from './chat.js';

/** ローカル完結が前提。認証を入れるまで外に出さない（ADR-0004） */
export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 5174;

export interface LoadedDocument {
  readonly document: ExtractedDocument;
  readonly bytes: Uint8Array;
}

export type DocumentLoader = () => Promise<LoadedDocument>;

/** 抽出は重いので一度だけ行い、プロセスの生存期間中は使い回す */
export function createFileDocumentLoader(pdfPath: string): DocumentLoader {
  let cached: Promise<LoadedDocument> | null = null;
  return () => {
    cached ??= (async () => {
      const bytes = new Uint8Array(await readFile(pdfPath));
      return { document: await extractDocument(bytes), bytes };
    })();
    return cached;
  };
}

type AskInput = Pick<Parameters<typeof askAboutSelection>[0], 'context' | 'budget' | 'notes'> & {
  readonly signal: AbortSignal;
};

/** 選択範囲を起点にエージェントへ問い合わせる関数。テストでは差し替える */
export type AskFn = (input: AskInput) => AsyncIterable<AgentEvent>;

const defaultAsk: AskFn = (input) => askAboutSelection(input);

export interface ServerDeps {
  readonly loadDocument: DocumentLoader;
  /** ノートの保存先。省略するとノートを更新しない */
  readonly notes?: NoteStore;
  /** ノート設定の上書き。既定値は resolveNoteConfig が持つ */
  readonly noteConfig?: PartialNoteConfig;
  readonly ask?: AskFn;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

export function createReadAgentServer(deps: ServerDeps | DocumentLoader): Server {
  const resolved: ServerDeps = typeof deps === 'function' ? { loadDocument: deps } : deps;
  const { loadDocument, notes, noteConfig, ask = defaultAsk } = resolved;

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${HOST}`);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };

    try {
      if (url.pathname === '/api/health') {
        return json(200, { ok: true });
      }

      if (url.pathname === '/api/document') {
        const { document } = await loadDocument();
        return json(200, { pageCount: document.pageCount, toc: document.toc });
      }

      const pageMatch = /^\/api\/document\/pages\/(\d+)$/.exec(url.pathname);
      if (pageMatch?.[1]) {
        const { document } = await loadDocument();
        const page = document.pages[Number(pageMatch[1]) - 1];
        return page ? json(200, page) : json(404, { error: 'page not found' });
      }

      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const parsed = parseChatRequest(await readJsonBody(req));
        if ('error' in parsed) return json(400, parsed);

        const { document } = await loadDocument();
        const pageText = document.pages[parsed.page - 1];
        if (!pageText) return json(404, { error: 'page not found' });

        // 読者が画面を閉じた・次の質問に移った時点で、走っている問い合わせを止める。
        // 監視するのは req ではなく res。本文を読み切った時点で req の close は
        // すでに発火しており、そこに登録しても切断を拾えない。
        const controller = new AbortController();
        res.on('close', () => controller.abort());

        const { context, budget, noteContext, updateMode } = buildContext(
          pageText,
          parsed,
          noteConfig,
        );
        return streamEvents(
          res,
          ask({
            context,
            budget,
            signal: controller.signal,
            ...(notes ? { notes: { updateMode, recorder: notes, context: noteContext } } : {}),
          }),
        );
      }

      if (url.pathname === '/api/document/file') {
        const { bytes } = await loadDocument();
        res.writeHead(200, { 'content-type': 'application/pdf' });
        return res.end(bytes);
      }

      return json(404, { error: 'not found' });
    } catch (error) {
      // 抽出の失敗でプロセスを落とさない。読書側でリトライできるようにする（要件 5）
      const message = error instanceof Error ? error.message : String(error);
      return json(500, { error: message });
    }
  });
}
