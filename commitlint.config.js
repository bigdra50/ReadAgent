/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 日本語のコミットメッセージを前提とするため、英語向けの大文字小文字ルールは外す。
    // 「GitHub Actions を…」「Claude Code の…」のように固有名詞で始まる件名が
    // start-case として弾かれてしまうため。
    'subject-case': [0],
    // 日本語は1行あたりの情報量が多く、既定の100文字では折り返しが不自然になる。
    'body-max-line-length': [1, 'always', 150],
    'scope-enum': [
      1,
      'always',
      ['core', 'agent', 'notes', 'server', 'web', 'config', 'docs', 'adr', 'ci', 'harness', 'deps'],
    ],
  },
};
