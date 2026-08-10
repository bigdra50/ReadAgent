/**
 * ノートの永続化。ファイルに触れるのはここだけで、組み立ては markdown.ts にある。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { appendEntry, type NoteEntryDraft } from './markdown.js';

export interface NoteStore {
  /** ノート全文を読む。まだ無ければ空文字 */
  read(): Promise<string>;
  /** エントリを追記し、書き込んだファイルのパスを返す */
  append(entry: NoteEntryDraft): Promise<{ path: string }>;
}

export interface FileNoteStoreOptions {
  /** 書籍ごとのノートを置くディレクトリ */
  readonly baseDir: string;
  /** baseDir からの相対パス（resolveNoteConfig の notePath） */
  readonly notePath: string;
  readonly bookTitle?: string;
}

/**
 * notePath が baseDir の外を指さないことを確かめる。
 * 設定は書籍ごとのファイルから読む想定なので、`../` で外に出られると
 * 書籍を開いただけで任意のファイルを書き換えられてしまう。
 */
export function resolveNotePath(baseDir: string, notePath: string): string {
  if (isAbsolute(notePath)) {
    throw new Error(`notePath には相対パスを指定してください: ${notePath}`);
  }
  const base = resolve(baseDir);
  const target = resolve(base, normalize(notePath));
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`notePath が書籍のディレクトリの外を指しています: ${notePath}`);
  }
  return target;
}

export function createFileNoteStore(options: FileNoteStoreOptions): NoteStore {
  const path = resolveNotePath(options.baseDir, options.notePath);

  // 追記が重ならないように直列化する。エージェントが続けてツールを呼ぶと
  // 読み込みと書き込みが交差して、片方のエントリが消える
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
  };

  const readOrEmpty = async () => {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw error;
    }
  };

  return {
    read: () => serialize(readOrEmpty),
    append: (entry) =>
      serialize(async () => {
        const existing = await readOrEmpty();
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, appendEntry(existing, entry, options.bookTitle), 'utf8');
        return { path };
      }),
  };
}

/** テスト用・ノート無効時用の、何も永続化しない実装 */
export function createMemoryNoteStore(initial = ''): NoteStore & { content: () => string } {
  let content = initial;
  return {
    content: () => content,
    read: () => Promise.resolve(content),
    append: (entry) => {
      content = appendEntry(content, entry);
      return Promise.resolve({ path: join('memory', 'notes.md') });
    },
  };
}
