#!/usr/bin/env node
/**
 * Stop フック。
 * TypeScript を触ったターンの終わりに型チェックを走らせ、壊れていれば停止させずに直させる。
 * - stop_hook_active が立っている場合は再入しない（無限ループ防止）
 * - .ts の変更が無いターンでは何もしない（会話・ドキュメント編集を邪魔しない）
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if (payload.stop_hook_active) process.exit(0);

const exec = (cmd, args) =>
  execFileSync(cmd, args, { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let changed = '';
try {
  changed = exec('git', ['status', '--porcelain']);
} catch {
  process.exit(0);
}

const touchedTs = changed
  .split('\n')
  .some((line) => /\.tsx?$/.test(line.trim()) && !line.includes('node_modules'));

if (!touchedTs) process.exit(0);

try {
  exec('pnpm', ['run', 'typecheck']);
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().slice(-4000);
  console.error(
    `[verify-on-stop] 型チェックが失敗しています。修正してから終了してください。\n${output}`,
  );
  process.exit(2);
}

process.exit(0);
