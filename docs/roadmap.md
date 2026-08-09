# ロードマップ

要件 6 のフェーズを、着手可能な単位まで割ったもの。上から順に進めます。
各項目は「1つのPRで完結する縦割りのスライス」を意図しています。

## Phase 0: ハーネス整備（完了）

- [x] pnpm ワークスペース + TypeScript + Biome + Vitest
- [x] `pnpm run verify`（lint / typecheck / test / build）
- [x] GitHub Actions による CI と Claude Code Action（`.github/workflows-pending/` から移動して有効化）
- [x] Claude Code 用ハーネス（`CLAUDE.md` / hooks / slash commands / subagents）
- [x] `packages/core`: ドメインモデルと設定の階層解決

## Phase 1: MVP

- [ ] **ADR**: 実行形態（Electron / Tauri / ローカルサーバー）と UI フレームワークを決める
- [ ] `packages/pdf`: PDFからページ単位のテキストと目次を抽出する
- [ ] アプリ骨格: 分割ビュー（目次 / 本文）の最小実装
- [ ] 本文のテキスト選択 → `Selection` を作る
- [ ] `packages/agent`: Agent SDK の初期化と、選択範囲を起点にした問い合わせ
- [ ] チャットペインとストリーミング表示
- [ ] ツール実行状況の可視化（最低限、実行中のツール名）

**Phase 1 の完了条件**: PDFを開き、一節を選択して質問し、回答がストリーミングで返る。

## Phase 2: ツールとノート自動更新

- [ ] エージェントに WebSearch / WebFetch / Read・Grep を許可し、権限方針を決める
- [ ] `packages/notes`: Markdown ノートの読み書き（書籍単位）
- [ ] カスタムツール `update_note` をエージェントに渡す
- [ ] ノート更新のバックグラウンド実行とキャンセル
- [ ] `updateMode` = `agent` / `always` の分岐を実装
- [ ] Mermaid 図解の生成とノートへの埋め込み

**Phase 2 の完了条件**: 対話が読書を止めずにノートへ反映され、途中でキャンセルできる。

## Phase 3: ノートUI・設定階層・双方向リンク

- [ ] ノートペイン（分割ビュー連携、常時アクセス、更新状態の控えめな可視化）
- [ ] 設定の階層読み込み（グローバル / 書籍 / スコープ）とUIからの一時上書き
- [ ] `granularity` の実装
- [ ] ノート ↔ 本文の双方向リンク（ジャンプ）
- [ ] 狭い画面へのフォールバック（スタック / オーバーレイ）

## Phase 4: 拡張

- [ ] 複数書籍の管理と横断検索
- [ ] ノートの再構成（タグ・章単位のサマリ生成）
- [ ] Webサーバー化の実証（コアを変えずにアダプタ差し替えで動くか）
