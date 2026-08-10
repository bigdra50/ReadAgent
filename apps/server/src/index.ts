/** CLI の入口。引数の解釈と listen だけを担当する（HTTP の中身は server.ts） */
import { basename, dirname, extname } from 'node:path';
import { parsePartialNoteConfig, resolveNoteConfig } from '@readagent/core';
import { createFileNoteStore } from '@readagent/notes';
import { createFileDocumentLoader, createReadAgentServer, DEFAULT_PORT, HOST } from './server.js';

const pdfPath = process.argv[2] ?? process.env.READAGENT_PDF;
if (!pdfPath) {
  process.stderr.write('使い方: readagent-server <path-to.pdf>\n');
  process.exit(1);
}

// 設定ファイルの読み込みは Phase 3。それまでは環境変数を「スコープ設定」として扱う。
// 値の検証は core のパーサに任せ、不正な指定は警告して既定値のまま進む。
const { config: overrides, issues } = parsePartialNoteConfig({
  ...(process.env.READAGENT_UPDATE_MODE ? { updateMode: process.env.READAGENT_UPDATE_MODE } : {}),
  ...(process.env.READAGENT_NOTE_PATH ? { notePath: process.env.READAGENT_NOTE_PATH } : {}),
});
for (const issue of issues) {
  process.stderr.write(`設定の警告: ${issue}\n`);
}

// ノートは書籍と同じディレクトリに置く。読書記録が書籍の隣にあるほうが探しやすい。
const config = resolveNoteConfig(overrides);
const bookTitle = basename(pdfPath, extname(pdfPath));
const notes = createFileNoteStore({
  baseDir: dirname(pdfPath),
  notePath: config.notePath,
  bookTitle,
});

const port = Number(process.env.READAGENT_PORT ?? DEFAULT_PORT);
createReadAgentServer({
  loadDocument: createFileDocumentLoader(pdfPath),
  notes,
  noteConfig: overrides,
}).listen(port, HOST, () => {
  process.stdout.write(`ReadAgent server: http://${HOST}:${port}  (${pdfPath})\n`);
  process.stdout.write(`ノート: ${config.notePath} / 更新モード: ${config.updateMode}\n`);
});
