/**
 * 設定の階層読み込み（要件 3.4）。
 *
 * グローバル → 書籍（プロジェクト）→ スコープ の順に後勝ちで解決する。
 * 解決の規則そのものは core の resolveNoteConfig が持ち、ここはファイルを読むだけ。
 * 値の検証も core の parsePartialNoteConfig に任せる。
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  type NoteConfig,
  type ParseResult,
  type PartialNoteConfig,
  parsePartialNoteConfig,
  resolveNoteConfig,
} from '@readagent/core';

/** 書籍ごとの設定ファイル名。書籍と同じディレクトリに置く */
export const PROJECT_CONFIG_FILE = '.readagent.json';
/** グローバル設定の位置（XDG があればそちら） */
export function globalConfigPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const base = env.XDG_CONFIG_HOME || join(home, '.config');
  return join(base, 'readagent', 'config.json');
}

export interface LoadedNoteConfig {
  readonly config: NoteConfig;
  /** 実際に読み込めた層。どこが効いているかを起動時に見せるため */
  readonly sources: readonly string[];
  /** 不正な値・読めなかったファイルの説明。起動は止めない */
  readonly issues: readonly string[];
}

async function readLayer(path: string, issues: string[]): Promise<PartialNoteConfig | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    // 設定ファイルが無いのは正常。読めない場合だけ知らせる
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      issues.push(`${path} を読めませんでした: ${(error as Error).message}`);
    }
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    issues.push(`${path} は JSON として読めませんでした`);
    return undefined;
  }

  const { config, issues: layerIssues } = parsePartialNoteConfig(parsed);
  for (const issue of layerIssues) issues.push(`${path}: ${issue}`);
  return config;
}

/** 環境変数を「スコープ設定」として読む。UI からの一時上書きも同じ層に入る */
export function scopeLayerFromEnv(env: NodeJS.ProcessEnv = process.env): ParseResult {
  return parsePartialNoteConfig({
    ...(env.READAGENT_UPDATE_MODE ? { updateMode: env.READAGENT_UPDATE_MODE } : {}),
    ...(env.READAGENT_NOTE_PATH ? { notePath: env.READAGENT_NOTE_PATH } : {}),
    ...(env.READAGENT_GRANULARITY ? { granularity: env.READAGENT_GRANULARITY } : {}),
  });
}

export interface LoadOptions {
  /** 書籍ファイルのパス。同じディレクトリの .readagent.json を書籍設定として読む */
  readonly bookPath: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
}

export async function loadNoteConfig(options: LoadOptions): Promise<LoadedNoteConfig> {
  const env = options.env ?? process.env;
  const issues: string[] = [];
  const sources: string[] = [];

  const globalPath = globalConfigPath(env, options.home ?? homedir());
  const projectPath = join(dirname(options.bookPath), PROJECT_CONFIG_FILE);

  const global = await readLayer(globalPath, issues);
  if (global) sources.push(globalPath);

  const project = await readLayer(projectPath, issues);
  if (project) sources.push(projectPath);

  const scope = scopeLayerFromEnv(env);
  issues.push(...scope.issues.map((issue) => `環境変数: ${issue}`));
  if (Object.keys(scope.config).length > 0) sources.push('環境変数');

  return {
    config: resolveNoteConfig(global, project, scope.config),
    sources,
    issues,
  };
}
