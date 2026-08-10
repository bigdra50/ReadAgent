/**
 * 複数書籍の管理（要件 6 Phase 4）。
 *
 * 1冊ぶんの部品（本文の抽出・ノート・設定）をまとめ、書籍IDで引けるようにする。
 * ファイルの探索はここに閉じ、HTTP 層は「ID で書籍を引く」ことだけを知る。
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import type { NoteConfig } from '@readagent/core';
import { createFileNoteStore, type NoteStore } from '@readagent/notes';
import { type ExtractedDocument, extractDocument } from '@readagent/pdf';
import { loadNoteConfig } from './config.js';

export interface BookRef {
  readonly id: string;
  readonly title: string;
}

export interface LoadedDocument {
  readonly document: ExtractedDocument;
  readonly bytes: Uint8Array;
}

export interface BookHandle {
  readonly ref: BookRef;
  readonly config: NoteConfig;
  readonly notes: NoteStore;
  /**
   * 別の位置のノートを引く。UI から notePath を一時上書きしたときに使う。
   * パスの検証は createFileNoteStore（resolveNotePath）が行う。
   */
  notesAt(notePath: string): NoteStore;
  load(): Promise<LoadedDocument>;
}

export interface Library {
  list(): Promise<readonly BookRef[]>;
  /** 未知のIDには undefined を返す。呼び出し側で 404 にする */
  get(id: string): Promise<BookHandle | undefined>;
}

/**
 * 書籍IDはパスから決める。
 * 一覧の順序や登録順に依存させると、書籍を1冊足しただけでノートのリンクが壊れる。
 */
export function bookId(path: string): string {
  const absolute = resolve(path);
  const digest = createHash('sha256').update(absolute).digest('hex').slice(0, 8);
  // 読みやすさのための接頭辞。URL に素で載せたいので ASCII だけを残す。
  // 日本語の書名では空になるが、そのときはハッシュだけで用は足りる（表示名は別に持つ）。
  const slug = basename(absolute, extname(absolute))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug ? `${slug}-${digest}` : digest;
}

/** ディレクトリ直下の PDF を書籍として扱う */
export async function findBooks(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.pdf')
    .map((entry) => join(dir, entry.name))
    .sort();
}

function createHandle(path: string): Promise<BookHandle> {
  return (async () => {
    const { config } = await loadNoteConfig({ bookPath: path });
    const title = basename(path, extname(path));
    let cached: Promise<LoadedDocument> | null = null;

    // 同じ位置のノートには同じ保存先を使う。別々に作ると追記の直列化が効かない
    const stores = new Map<string, NoteStore>();
    const notesAt = (notePath: string): NoteStore => {
      const existing = stores.get(notePath);
      if (existing) return existing;
      const store = createFileNoteStore({
        baseDir: resolve(path, '..'),
        notePath,
        bookTitle: title,
      });
      stores.set(notePath, store);
      return store;
    };

    return {
      ref: { id: bookId(path), title },
      config,
      notes: notesAt(config.notePath),
      notesAt,
      load: () => {
        // 抽出は重い。開いた書籍だけを、1度だけ読む
        cached ??= (async () => {
          const bytes = new Uint8Array(await readFile(path));
          return { document: await extractDocument(bytes), bytes };
        })();
        return cached;
      },
    };
  })();
}

export interface FileLibraryOptions {
  /** 書籍を探すディレクトリ。指定した PDF だけを扱う場合は paths を使う */
  readonly dir?: string;
  readonly paths?: readonly string[];
}

export function createFileLibrary(options: FileLibraryOptions): Library {
  const handles = new Map<string, Promise<BookHandle>>();

  const paths = async (): Promise<string[]> => {
    if (options.paths) return options.paths.map((path) => resolve(path));
    if (!options.dir) return [];
    return findBooks(resolve(options.dir));
  };

  return {
    async list() {
      const found = await paths();
      const refs: BookRef[] = [];
      for (const path of found) {
        handles.set(bookId(path), handles.get(bookId(path)) ?? createHandle(path));
        const handle = await handles.get(bookId(path));
        if (handle) refs.push(handle.ref);
      }
      return refs;
    },

    async get(id) {
      const existing = handles.get(id);
      if (existing) return existing;
      // 起動後に足された書籍も拾えるよう、その都度探し直す
      const found = await paths();
      const path = found.find((candidate) => bookId(candidate) === id);
      if (!path) return undefined;
      const handle = createHandle(path);
      handles.set(id, handle);
      return handle;
    },
  };
}

/** 与えられたパスが実在する PDF かを確かめる。CLI の引数検証に使う */
export async function isReadablePdf(path: string): Promise<boolean> {
  try {
    const info = await stat(resolve(path));
    return info.isFile() && extname(path).toLowerCase() === '.pdf';
  } catch {
    return false;
  }
}

/** 与えられたパスがディレクトリかを確かめる */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(resolve(path))).isDirectory();
  } catch {
    return false;
  }
}
