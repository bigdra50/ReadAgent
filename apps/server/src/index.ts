/** CLI の入口。引数の解釈と listen だけを担当する（HTTP の中身は server.ts） */
import { createFileDocumentLoader, createReadAgentServer, DEFAULT_PORT, HOST } from './server.js';

const pdfPath = process.argv[2] ?? process.env.READAGENT_PDF;
if (!pdfPath) {
  process.stderr.write('使い方: readagent-server <path-to.pdf>\n');
  process.exit(1);
}

const port = Number(process.env.READAGENT_PORT ?? DEFAULT_PORT);
createReadAgentServer(createFileDocumentLoader(pdfPath)).listen(port, HOST, () => {
  process.stdout.write(`ReadAgent server: http://${HOST}:${port}  (${pdfPath})\n`);
});
