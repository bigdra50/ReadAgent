# ReadAgent

技術書PDFを読みながら、気になった箇所を選択して Claude Agent と深掘りでき、
対話内容が自動で読書ノート（Markdown）に反映される読書ツール。

全文をAIに渡すのではなく、**選択範囲を起点にエージェントがツールを使って調査・整理する**
「エージェント寄り」の読書体験を目指しています。

> **状態: 要件のフェーズ 1〜4 をひととおり実装。** 複数の書籍を開き、一節を選択して
> 質問すると回答がストリーミングで返り、対話の内容が Markdown の読書ノートへ追記されます。
> ノートは書籍をまたいで検索でき、結果から本文の該当箇所へ戻れます。
> 溜まったノートの再構成と Mermaid の描画にも対応しています。
> 残っている項目は [docs/roadmap.md](docs/roadmap.md) を参照してください。
>
> **未確認**: 実際の Claude サブスクリプション認証を通した動作確認はできていません。
> 検証はすべて SDK 呼び出しを差し替えた状態で行っています。
>
> エージェントは Claude サブスクリプションの認証を使います。手元で `claude` に
> ログイン済みであれば、そのまま動くはずです（作者の環境では未確認）。

## 必要環境

- Node.js 26 以上（`.nvmrc` 参照）
- pnpm 10 以上（`corepack enable` 推奨）

## セットアップ

```bash
pnpm install   # 依存の取得と Git フックの登録まで行われます
pnpm run verify
```

## 動かす

端末を2つ使います。

```bash
pnpm run build                                    # ワークスペースをビルド
pnpm --filter @readagent/server start <書籍の場所> # ローカルサーバー (127.0.0.1:5174)
pnpm --filter @readagent/web dev                  # 読書UI (127.0.0.1:5173)
```

`<書籍の場所>` には PDF ファイルか、PDF を並べたディレクトリを渡します。
ディレクトリを渡すと、直下の PDF が書籍として並び、ヘッダーで切り替えられます
（[ADR-0008](docs/adr/0008-multiple-books.md)）。

ブラウザで <http://127.0.0.1:5173> を開くと、目次・本文・サイドの3ペインが出ます。
本文を選択して質問すると、回答が右ペインにストリーミングで表示されます。

サーバーは `127.0.0.1` にのみバインドします。認証が入るまで外に出さないでください（[ADR-0004](docs/adr/0004-runtime-shell.md)）。

### 画面

| 操作 | |
| --- | --- |
| `⌘I` / `Ctrl+I` | 読書ノートの表示切り替え |
| `⌘K` / `Ctrl+K` | ノートの横断検索 |
| `⌘B` / `Ctrl+B` | 目次の表示切り替え |

ペインの境界はドラッグでも矢印キーでも動かせます。幅はブラウザに保存されます
（[ADR-0010](docs/adr/0010-browser-preferences.md)）。
画面が狭いときは目次とノートがオーバーレイになり、本文が隠れないよう排他で表示されます。
ノートのエントリをクリックすると、記録した箇所の本文へ戻ります。
横断検索の結果からは、別の書籍の該当箇所へも飛べます。

ノートペインの「読み直してまとめる」で、溜まったノートの要約を書き足せます。
目次にページ情報がある PDF では、**章を選んでその範囲だけ**まとめられます。
既存の記録は書き換えません（[ADR-0009](docs/adr/0009-note-reorganization.md)）。

エントリに付いたタグは一覧に出て、クリックで絞り込めます。
ノートに含まれる Mermaid の図は、その場で描画されます。

### 読書ノート

ノートは書籍と同じディレクトリの `notes.md` に追記されます（[ADR-0006](docs/adr/0006-note-storage.md)）。

### 設定

「グローバル → 書籍 → 環境変数」の順に後勝ちで解決します（要件 3.4）。

| 層 | 位置 |
| --- | --- |
| グローバル | `$XDG_CONFIG_HOME/readagent/config.json`（既定は `~/.config/...`） |
| 書籍 | 書籍と同じディレクトリの `.readagent.json` |
| スコープ | 環境変数 |

```json
{ "updateMode": "always", "granularity": "per-section", "notePath": "notes.md" }
```

| 設定 | 既定 | 意味 |
| --- | --- | --- |
| `updateMode` | `agent` | `agent`（エージェントが判断）/ `always`（毎回）/ `manual`（更新しない） |
| `granularity` | `per-question` | ノートの粒度。エージェントへの指示として渡す |
| `notePath` | `notes.md` | ノートの位置（書籍ディレクトリからの相対パス） |
| `maxContextChars` | `8000` | エージェントに渡す文脈の上限 |

環境変数は `READAGENT_UPDATE_MODE` / `READAGENT_GRANULARITY` / `READAGENT_NOTE_PATH`。
不正な値は警告を出して既定値のまま起動します。

チャットペインの「ノート設定」からは、**その問い合わせだけに効く一時上書き**ができます。
設定ファイルには書き込みません。

エージェントに渡すツールは、読み取り専用の Web 検索・取得と、ノート更新だけです。
ファイルシステムやシェルには触れません（[ADR-0007](docs/adr/0007-agent-permissions.md)）。

## コマンド

| 目的 | コマンド |
| --- | --- |
| 一括検証（lint / typecheck / test / build） | `pnpm run verify` |
| Lint・整形チェック | `pnpm run lint` |
| 整形＋自動修正 | `pnpm run format` |
| 型チェック | `pnpm run typecheck` |
| テスト | `pnpm run test` / `pnpm run test:watch` |
| カバレッジ | `pnpm run test:coverage` |
| ビルド | `pnpm run build` |

## 構成

```
packages/core   ドメインモデル・設定の階層解決（UI / SDK / fs に非依存）
packages/pdf    PDFのテキスト抽出と引用の組み立て
apps/server     ローカルHTTPサーバー
apps/web        読書UI（React + Vite）
docs/           要件・アーキテクチャ・ロードマップ・ADR
.claude/        Claude Code 用ハーネス（hooks / commands / agents）
.github/        CI と Claude Code Action
```

## ドキュメント

| ファイル | 内容 |
| --- | --- |
| [docs/requirements.md](docs/requirements.md) | 要件定義（仕様の一次情報） |
| [docs/architecture.md](docs/architecture.md) | レイヤ構成と未決定事項 |
| [docs/roadmap.md](docs/roadmap.md) | フェーズごとのタスク |
| [docs/agentic-workflow.md](docs/agentic-workflow.md) | エージェンティック開発の進め方 |
| [docs/spike-pdf-text-anchor.md](docs/spike-pdf-text-anchor.md) | 選択位置の指定方法の実測結果 |
| [docs/adr/](docs/adr/) | アーキテクチャ上の決定記録 |
| [CLAUDE.md](CLAUDE.md) | Claude Code 向けのプロジェクト規約 |

## CI

> **要有効化**: ワークフローは現在 `.github/workflows-pending/` にあります。
> `.github/workflows/` へ移動すると有効になります（手順は
> [.github/workflows-pending/README.md](.github/workflows-pending/README.md)）。
> 作成元の Claude Code セッションに `workflows` 権限が無く、直接置けなかったためです。

- `ci.yml` — push / PR で lint・型チェック・テスト・ビルド。PR ではコミットメッセージも検証
- `claude.yml` — Issue / PR で `@claude` メンションに応答
- `claude-code-review.yml` — PR の自動レビュー

`claude.yml` と `claude-code-review.yml` は、リポジトリの Secrets に
`CLAUDE_CODE_OAUTH_TOKEN` を登録すると有効になります。
トークンはローカルで `claude setup-token` を実行して発行してください（Claude サブスクリプションを利用）。
未設定の場合、これらのワークフローはスキップされ CI は赤くなりません。
