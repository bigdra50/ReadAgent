/**
 * ローカル完結版のサーバー（ADR-0004）。
 *
 * 現時点の責務は「PDFの本文と目次を返す」ことだけ。
 * Claude Agent SDK の中継はこのプロセスに載せる予定で、その理由も ADR-0004 にある。
 *
 * 読み込みは引数で差し替えられるようにしてある。HTTP の振る舞いを、
 * 実ファイルと pdf.js を用意せずに検証できるようにするため。
 */

import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { type ExtractedDocument, extractDocument } from '@readagent/pdf';

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

export function createReadAgentServer(loadDocument: DocumentLoader): Server {
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
