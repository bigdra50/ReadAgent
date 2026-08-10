/**
 * 設定の階層解決（要件 3.4）。
 *
 * グローバル → プロジェクト（書籍単位） → スコープ（章・セッション・一時上書き）
 * の順に「後勝ち」でマージする。値が未指定（undefined）の層は下の層を上書きしない。
 */

/** ノート更新のタイミング */
export type UpdateMode = 'agent' | 'always' | 'manual';

/** ノートの粒度 */
export type Granularity = 'per-question' | 'per-section' | 'free' | 'summary';

/** 完全に解決済みの設定。全フィールドが必須。 */
export interface NoteConfig {
  readonly updateMode: UpdateMode;
  readonly granularity: Granularity;
  /** 書籍ルートからのノートファイル相対パス */
  readonly notePath: string;
  /** エージェントにタグ付けを任せるか */
  readonly autoTag: boolean;
  /** 1リクエストでエージェントに渡す周辺文脈の上限文字数 */
  readonly maxContextChars: number;
}

/** 各層が持つ部分設定 */
export type PartialNoteConfig = Partial<NoteConfig>;

/** 設定層。配列の後ろほど優先度が高い。 */
export const CONFIG_LAYERS = ['global', 'project', 'scope'] as const;
export type ConfigLayer = (typeof CONFIG_LAYERS)[number];

export const DEFAULT_NOTE_CONFIG: NoteConfig = {
  updateMode: 'agent',
  granularity: 'per-question',
  notePath: 'notes.md',
  autoTag: true,
  maxContextChars: 8000,
};

const UPDATE_MODES: readonly UpdateMode[] = ['agent', 'always', 'manual'];
const GRANULARITIES: readonly Granularity[] = ['per-question', 'per-section', 'free', 'summary'];

export function isUpdateMode(value: unknown): value is UpdateMode {
  return typeof value === 'string' && (UPDATE_MODES as readonly string[]).includes(value);
}

export function isGranularity(value: unknown): value is Granularity {
  return typeof value === 'string' && (GRANULARITIES as readonly string[]).includes(value);
}

/**
 * 層を後勝ちでマージして完全な設定を得る。
 * `undefined` の層はスキップされるため、呼び出し側で層の有無を分岐しなくてよい。
 */
export function resolveNoteConfig(
  ...layers: readonly (PartialNoteConfig | undefined)[]
): NoteConfig {
  let resolved: NoteConfig = DEFAULT_NOTE_CONFIG;

  for (const layer of layers) {
    if (!layer) continue;
    resolved = {
      updateMode: layer.updateMode ?? resolved.updateMode,
      granularity: layer.granularity ?? resolved.granularity,
      notePath: layer.notePath ?? resolved.notePath,
      autoTag: layer.autoTag ?? resolved.autoTag,
      maxContextChars: layer.maxContextChars ?? resolved.maxContextChars,
    };
  }

  return resolved;
}

export interface ParseResult {
  readonly config: PartialNoteConfig;
  /** 不正な値・未知のキーの説明。設定ファイルの読み込みは失敗させず警告として扱う。 */
  readonly issues: readonly string[];
}

/**
 * 外部入力（設定ファイル・クエリパラメータ等）を部分設定へ変換する。
 * 不正な値は捨てて `issues` に記録する。壊れた1行で読書を止めないための設計。
 */
export function parsePartialNoteConfig(input: unknown): ParseResult {
  const issues: string[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { config: {}, issues: ['設定はオブジェクトである必要があります'] };
  }

  const raw = input as Record<string, unknown>;
  const config: PartialNoteConfig = {};
  const mutable = config as { -readonly [K in keyof NoteConfig]?: NoteConfig[K] };

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;

    switch (key) {
      case 'updateMode':
        if (isUpdateMode(value)) mutable.updateMode = value;
        else issues.push(`updateMode の値が不正です: ${JSON.stringify(value)}`);
        break;
      case 'granularity':
        if (isGranularity(value)) mutable.granularity = value;
        else issues.push(`granularity の値が不正です: ${JSON.stringify(value)}`);
        break;
      case 'notePath':
        if (typeof value === 'string' && value.length > 0) mutable.notePath = value;
        else issues.push(`notePath は空でない文字列である必要があります`);
        break;
      case 'autoTag':
        if (typeof value === 'boolean') mutable.autoTag = value;
        else issues.push(`autoTag は真偽値である必要があります`);
        break;
      case 'maxContextChars':
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
          mutable.maxContextChars = value;
        } else {
          issues.push(`maxContextChars は正の整数である必要があります`);
        }
        break;
      default:
        issues.push(`未知の設定キーです: ${key}`);
    }
  }

  return { config, issues };
}
