# ReadAgent

技術書PDFを読みながら、気になった箇所を選択して Claude Agent と深掘りでき、
対話内容が自動で読書ノート（Markdown）に反映される読書ツール。

全文をAIに渡すのではなく、**選択範囲を起点にエージェントがツールを使って調査・整理する**
「エージェント寄り」の読書体験を目指しています。

> **状態: Phase 0（ハーネス整備）完了。** アプリケーション本体はこれからです。
> 現在あるのは開発基盤（CI・検証コマンド・エージェント用ハーネス）と、
> ドメインモデル・設定解決の最小実装のみです。

## 必要環境

- Node.js 22 以上（`.nvmrc` 参照）
- pnpm 10 以上（`corepack enable` 推奨）

## セットアップ

```bash
pnpm install   # 依存の取得と Git フックの登録まで行われます
pnpm run verify
```

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
