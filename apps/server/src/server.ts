/**
 * ローカル完結版のサーバー（ADR-0004）。
 *
 * 書籍の提供・ノート・エージェントへの中継を担う。
 * 書籍の探索は Library に、エージェント呼び出しは AskFn に閉じてあり、
 * どちらも差し替えられる。ローカル完結と将来のサーバー化を両立するための境界（ADR-0003）。
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { type AgentEvent, askAboutSelection, summarizeNotes } from '@readagent/agent';
import { parseEntries } from '@readagent/notes';
import { buildContext, parseChatRequest, parseSummarizeRequest, streamEvents } from './chat.js';
import type { BookHandle, Library } from './library.js';
import { searchNotes } from './search.js';

/** ローカル完結が前提。認証を入れるまで外に出さない（ADR-0004） */
export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 5174;

type AskInput = Pick<Parameters<typeof askAboutSelection>[0], 'context' | 'budget' | 'notes'> & {
  readonly signal: AbortSignal;
};

/** 選択範囲を起点にエージェントへ問い合わせる関数。テストでは差し替える */
export type AskFn = (input: AskInput) => AsyncIterable<AgentEvent>;

const defaultAsk: AskFn = (input) => askAboutSelection(input);

type SummarizeInput = Pick<
  Parameters<typeof summarizeNotes>[0],
  'entries' | 'bookTitle' | 'recorder' | 'maxContextChars'
> & { readonly signal: AbortSignal };

/** ノートの再構成。テストでは差し替える */
export type SummarizeFn = (input: SummarizeInput) => AsyncIterable<AgentEvent>;

const defaultSummarize: SummarizeFn = (input) => summarizeNotes(input);

export interface ServerDeps {
  readonly library: Library;
  readonly ask?: AskFn;
  readonly summarize?: SummarizeFn;
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

/** `/api/books/:id/...` から書籍IDと残りのパスを取り出す */
function matchBookRoute(pathname: string): { id: string; rest: string } | null {
  const match = /^\/api\/books\/([^/]+)(\/.*)?$/.exec(pathname);
  const id = match?.[1];
  if (!id) return null;
  return { id: decodeURIComponent(id), rest: match?.[2] ?? '' };
}

export function createReadAgentServer(deps: ServerDeps): Server {
  const { library, ask = defaultAsk, summarize = defaultSummarize } = deps;

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

      if (url.pathname === '/api/books') {
        return json(200, { books: await library.list() });
      }

      if (url.pathname === '/api/search') {
        const hits = await searchNotes(library, url.searchParams.get('q') ?? '');
        return json(200, { hits });
      }

      const route = matchBookRoute(url.pathname);
      if (!route) return json(404, { error: 'not found' });

      const book = await library.get(route.id);
      if (!book) return json(404, { error: 'book not found' });

      return await handleBookRoute({ req, res, json, book, rest: route.rest, ask, summarize });
    } catch (error) {
      // 1冊の読み込み失敗でプロセスを落とさない。読書側でリトライできるようにする（要件 5）
      const message = error instanceof Error ? error.message : String(error);
      return json(500, { error: message });
    }
  });
}

interface BookRouteInput {
  readonly req: IncomingMessage;
  readonly res: import('node:http').ServerResponse;
  readonly json: (status: number, body: unknown) => void;
  readonly book: BookHandle;
  readonly rest: string;
  readonly ask: AskFn;
  readonly summarize: SummarizeFn;
}

async function handleBookRoute({ req, res, json, book, rest, ask, summarize }: BookRouteInput) {
  if (rest === '/document' || rest === '') {
    const { document } = await book.load();
    // 解決済みの設定も返す。UI から一時上書きするとき、いまの値を出発点にできる
    return json(200, {
      ...book.ref,
      pageCount: document.pageCount,
      toc: document.toc,
      config: book.config,
    });
  }

  const pageMatch = /^\/pages\/(\d+)$/.exec(rest);
  if (pageMatch?.[1]) {
    const { document } = await book.load();
    const page = document.pages[Number(pageMatch[1]) - 1];
    return page ? json(200, page) : json(404, { error: 'page not found' });
  }

  if (rest === '/file') {
    const { bytes } = await book.load();
    res.writeHead(200, { 'content-type': 'application/pdf' });
    return res.end(bytes);
  }

  if (rest === '/notes') {
    // ノートペインは読書中いつでも開ける（要件 4）
    return json(200, { markdown: await book.notes.read() });
  }

  if (rest === '/summarize' && req.method === 'POST') {
    const range = parseSummarizeRequest(await readJsonBody(req));
    if ('error' in range) return json(400, range);

    const all = parseEntries(await book.notes.read());
    // 範囲が指定されていれば、その章のエントリだけをまとめる
    const entries = range.fromPage
      ? all.filter(
          (entry) =>
            entry.anchor.page >= (range.fromPage ?? 0) &&
            entry.anchor.page <= (range.toPage ?? Number.POSITIVE_INFINITY),
        )
      : all;

    const controller = new AbortController();
    res.on('close', () => controller.abort());

    return streamEvents(
      res,
      summarize({
        entries,
        bookTitle: range.title ? `${book.ref.title} / ${range.title}` : book.ref.title,
        recorder: book.notes,
        maxContextChars: book.config.maxContextChars,
        signal: controller.signal,
      }),
    );
  }

  if (rest === '/chat' && req.method === 'POST') {
    const parsed = parseChatRequest(await readJsonBody(req));
    if ('error' in parsed) return json(400, parsed);

    const { document } = await book.load();
    const pageText = document.pages[parsed.page - 1];
    if (!pageText) return json(404, { error: 'page not found' });

    // 読者が画面を閉じた・次の質問に移った時点で、走っている問い合わせを止める。
    // 監視するのは req ではなく res。本文を読み切った時点で req の close は
    // すでに発火しており、そこに登録しても切断を拾えない。
    const controller = new AbortController();
    res.on('close', () => controller.abort());

    const { context, budget, noteContext, updateMode, granularity } = buildContext(
      pageText,
      parsed,
      book.config,
    );

    return streamEvents(
      res,
      ask({
        context,
        budget,
        signal: controller.signal,
        notes: { updateMode, granularity, recorder: book.notes, context: noteContext },
      }),
    );
  }

  return json(404, { error: 'not found' });
}
