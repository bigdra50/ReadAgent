/**
 * ブラウザ側の表示設定。
 *
 * サーバー側の設定（ノートの振る舞い＝ updateMode / granularity など）とは分けている。
 * こちらは「その端末でどう見えるか」であって、書籍やノートの内容には関わらない。
 * 詳しくは ADR-0010。
 */
import { useCallback, useState } from 'react';

const PREFIX = 'readagent:';

/**
 * localStorage は使えないことがある（プライベートモード、無効化、容量超過）。
 * 表示設定のために読書が止まる理由はないので、失敗は黙って諦める。
 */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPreference<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  const raw = storage()?.getItem(PREFIX + key);
  if (raw === null || raw === undefined) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    // 壊れた値は無かったことにする。次の書き込みで上書きされる
    return null;
  }
}

export function writePreference(key: string, value: unknown): void {
  try {
    storage()?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 容量超過などで保存できなくても、いまの表示は保てている
  }
}

/**
 * 保存される state。検証を通らない値は既定値に落とす。
 * useState と同じく関数での更新も受ける。ドラッグ中のように
 * 直前の値から次を決める場面で、古い値を掴まないようにするため。
 */
export function usePersistentState<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readPreference(key, isValid) ?? fallback);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(previous) : next;
        writePreference(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, update];
}

export interface PaneWidths {
  readonly toc: number;
  readonly side: number;
}

export function isPaneWidths(value: unknown): value is PaneWidths {
  if (typeof value !== 'object' || value === null) return false;
  const { toc, side } = value as { toc?: unknown; side?: unknown };
  return (
    typeof toc === 'number' &&
    Number.isFinite(toc) &&
    toc > 0 &&
    typeof side === 'number' &&
    Number.isFinite(side) &&
    side > 0
  );
}

/** 表示倍率の範囲。狭すぎ・広すぎで本文が読めなくなるのを防ぐ */
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.2;
export const DEFAULT_ZOOM = 1.4;

export function isZoom(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= MIN_ZOOM && value <= MAX_ZOOM
  );
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

export type ThemeChoice = 'system' | 'light' | 'dark';
const THEMES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export type SidePaneChoice = 'chat' | 'notes' | 'search' | null;

export interface PaneState {
  readonly toc: boolean;
  readonly side: SidePaneChoice;
}

export function isPaneState(value: unknown): value is PaneState {
  if (typeof value !== 'object' || value === null) return false;
  const { toc, side } = value as { toc?: unknown; side?: unknown };
  return (
    typeof toc === 'boolean' &&
    (side === null || side === 'chat' || side === 'notes' || side === 'search')
  );
}

/** 書籍ごとの最後に読んだページ。書籍IDをキーにする */
export type LastPages = Readonly<Record<string, number>>;

export function isLastPages(value: unknown): value is LastPages {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (page) => typeof page === 'number' && Number.isInteger(page) && page >= 1,
  );
}
