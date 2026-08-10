import { splitBlocks } from '@readagent/notes/blocks';
import { Mermaid } from './Mermaid';

/** ノート本文。Mermaid のブロックだけ図として描き、それ以外はそのまま出す */
export function NoteBody({ body }: { readonly body: string }) {
  const blocks = splitBlocks(body);

  return (
    <>
      {blocks.map((block, index) =>
        block.kind === 'code' && block.language === 'mermaid' ? (
          // ノートのブロックは並び順で一意。並べ替えは起きない
          // biome-ignore lint/suspicious/noArrayIndexKey: 表示順が識別子として妥当
          <Mermaid key={index} code={block.content} />
        ) : block.kind === 'code' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同上
          <pre key={index} className="note-code">
            {block.content}
          </pre>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同上
          <p key={index} className="note-body">
            {block.content}
          </p>
        ),
      )}
    </>
  );
}
