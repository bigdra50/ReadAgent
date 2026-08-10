/**
 * ノート本文を、そのまま出す文章と、図として描くコードブロックに分ける。
 *
 * Markdown の完全な解析はしない。要件 3.3 が挙げているのは図解（Mermaid）で、
 * それを見分けるのに必要なのはフェンスの検出だけである。
 * 汎用の Markdown レンダラを入れるのは、必要になってからでよい。
 */

export type NoteBlock =
  | { readonly kind: 'text'; readonly content: string }
  | { readonly kind: 'code'; readonly language: string; readonly content: string };

const FENCE = /^```([\w-]*)\s*$/;

export function splitBlocks(body: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  const lines = body.split('\n');

  let buffer: string[] = [];
  let fence: string | null = null;

  const flushText = () => {
    const content = buffer.join('\n').trim();
    if (content) blocks.push({ kind: 'text', content });
    buffer = [];
  };

  for (const line of lines) {
    const match = FENCE.exec(line.trim());

    if (fence === null && match) {
      flushText();
      fence = match[1] ?? '';
      continue;
    }

    if (fence !== null && line.trim() === '```') {
      blocks.push({ kind: 'code', language: fence, content: buffer.join('\n') });
      buffer = [];
      fence = null;
      continue;
    }

    buffer.push(line);
  }

  // 閉じられていないフェンスは、書きかけとみなして文章として出す
  if (fence !== null) {
    buffer.unshift(`\`\`\`${fence}`);
  }
  flushText();

  return blocks;
}
