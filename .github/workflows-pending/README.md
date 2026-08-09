# 有効化待ちのワークフロー

このディレクトリのファイルは **GitHub Actions のワークフロー本体**です。
`.github/workflows/` に移すと有効になります。

```bash
mkdir -p .github/workflows
git mv .github/workflows-pending/*.yml .github/workflows/
git rm .github/workflows-pending/README.md
git commit -m "ci: ワークフローを有効化する"
git push
```

## なぜ直接置かれていないのか

このリポジトリのワークフローは Claude Code のセッションから作成しましたが、
セッションが使う GitHub App には `workflows` 権限が付与されておらず、
`.github/workflows/` 配下への書き込みが GitHub 側で拒否されます
（`refusing to allow a GitHub App to create or update workflow ... without workflows permission`）。

これは GitHub の仕様上の保護であり、内容の問題ではありません。
上のコマンドで移動して push すれば、そのまま動作します。

## 中身

| ファイル | 内容 |
| --- | --- |
| `ci.yml` | push / PR で lint・型チェック・テスト・ビルド。PR ではコミットメッセージも検証 |
| `claude.yml` | Issue / PR で `@claude` メンションに応答 |
| `claude-code-review.yml` | PR の自動レビュー |

`claude.yml` と `claude-code-review.yml` は、リポジトリの Secrets に
`CLAUDE_CODE_OAUTH_TOKEN` が登録されている場合のみ動きます
（ローカルで `claude setup-token` を実行して発行）。未設定ならスキップされ、CI は赤くなりません。
