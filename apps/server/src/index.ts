/** CLI の入口。引数の解釈と listen だけを担当する（HTTP の中身は server.ts） */
import { basename, dirname, extname } from 'node:path';
import { createFileNoteStore } from '@readagent/notes';
import { loadNoteConfig } from './config.js';
import { createFileDocumentLoader, createReadAgentServer, DEFAULT_PORT, HOST } from './server.js';

const pdfPath = process.argv[2] ?? process.env.READAGENT_PDF;
if (!pdfPath) {
  process.stderr.write('使い方: readagent-server <path-to.pdf>\n');
  process.exit(1);
}

// グローバル → 書籍 → スコープ の順に解決する（要件 3.4）
const { config, sources, issues } = await loadNoteConfig({ bookPath: pdfPath });
for (const issue of issues) {
  process.stderr.write(`設定の警告: ${issue}\n`);
}

// ノートは書籍と同じディレクトリに置く。読書記録が書籍の隣にあるほうが探しやすい。
const notes = createFileNoteStore({
  baseDir: dirname(pdfPath),
  notePath: config.notePath,
  bookTitle: basename(pdfPath, extname(pdfPath)),
});

const port = Number(process.env.READAGENT_PORT ?? DEFAULT_PORT);
createReadAgentServer({
  loadDocument: createFileDocumentLoader(pdfPath),
  notes,
  noteConfig: config,
}).listen(port, HOST, () => {
  process.stdout.write(`ReadAgent server: http://${HOST}:${port}  (${pdfPath})\n`);
  process.stdout.write(`ノート: ${config.notePath} / 更新モード: ${config.updateMode}\n`);
  process.stdout.write(`設定の層: ${sources.length > 0 ? sources.join(' → ') : '既定値のみ'}\n`);
});
