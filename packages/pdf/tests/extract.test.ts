import { describe, expect, it } from 'vitest';
import { extractDocument } from '../src/extract.js';
import { renderQuote, sliceRange } from '../src/text.js';
import { buildMinimalPdf } from './helpers/minimal-pdf.js';

describe('extractDocument', () => {
  it('ページ数と各ページの本文を返す', async () => {
    const pdf = buildMinimalPdf([['Hello ReadAgent', 'second line'], ['page two here']]);

    const doc = await extractDocument(pdf);

    expect(doc.pageCount).toBe(2);
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0]?.page).toBe(1);
    expect(doc.pages[0]?.text).toContain('Hello ReadAgent');
    expect(doc.pages[0]?.text).toContain('second line');
    expect(doc.pages[1]?.text).toContain('page two here');
  });

  it('本文に改行を含めない（アンカーの土台をぶらさないため）', async () => {
    const doc = await extractDocument(buildMinimalPdf([['first line', 'second line']]));

    expect(doc.pages[0]?.text).not.toContain('\n');
  });

  it('行の区切りから引用を復元できる', async () => {
    const doc = await extractDocument(buildMinimalPdf([['first line', 'second line']]));
    const page = doc.pages[0];
    if (!page) throw new Error('page missing');

    expect(page.lineBreaks.length).toBeGreaterThan(0);
    expect(renderQuote(page, 0, page.text.length)).toBe('first line\nsecond line');
    expect(sliceRange(page, 0, page.text.length)).toBe('first linesecond line');
  });

  it('目次が無い PDF では空の目次を返す', async () => {
    const doc = await extractDocument(buildMinimalPdf([['only page']]));

    expect(doc.toc).toEqual([]);
  });

  it('渡したバッファを破壊しない', async () => {
    const pdf = buildMinimalPdf([['keep the buffer intact']]);
    const before = pdf.slice(0, 16);

    await extractDocument(pdf);

    expect(pdf.slice(0, 16)).toEqual(before);
    expect(pdf.byteLength).toBeGreaterThan(0);
  });
});

describe('目次のページ解決', () => {
  it('目次項目を 1 始まりのページ番号つきで返す', async () => {
    const pdf = buildMinimalPdf(
      [['page one'], ['page two'], ['page three']],
      [
        { title: 'Chapter 1', page: 1 },
        { title: 'Chapter 2', page: 3 },
      ],
    );

    const doc = await extractDocument(pdf);

    expect(doc.toc).toHaveLength(2);
    expect(doc.toc[0]).toMatchObject({ title: 'Chapter 1', page: 1, depth: 0 });
    expect(doc.toc[1]).toMatchObject({ title: 'Chapter 2', page: 3, depth: 0 });
  });

  it('目次項目に安定した ID を振る', async () => {
    const pdf = buildMinimalPdf(
      [['a'], ['b']],
      [
        { title: 'First', page: 1 },
        { title: 'Second', page: 2 },
      ],
    );

    const doc = await extractDocument(pdf);

    expect(doc.toc.map((entry) => entry.id)).toEqual(['0', '1']);
  });

  it('目次が無ければ空を返す', async () => {
    const doc = await extractDocument(buildMinimalPdf([['only page']]));

    expect(doc.toc).toEqual([]);
  });
});
