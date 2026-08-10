import type { Granularity, NoteConfig, UpdateMode } from '@readagent/core';

export interface RequestOverrides {
  readonly updateMode?: UpdateMode;
  readonly granularity?: Granularity;
  readonly notePath?: string;
  readonly maxContextChars?: number;
  /** 使うモデル。空なら SDK の既定に従う */
  readonly model?: string;
}

interface Props {
  readonly resolved: NoteConfig | null;
  readonly overrides: RequestOverrides;
  readonly onChange: (next: RequestOverrides) => void;
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
 * この問い合わせだけに効く設定（要件 3.4 のスコープ設定）。
 *
 * ここでの変更は設定ファイルに書かない。「この章だけ要約でいい」といった
 * 一時的な意向を、設定ファイルを開かずに通すためのもの。
 */
export function RequestSettings({ resolved, overrides, onChange }: Props) {
  if (!resolved) return null;

  const changed = Object.values(overrides).some((value) => value !== undefined && value !== '');

  return (
    <details className="request-settings">
      <summary>詳細設定{changed && <span className="settings-mark">（一時変更中）</span>}</summary>

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

      <label>
        文脈の上限
        <input
          type="number"
          min={500}
          max={100000}
          step={500}
          value={overrides.maxContextChars ?? resolved.maxContextChars}
          onChange={(event) => {
            const value = Number(event.target.value);
            onChange({
              ...overrides,
              ...(Number.isFinite(value) && value > 0 ? { maxContextChars: value } : {}),
            });
          }}
        />
      </label>

      <label>
        ノートの位置
        <input
          type="text"
          value={overrides.notePath ?? resolved.notePath}
          onChange={(event) => onChange({ ...overrides, notePath: event.target.value })}
        />
      </label>

      <label>
        モデル
        <input
          type="text"
          placeholder="既定（例: sonnet）"
          value={overrides.model ?? ''}
          onChange={(event) => onChange({ ...overrides, model: event.target.value })}
        />
      </label>

      {changed && (
        <button type="button" onClick={() => onChange({})}>
          書籍の設定に戻す
        </button>
      )}
    </details>
  );
}
