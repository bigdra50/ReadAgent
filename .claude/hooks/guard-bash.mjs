#!/usr/bin/env node
/**
 * PreToolUse(Bash) フック。
 * 事故と規約違反をコマンド実行前に止める。exit 2 で拒否理由が Claude に返る。
 */
import { readFileSync } from 'node:fs';

/** @type {{ tool_input?: { command?: string } }} */
let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // 入力を読めない場合は素通しする（フックで作業を止めない）
}

const command = payload.tool_input?.command ?? '';

const rules = [
  {
    // pnpm ワークスペースなので他のパッケージマネージャは lockfile を壊す
    pattern: /(^|[;&|\n]\s*)(npm|yarn)\s+(i|install|add|ci|remove|up|update)\b/,
    message: 'このリポジトリは pnpm ワークスペースです。npm/yarn ではなく pnpm を使ってください。',
  },
  {
    pattern: /git\s+push\s+.*(--force|-f)\b/,
    message:
      'force push は禁止です。履歴を書き換えたい場合は理由を説明してユーザーの判断を仰いでください。',
  },
  {
    pattern: /git\s+(commit|push)\b[^|;&]*\b(main|master)\b/,
    message: 'main ブランチへの直接の commit/push は行わず、作業ブランチを使ってください。',
  },
  {
    pattern: /(^|[;&|\n]\s*)rm\s+(-[a-zA-Z]*\s+)*-?[a-zA-Z]*[rR][a-zA-Z]*f?\s+(\/|~|\$HOME)(\s|$)/,
    message: 'ホーム/ルート配下の再帰削除は危険です。対象パスを限定してください。',
  },
  {
    pattern: /(^|[;&|\n]\s*)(cat|less|head|tail|grep)\s+[^|;&]*\.env(\s|$|\.)/,
    message: '.env は秘匿情報です。必要な変数名は .env.example を参照してください。',
  },
];

for (const rule of rules) {
  if (rule.pattern.test(command)) {
    console.error(`[guard-bash] ${rule.message}`);
    process.exit(2);
  }
}

process.exit(0);
