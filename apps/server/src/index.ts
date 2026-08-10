/**
 * CLI の入口。引数の解釈と listen だけを担当する（HTTP の中身は server.ts）。
 *
 * 引数には PDF か、PDF を並べたディレクトリを渡す。
 * 1冊だけ読むときも複数冊のときも、扱いは同じ Library に寄せてある。
 */
import { createFileLibrary, isDirectory, isReadablePdf } from './library.js';
import { createReadAgentServer, DEFAULT_PORT, HOST } from './server.js';

const target = process.argv[2] ?? process.env.READAGENT_PDF;
if (!target) {
  process.stderr.write('使い方: readagent-server <path-to.pdf | 書籍のディレクトリ>\n');
  process.exit(1);
}

const library = (await isDirectory(target))
  ? createFileLibrary({ dir: target })
  : (await isReadablePdf(target))
    ? createFileLibrary({ paths: [target] })
    : null;

if (!library) {
  process.stderr.write(`PDF でもディレクトリでもありません: ${target}\n`);
  process.exit(1);
}

const books = await library.list();
if (books.length === 0) {
  process.stderr.write(`書籍が見つかりません: ${target}\n`);
  process.exit(1);
}

const port = Number(process.env.READAGENT_PORT ?? DEFAULT_PORT);
createReadAgentServer({ library }).listen(port, HOST, () => {
  process.stdout.write(`ReadAgent server: http://${HOST}:${port}\n`);
  process.stdout.write(`書籍 ${books.length} 冊:\n`);
  for (const book of books) {
    process.stdout.write(`  - ${book.title} (${book.id})\n`);
  }
});
