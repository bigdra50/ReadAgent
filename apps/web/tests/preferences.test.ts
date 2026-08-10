import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPaneWidths, readPreference, writePreference } from '../src/lib/preferences';

/** localStorage を持たない環境（Node）で、最小限の実装を差す */
function useStorage(impl: Partial<Storage> | null) {
  vi.stubGlobal('window', impl === null ? {} : { localStorage: impl });
}

describe('isPaneWidths', () => {
  it('数値の組だけを受け付ける', () => {
    expect(isPaneWidths({ toc: 240, side: 340 })).toBe(true);
  });

  it('壊れた値を弾く', () => {
    for (const broken of [
      null,
      'text',
      {},
      { toc: 240 },
      { toc: '240', side: 340 },
      { toc: 0, side: 340 },
      { toc: Number.NaN, side: 340 },
      { toc: Number.POSITIVE_INFINITY, side: 340 },
    ]) {
      expect(isPaneWidths(broken), JSON.stringify(broken)).toBe(false);
    }
  });
});

describe('設定の読み書き', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    useStorage({
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
  });

  it('書いた値を読み戻せる', () => {
    writePreference('pane-widths', { toc: 300, side: 400 });

    expect(readPreference('pane-widths', isPaneWidths)).toEqual({ toc: 300, side: 400 });
  });

  it('キーに接頭辞を付けて他のアプリと衝突させない', () => {
    writePreference('pane-widths', { toc: 1, side: 2 });

    expect(Object.keys(store)).toEqual(['readagent:pane-widths']);
  });

  it('保存が無ければ null を返す', () => {
    expect(readPreference('pane-widths', isPaneWidths)).toBeNull();
  });

  it('壊れた JSON は無かったことにする', () => {
    store['readagent:pane-widths'] = '{ 壊れている';

    expect(readPreference('pane-widths', isPaneWidths)).toBeNull();
  });

  it('検証を通らない値は無かったことにする', () => {
    store['readagent:pane-widths'] = JSON.stringify({ toc: 'ひろい' });

    expect(readPreference('pane-widths', isPaneWidths)).toBeNull();
  });
});

describe('localStorage が使えないとき', () => {
  it('読み書きしても落ちない（プライベートモードでも読書は続く）', () => {
    useStorage(null);

    expect(() => writePreference('pane-widths', { toc: 1, side: 2 })).not.toThrow();
    expect(readPreference('pane-widths', isPaneWidths)).toBeNull();
  });

  it('保存に失敗しても落ちない（容量超過）', () => {
    useStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });

    expect(() => writePreference('pane-widths', { toc: 1, side: 2 })).not.toThrow();
  });
});
