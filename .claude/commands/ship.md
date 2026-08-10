---
description: 変更をConventional Commitsでコミットし、作業ブランチへpushする
argument-hint: "[コミットの要旨]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(pnpm run:*)
---

1. `git status` と `git diff` で変更内容を確認する。意図しない差分（デバッグ出力、実データ、`.env`）が混ざっていないか見る。
2. `pnpm run verify` を通す。
3. 変更を論理単位に分けてコミットする。メッセージは Conventional Commits:
   - 形式: `<type>(<scope>): <要約>` — scope は core / agent / notes / server / web / config / docs / ci / harness / deps
   - 要約は「何をしたか」ではなく「何が変わるか」。日本語で可。
   - 理由が自明でない変更は本文に「なぜ」を書く。差分を読めば分かる「何を」は繰り返さない。
4. 現在の作業ブランチへ `git push -u origin <branch>` する。**main へは push しない。**
5. PR の作成はユーザーから明示的に依頼された場合のみ行う。

要旨: $ARGUMENTS
