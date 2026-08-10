import { describe, expect, it } from 'vitest';
import { splitBlocks } from '../src/blocks.js';

describe('splitBlocks', () => {
  it('文章だけならひとかたまりで返す', () => {
    expect(splitBlocks('ふつうの文章\n続き')).toEqual([
      { kind: 'text', content: 'ふつうの文章\n続き' },
    ]);
  });

  it('コードブロックを言語つきで切り出す', () => {
    const blocks = splitBlocks('前置き\n\n```mermaid\ngraph TD\n  A-->B\n```\n\n後書き');

    expect(blocks).toEqual([
      { kind: 'text', content: '前置き' },
      { kind: 'code', language: 'mermaid', content: 'graph TD\n  A-->B' },
      { kind: 'text', content: '後書き' },
    ]);
  });

  it('言語の指定が無いコードブロックも扱う', () => {
    const blocks = splitBlocks('```\nplain\n```');

    expect(blocks).toEqual([{ kind: 'code', language: '', content: 'plain' }]);
  });

  it('複数のブロックを順に返す', () => {
    const blocks = splitBlocks('```mermaid\nA\n```\n中\n```ts\nconst x = 1;\n```');

    expect(blocks.map((block) => block.kind)).toEqual(['code', 'text', 'code']);
    expect(blocks[2]).toEqual({ kind: 'code', language: 'ts', content: 'const x = 1;' });
  });

  it('閉じられていないフェンスは文章として出す（書きかけを消さない）', () => {
    const blocks = splitBlocks('説明\n\n```mermaid\ngraph TD');

    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toEqual({ kind: 'text', content: '```mermaid\ngraph TD' });
  });

  it('空の本文では何も返さない', () => {
    expect(splitBlocks('')).toEqual([]);
    expect(splitBlocks('   \n  ')).toEqual([]);
  });
});
