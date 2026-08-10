import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createReadAgentServer } from '../src/server.js';
import { memoryLibrary } from './helpers/memory-library.js';

const bytes = new TextEncoder().encode('%PDF-1.4 fake');

const library = memoryLibrary([
  {
    id: 'jit',
    title: 'JIT入門',
    bytes,
    document: {
      pageCount: 2,
      pages: [
        { page: 1, text: 'first page text', lineBreaks: [5] },
        { page: 2, text: 'second page text', lineBreaks: [] },
      ],
      toc: [{ id: '0', title: '第1章', page: 0, depth: 0, children: [] }],
    },
  },
  { id: 'types', title: '型システム入門' },
]);

const server = createReadAgentServer({ library });
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('ReadAgent server', () => {
  it('ヘルスチェックに応じる', async () => {
    const response = await fetch(`${base}/api/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('書籍の一覧を返す', async () => {
    const response = await fetch(`${base}/api/books`);
    const body = (await response.json()) as { books: { id: string; title: string }[] };

    expect(body.books).toHaveLength(2);
    expect(body.books.map((book) => book.title)).toContain('型システム入門');
  });

  it('書籍の概要を本文抜きで返す', async () => {
    const response = await fetch(`${base}/api/books/jit/document`);
    const body = (await response.json()) as { pageCount: number; title: string; toc: unknown[] };

    expect(body.pageCount).toBe(2);
    expect(body.title).toBe('JIT入門');
    expect(body.toc).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('first page text');
  });

  it('ページ本文と行の区切りを返す', async () => {
    const response = await fetch(`${base}/api/books/jit/pages/2`);

    await expect(response.json()).resolves.toEqual({
      page: 2,
      text: 'second page text',
      lineBreaks: [],
    });
  });

  it('PDF 本体をそのまま返す', async () => {
    const response = await fetch(`${base}/api/books/jit/file`);

    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it('知らない書籍には 404 を返す', async () => {
    const response = await fetch(`${base}/api/books/存在しない/document`);

    expect(response.status).toBe(404);
  });

  it('存在しないページには 404 を返す', async () => {
    const response = await fetch(`${base}/api/books/jit/pages/99`);

    expect(response.status).toBe(404);
  });

  it('未知のパスには 404 を返す', async () => {
    expect((await fetch(`${base}/api/unknown`)).status).toBe(404);
    expect((await fetch(`${base}/api/books/jit/unknown`)).status).toBe(404);
  });
});

describe('横断検索', () => {
  it('ノートを書籍またぎで探す', async () => {
    const searchable = memoryLibrary([
      {
        id: 'a',
        title: 'A',
        notes:
          '# A\n\n## p.1 ガードとは？\n\n<!-- readagent:anchor page=1 start=0 end=5 -->\n\n> 引用\n\nトレースの前提\n',
      },
      {
        id: 'b',
        title: 'B',
        notes:
          '# B\n\n## p.9 型とは？\n\n<!-- readagent:anchor page=9 start=1 end=4 -->\n\n> 別の引用\n\n無関係\n',
      },
    ]);
    const searchServer = createReadAgentServer({ library: searchable });
    await new Promise<void>((resolve) => searchServer.listen(0, '127.0.0.1', resolve));
    const port = (searchServer.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/search?q=トレース`);
    const body = (await response.json()) as { hits: { bookId: string; heading: string }[] };

    expect(body.hits).toHaveLength(1);
    expect(body.hits[0]?.bookId).toBe('a');
    expect(body.hits[0]?.heading).toBe('ガードとは？');

    await new Promise<void>((resolve, reject) =>
      searchServer.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('問い合わせが空でも落ちない', async () => {
    const response = await fetch(`${base}/api/search`);

    await expect(response.json()).resolves.toEqual({ hits: [] });
  });
});
