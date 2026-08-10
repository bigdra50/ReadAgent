---
description: lint / typecheck / test / build を通し、落ちた箇所を直す
argument-hint: "[追加で確認したいこと]"
allowed-tools: Bash(pnpm run:*), Bash(pnpm exec:*), Read, Edit, Grep, Glob
---

`pnpm run verify` を実行してください。

失敗したら、以下の順で直します（前の段階が通るまで次に進まない）:

1. `lint` — 自動修正は `pnpm run format`。自動修正できない指摘は原因を直す。ルールを無効化して黙らせない。
2. `typecheck` — `any` や `as` でのごまかしは不可。型が合わないのは設計が合っていない兆候として扱う。
3. `test` — 実装を落とすのではなく、テストが表明している仕様が正しいかをまず確認する。
4. `build` — 型エラーが出るなら公開APIの export 漏れを疑う。

すべて通ったら、直した内容を1〜3行で報告してください。通らない箇所が残る場合は、何が・なぜ残っているかを明示してください。

追加の確認事項: $ARGUMENTS
