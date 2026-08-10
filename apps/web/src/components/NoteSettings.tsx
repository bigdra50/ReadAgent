import type { Granularity, UpdateMode } from '@readagent/core';

export interface NoteOverrides {
  readonly updateMode?: UpdateMode;
  readonly granularity?: Granularity;
}

interface Props {
  readonly resolved: { updateMode: UpdateMode; granularity: Granularity } | null;
  readonly overrides: NoteOverrides;
  readonly onChange: (next: NoteOverrides) => void;
}

const UPDATE_MODES: { value: UpdateMode; label: string }[] = [
  { value: 'agent', label: 'エージェントが判断' },
  { value: 'always', label: '毎回' },
  { value: 'manual', label: '更新しない' },
];

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'per-question', label: '質問ごと' },
  { value: 'per-section', label: '節ごと' },
  { value: 'free', label: 'おまかせ' },
  { value: 'summary', label: '要約だけ' },
];

/**
 * ノート設定の一時上書き（要件 3.4 のスコープ設定）。
 *
 * ここでの変更はこのセッションの問い合わせにだけ効き、設定ファイルには書かない。
 * 「この章だけ要約でいい」といった一時的な意向を、設定ファイルを開かずに通すため。
 */
export function NoteSettings({ resolved, overrides, onChange }: Props) {
  if (!resolved) return null;

  const changed = overrides.updateMode !== undefined || overrides.granularity !== undefined;

  return (
    <details className="note-settings">
      <summary>
        ノート設定{changed && <span className="note-settings-mark">（一時変更中）</span>}
      </summary>

      <label>
        更新
        <select
          value={overrides.updateMode ?? resolved.updateMode}
          onChange={(event) =>
            onChange({ ...overrides, updateMode: event.target.value as UpdateMode })
          }
        >
          {UPDATE_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        粒度
        <select
          value={overrides.granularity ?? resolved.granularity}
          onChange={(event) =>
            onChange({ ...overrides, granularity: event.target.value as Granularity })
          }
        >
          {GRANULARITIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {changed && (
        <button type="button" onClick={() => onChange({})}>
          書籍の設定に戻す
        </button>
      )}
    </details>
  );
}
