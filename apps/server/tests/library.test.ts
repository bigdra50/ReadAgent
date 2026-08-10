import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bookId,
  createFileLibrary,
  findBooks,
  isDirectory,
  isReadablePdf,
} from '../src/library.js';

describe('bookId', () => {
  it('パスから決まり、同じパスなら同じIDになる', () => {
    expect(bookId('/books/型システム入門.pdf')).toBe(bookId('/books/型システム入門.pdf'));
  });

  it('別の書籍は別のIDになる', () => {
    expect(bookId('/books/a.pdf')).not.toBe(bookId('/books/b.pdf'));
  });

  it('同じ名前でも置き場所が違えば別のIDになる', () => {
    expect(bookId('/one/a.pdf')).not.toBe(bookId('/two/a.pdf'));
  });

  it('URL に載せられる文字だけになる', () => {
    expect(bookId('/books/型システム 入門 (第2版).pdf')).toMatch(/^[a-z0-9-]+$/);
    expect(bookId('/books/Type Systems (2nd ed).pdf')).toMatch(/^[a-z0-9-]+$/);
  });

  it('日本語の書名でも衝突しない', () => {
    expect(bookId('/books/型システム入門.pdf')).not.toBe(bookId('/books/実践入門.pdf'));
  });

  it('相対パスと絶対パスで同じIDになる（同じ書籍を二重に持たない）', () => {
    expect(bookId('./a.pdf')).toBe(bookId(join(process.cwd(), 'a.pdf')));
  });
});

describe('ファイルを見るライブラリ', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'readagent-lib-'));
    await writeFile(join(dir, 'a.pdf'), '%PDF-1.4', 'utf8');
    await writeFile(join(dir, 'b.pdf'), '%PDF-1.4', 'utf8');
    await writeFile(join(dir, 'notes.md'), '# メモ', 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('ディレクトリ直下の PDF だけを書籍として拾う', async () => {
    const found = await findBooks(dir);

    expect(found).toHaveLength(2);
    expect(found.every((path) => path.endsWith('.pdf'))).toBe(true);
  });

  it('書籍一覧をIDとタイトルで返す', async () => {
    const library = createFileLibrary({ dir });

    const books = await library.list();

    expect(books.map((book) => book.title).sort()).toEqual(['a', 'b']);
    expect(new Set(books.map((book) => book.id)).size).toBe(2);
  });

  it('IDで書籍を引ける', async () => {
    const library = createFileLibrary({ dir });
    const [first] = await library.list();

    const handle = await library.get(first?.id ?? '');

    expect(handle?.ref).toEqual(first);
    expect(handle?.config.notePath).toBe('notes.md');
  });

  it('知らないIDには undefined を返す', async () => {
    const library = createFileLibrary({ dir });

    await expect(library.get('存在しない')).resolves.toBeUndefined();
  });

  it('起動後に足された書籍も引ける', async () => {
    const library = createFileLibrary({ dir });
    await library.list();

    await writeFile(join(dir, 'c.pdf'), '%PDF-1.4', 'utf8');
    const added = await library.get(bookId(join(dir, 'c.pdf')));

    expect(added?.ref.title).toBe('c');
  });

  it('パスを直接指定しても扱える', async () => {
    const library = createFileLibrary({ paths: [join(dir, 'a.pdf')] });

    const books = await library.list();

    expect(books).toHaveLength(1);
    expect(books[0]?.title).toBe('a');
  });
});

describe('パスの判定', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'readagent-path-'));
    await writeFile(join(dir, 'book.pdf'), '%PDF', 'utf8');
    await writeFile(join(dir, 'note.md'), 'x', 'utf8');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('PDF ファイルを見分ける', async () => {
    await expect(isReadablePdf(join(dir, 'book.pdf'))).resolves.toBe(true);
    await expect(isReadablePdf(join(dir, 'note.md'))).resolves.toBe(false);
    await expect(isReadablePdf(join(dir, '無い.pdf'))).resolves.toBe(false);
    await expect(isReadablePdf(dir)).resolves.toBe(false);
  });

  it('ディレクトリを見分ける', async () => {
    await expect(isDirectory(dir)).resolves.toBe(true);
    await expect(isDirectory(join(dir, 'book.pdf'))).resolves.toBe(false);
  });
});
