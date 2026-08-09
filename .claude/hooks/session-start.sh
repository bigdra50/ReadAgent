#!/usr/bin/env bash
# SessionStart フック:
# セッション開始時に依存関係を揃え、いまのリポジトリ状態を要約して stdout に出す。
# stdout はそのままセッションの追加コンテキストとして Claude に渡る。
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if [ ! -d node_modules ]; then
  echo "== 依存関係をインストール中 (node_modules が無いため) =="
  pnpm install --frozen-lockfile >/dev/null 2>&1 \
    || pnpm install >/dev/null 2>&1 \
    || echo "!! pnpm install に失敗しました。手動で確認してください"
fi

echo "== ReadAgent セッション開始情報 =="
echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'n/a')"

changed="$(git status --porcelain 2>/dev/null)"
if [ -n "$changed" ]; then
  echo "未コミットの変更:"
  echo "$changed" | head -20
else
  echo "作業ツリーはクリーンです"
fi

echo "直近のコミット:"
git log --oneline -5 2>/dev/null || echo "  （コミットなし）"

echo ""
echo "主要コマンド: pnpm run verify / lint / typecheck / test / build"
echo "規約は CLAUDE.md、要件は docs/requirements.md、方針は docs/adr/ を参照。"
