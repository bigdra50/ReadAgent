# 0002. ツールチェーンを pnpm + TypeScript + Biome + Vitest に固定する

- **Status**: Accepted
- **Date**: 2026-08-09

## Context

実装の多くをエージェントに任せるため、ツールチェーンには
「速い」「設定が少ない」「失敗が明確」の3つが要る。

- 遅いと、フックやCIでの検証が実質的に回らなくなる
- 設定が多いと、エージェントが規約より設定ファイルの読解に文脈を使う
- 失敗が曖昧だと、エージェントが誤った修正に走る

また将来 `packages/*` と `apps/*` に分かれるため、モノレポ前提で選ぶ必要がある。

## Decision

- **パッケージマネージャ**: pnpm（ワークスペース）。`packageManager` フィールドと
  `.npmrc` の `engine-strict` でバージョンを固定し、`guard-bash` フックで npm/yarn を拒否する
- **言語**: TypeScript。`strict` に加え `noUncheckedIndexedAccess` と
  `exactOptionalPropertyTypes` を有効化する。プロジェクト参照（`tsc --build`）で
  パッケージ間の依存を型レベルで強制する
- **Lint / 整形**: Biome 単体。ESLint + Prettier の組み合わせは採らない
- **テスト**: Vitest
- **Git フック**: lefthook（pre-commit で整形と型チェック、commit-msg で commitlint、pre-push でテスト）
- **検証の入口**: `pnpm run verify` に集約し、CI・フック・エージェントが同じものを実行する

Lint の警告は CI とフックの双方で失敗させる（`--error-on-warnings`）。
警告が残る状態を許すと、エージェントは「既存の警告」と「自分が出した警告」を区別できない。

## Consequences

- 検証の入口が1つなので、「ローカルでは通るがCIで落ちる」がほぼ起きない
- Biome 1本のため、ESLint エコシステムにしか無いルール（型情報を使う高度な検査など）は使えない。
  必要になったら ADR を追加して ESLint の併用を判断する
- 警告ゼロを強制するため、暫定的に汚いコードを残せない。
  意図的に残す場合は抑制コメントと理由を書くことになる
- `exactOptionalPropertyTypes` は既存ライブラリの型と衝突することがある。
  衝突したらアダプタ層で吸収し、コアの厳格さは緩めない

## Alternatives considered

- **npm workspaces** — モノレポでの依存解決と速度で pnpm に劣る
- **ESLint + Prettier** — 設定量と実行速度がフック運用に合わない
- **Jest** — ESM / TypeScript の設定コストが Vitest より高い
- **Deno / Bun** — ツールは揃うが、Electron や pdf.js など想定される依存の実績が Node に劣る
