import { describe, expect, it } from 'vitest';
import {
  CONFIG_LAYERS,
  DEFAULT_NOTE_CONFIG,
  isGranularity,
  isUpdateMode,
  parsePartialNoteConfig,
  resolveNoteConfig,
} from '../src/index.js';

describe('resolveNoteConfig', () => {
  it('層が無ければ既定値を返す', () => {
    expect(resolveNoteConfig()).toEqual(DEFAULT_NOTE_CONFIG);
  });

  it('後の層が前の層を上書きする（global → project → scope）', () => {
    const resolved = resolveNoteConfig(
      { updateMode: 'always', granularity: 'summary' },
      { granularity: 'per-section' },
      { updateMode: 'manual' },
    );

    expect(resolved.updateMode).toBe('manual');
    expect(resolved.granularity).toBe('per-section');
  });

  it('未指定のキーは下の層の値を保持する', () => {
    const resolved = resolveNoteConfig({ notePath: 'reading-notes.md' }, { autoTag: false });

    expect(resolved.notePath).toBe('reading-notes.md');
    expect(resolved.autoTag).toBe(false);
    expect(resolved.maxContextChars).toBe(DEFAULT_NOTE_CONFIG.maxContextChars);
  });

  it('undefined の層はスキップされる', () => {
    const resolved = resolveNoteConfig(undefined, { updateMode: 'always' }, undefined);
    expect(resolved.updateMode).toBe('always');
  });

  it('入力を破壊しない', () => {
    const layer = { updateMode: 'always' } as const;
    resolveNoteConfig(layer);
    expect(layer).toEqual({ updateMode: 'always' });
  });

  it('層の定義順は global → project → scope', () => {
    expect([...CONFIG_LAYERS]).toEqual(['global', 'project', 'scope']);
  });
});

describe('parsePartialNoteConfig', () => {
  it('妥当な値を取り込む', () => {
    const { config, issues } = parsePartialNoteConfig({
      updateMode: 'always',
      granularity: 'free',
      notePath: 'note.md',
      autoTag: false,
      maxContextChars: 4000,
    });

    expect(issues).toEqual([]);
    expect(config).toEqual({
      updateMode: 'always',
      granularity: 'free',
      notePath: 'note.md',
      autoTag: false,
      maxContextChars: 4000,
    });
  });

  it('不正な値は捨てて issue に記録し、他のキーは活かす', () => {
    const { config, issues } = parsePartialNoteConfig({
      updateMode: 'sometimes',
      granularity: 'summary',
      maxContextChars: -1,
      unknownKey: 1,
    });

    expect(config).toEqual({ granularity: 'summary' });
    expect(issues).toHaveLength(3);
  });

  it('オブジェクト以外は空設定として扱う', () => {
    for (const input of [null, undefined, 42, 'x', []]) {
      const { config, issues } = parsePartialNoteConfig(input);
      expect(config).toEqual({});
      expect(issues).toHaveLength(1);
    }
  });

  it('型ガードが判別できる', () => {
    expect(isUpdateMode('agent')).toBe(true);
    expect(isUpdateMode('nope')).toBe(false);
    expect(isGranularity('per-question')).toBe(true);
    expect(isGranularity('per-paragraph')).toBe(false);
  });
});
