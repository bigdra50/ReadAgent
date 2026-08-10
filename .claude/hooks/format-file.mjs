#!/usr/bin/env node
/**
 * PostToolUse(Edit|Write|MultiEdit) フック。
 * 触ったファイルだけを Biome で整形し、自動修正できない指摘があれば exit 2 で Claude に返す。
 * 「整形はツールがやる、Claude は中身に集中する」ための仕組み。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const filePath = payload.tool_input?.file_path;
if (!filePath) process.exit(0);

const supported = new Set(['.ts', '.tsx', '.js', '.mjs', '.jsx', '.json', '.jsonc', '.css']);
if (!supported.has(path.extname(filePath))) process.exit(0);

const relative = path.relative(projectDir, filePath);
if (relative.startsWith('..') || relative.includes(`node_modules${path.sep}`)) process.exit(0);

const run = (args) =>
  execFileSync('pnpm', ['exec', 'biome', ...args], {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

try {
  run(['check', '--write', '--error-on-warnings', '--no-errors-on-unmatched', relative]);
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error(
    `[format-file] ${relative} に Biome が自動修正できない指摘があります。修正してください。\n${output}`,
  );
  process.exit(2);
}

process.exit(0);
