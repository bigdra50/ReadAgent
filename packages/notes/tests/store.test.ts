import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileNoteStore, createMemoryNoteStore, resolveNotePath } from '../src/store.js';

const draft = (page: number) => ({
  anchor: { page, start: 0, end: 5 },
  quote: `${page}ページの引用`,
  createdAt: '2026-08-10T00:00:00.000Z',
});

describe('resolveNotePath', () => {
  it('書籍ディレクトリの内側に解決する', () => {
    expect(resolveNotePath('/books/a', 'notes.md')).toBe('/books/a/notes.md');
    expect(resolveNotePath('/books/a', 'sub/notes.md')).toBe('/books/a/sub/notes.md');
  });

  it('外を指す相対パスを拒む', () => {
    expect(() => resolveNotePath('/books/a', '../other/notes.md')).toThrow();
    expect(() => resolveNotePath('/books/a', '../../etc/passwd')).toThrow();
  });

  it('絶対パスを拒む', () => {
    expect(() => resolveNotePath('/books/a', '/etc/passwd')).toThrow();
  });
});

describe('createFileNoteStore', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'readagent-notes-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('ノートが無ければ空を返す', async () => {
    const store = createFileNoteStore({ baseDir: dir, notePath: 'notes.md' });

    await expect(store.read()).resolves.toBe('');
  });

  it('追記してファイルに書き出す', async () => {
    const store = createFileNoteStore({ baseDir: dir, notePath: 'notes.md', bookTitle: '本' });

    const { path } = await store.append(draft(1));

    expect(path).toBe(join(dir, 'notes.md'));
    await expect(readFile(path, 'utf8')).resolves.toContain('1ページの引用');
  });

  it('存在しない下位ディレクトリを作る', async () => {
    const store = createFileNoteStore({ baseDir: dir, notePath: 'notes/book.md' });

    const { path } = await store.append(draft(1));

    await expect(readFile(path, 'utf8')).resolves.toContain('1ページの引用');
  });

  it('連続した追記でエントリを落とさない', async () => {
    const store = createFileNoteStore({ baseDir: dir, notePath: 'notes.md', bookTitle: '本' });

    await Promise.all([1, 2, 3, 4, 5].map((page) => store.append(draft(page))));

    const content = await store.read();
    for (const page of [1, 2, 3, 4, 5]) {
      expect(content).toContain(`${page}ページの引用`);
    }
  });

  it('利用者が手で書いた内容を残す', async () => {
    await writeFile(join(dir, 'notes.md'), '# 自分のメモ\n\n消えたら困る\n', 'utf8');
    const store = createFileNoteStore({ baseDir: dir, notePath: 'notes.md' });

    await store.append(draft(1));

    await expect(store.read()).resolves.toContain('消えたら困る');
  });
});

describe('createMemoryNoteStore', () => {
  it('永続化せずに同じ振る舞いをする', async () => {
    const store = createMemoryNoteStore();

    await store.append(draft(7));

    expect(store.content()).toContain('7ページの引用');
    await expect(store.read()).resolves.toContain('7ページの引用');
  });
});
