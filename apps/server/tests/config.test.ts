import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_NOTE_CONFIG } from '@readagent/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { globalConfigPath, loadNoteConfig, scopeLayerFromEnv } from '../src/config.js';

describe('globalConfigPath', () => {
  it('XDG_CONFIG_HOME を優先する', () => {
    expect(globalConfigPath({ XDG_CONFIG_HOME: '/xdg' }, '/home/u')).toBe(
      '/xdg/readagent/config.json',
    );
  });

  it('無ければ ~/.config を使う', () => {
    expect(globalConfigPath({}, '/home/u')).toBe('/home/u/.config/readagent/config.json');
  });
});

describe('scopeLayerFromEnv', () => {
  it('環境変数を部分設定に変える', () => {
    const { config } = scopeLayerFromEnv({ READAGENT_UPDATE_MODE: 'always' });

    expect(config).toEqual({ updateMode: 'always' });
  });

  it('不正な値は捨てて理由を残す', () => {
    const { config, issues } = scopeLayerFromEnv({ READAGENT_UPDATE_MODE: 'ときどき' });

    expect(config).toEqual({});
    expect(issues).toHaveLength(1);
  });

  it('未設定なら何も返さない', () => {
    expect(scopeLayerFromEnv({}).config).toEqual({});
  });
});

describe('loadNoteConfig', () => {
  let home = '';
  let books = '';

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'readagent-home-'));
    books = await mkdtemp(join(tmpdir(), 'readagent-books-'));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(books, { recursive: true, force: true });
  });

  const bookPath = () => join(books, 'book.pdf');
  const writeGlobal = async (value: unknown) => {
    await mkdir(join(home, 'readagent'), { recursive: true });
    await writeFile(join(home, 'readagent', 'config.json'), JSON.stringify(value), 'utf8');
  };
  const writeProject = (value: unknown) =>
    writeFile(join(books, '.readagent.json'), JSON.stringify(value), 'utf8');
  const load = (env: NodeJS.ProcessEnv = {}) =>
    loadNoteConfig({ bookPath: bookPath(), env: { XDG_CONFIG_HOME: home, ...env }, home });

  it('設定ファイルが無ければ既定値になる', async () => {
    const { config, sources, issues } = await load();

    expect(config).toEqual(DEFAULT_NOTE_CONFIG);
    expect(sources).toEqual([]);
    expect(issues).toEqual([]);
  });

  it('グローバル → 書籍 → スコープ の順に後勝ちで解決する', async () => {
    await writeGlobal({ updateMode: 'always', granularity: 'summary', notePath: 'g.md' });
    await writeProject({ granularity: 'per-section', notePath: 'p.md' });

    const { config } = await load({ READAGENT_NOTE_PATH: 's.md' });

    expect(config.updateMode).toBe('always'); // グローバルだけが指定
    expect(config.granularity).toBe('per-section'); // 書籍がグローバルを上書き
    expect(config.notePath).toBe('s.md'); // スコープが最優先
  });

  it('効いた層を報告する', async () => {
    await writeProject({ updateMode: 'manual' });

    const { sources } = await load({ READAGENT_UPDATE_MODE: 'always' });

    expect(sources).toHaveLength(2);
    expect(sources.at(-1)).toBe('環境変数');
  });

  it('壊れた JSON でも起動を止めず、理由を残す', async () => {
    await writeFile(join(books, '.readagent.json'), '{ 壊れている', 'utf8');

    const { config, issues } = await load();

    expect(config).toEqual(DEFAULT_NOTE_CONFIG);
    expect(issues.join()).toContain('JSON として読めませんでした');
  });

  it('不正な値だけを捨てて、同じファイルの妥当な値は活かす', async () => {
    await writeProject({ updateMode: 'ときどき', granularity: 'free' });

    const { config, issues } = await load();

    expect(config.granularity).toBe('free');
    expect(config.updateMode).toBe(DEFAULT_NOTE_CONFIG.updateMode);
    expect(issues).toHaveLength(1);
  });
});
