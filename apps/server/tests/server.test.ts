import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createReadAgentServer, type LoadedDocument } from '../src/server.js';

const bytes = new TextEncoder().encode('%PDF-1.4 fake');

const loaded: LoadedDocument = {
  bytes,
  document: {
    pageCount: 2,
    pages: [
      { page: 1, text: 'first page text', lineBreaks: [5] },
      { page: 2, text: 'second page text', lineBreaks: [] },
    ],
    toc: [{ id: '0', title: '第1章', page: 0, depth: 0, children: [] }],
  },
};

const server = createReadAgentServer(() => Promise.resolve(loaded));
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
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

  it('本文を含めずに書籍の概要を返す', async () => {
    const response = await fetch(`${base}/api/document`);
    const body = (await response.json()) as { pageCount: number; toc: unknown[] };

    expect(response.status).toBe(200);
    expect(body.pageCount).toBe(2);
    expect(body.toc).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain('first page text');
  });

  it('ページ本文と行の区切りを返す', async () => {
    const response = await fetch(`${base}/api/document/pages/2`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      page: 2,
      text: 'second page text',
      lineBreaks: [],
    });
  });

  it('存在しないページには 404 を返す', async () => {
    const response = await fetch(`${base}/api/document/pages/99`);

    expect(response.status).toBe(404);
  });

  it('PDF 本体をそのまま返す', async () => {
    const response = await fetch(`${base}/api/document/file`);

    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it('未知のパスには 404 を返す', async () => {
    const response = await fetch(`${base}/api/unknown`);

    expect(response.status).toBe(404);
  });
});

describe('読み込みが失敗したとき', () => {
  it('プロセスを落とさず 500 とメッセージを返す', async () => {
    const failing = createReadAgentServer(() => Promise.reject(new Error('PDF が壊れています')));
    await new Promise<void>((resolve) => failing.listen(0, '127.0.0.1', resolve));
    const { port } = failing.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/api/document`);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'PDF が壊れています' });

    await new Promise<void>((resolve, reject) =>
      failing.close((error) => (error ? reject(error) : resolve())),
    );
  });
});
