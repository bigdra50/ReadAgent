import { describe, expect, it } from 'vitest';
import {
  appendEntry,
  parseAnchors,
  parseEntries,
  renderAnchor,
  renderEntry,
} from '../src/markdown.js';

const entry = {
  anchor: { page: 12, start: 100, end: 140 },
  quote: 'トレースを記録する',
  question: 'なぜガードが要る？',
  answer: '前提が崩れていないかを確認するため。',
  createdAt: '2026-08-10T00:00:00.000Z',
};

describe('renderEntry', () => {
  it('見出しにページと質問を出す', () => {
    expect(renderEntry(entry)).toContain('## p.12 なぜガードが要る？');
  });

  it('質問が無ければ既定の見出しにする', () => {
    const { question: _, ...withoutQuestion } = entry;

    expect(renderEntry(withoutQuestion)).toContain('## p.12 読書メモ');
  });

  it('引用を引用ブロックにする', () => {
    expect(renderEntry(entry)).toContain('> トレースを記録する');
  });

  it('複数行の引用でも各行を引用にする', () => {
    const multiline = { ...entry, quote: '一行目\n\n三行目' };
    const rendered = renderEntry(multiline);

    expect(rendered).toContain('> 一行目');
    expect(rendered).toContain('> 三行目');
    expect(rendered).not.toContain('\n\n三行目');
  });

  it('回答とタグと時刻を含める', () => {
    const rendered = renderEntry({ ...entry, tags: ['jit', 'trace'] });

    expect(rendered).toContain('前提が崩れていないかを確認するため。');
    expect(rendered).toContain('#jit #trace');
    expect(rendered).toContain('2026-08-10T00:00:00.000Z');
  });

  it('回答が空なら回答欄を出さない', () => {
    const rendered = renderEntry({ ...entry, answer: '   ' });

    expect(rendered.split('\n').filter((line) => line.trim() === '')).not.toHaveLength(0);
    expect(rendered).not.toContain('undefined');
  });
});

describe('アンカー', () => {
  it('本文へ戻る位置を埋め込む', () => {
    expect(renderAnchor({ page: 3, start: 10, end: 20 })).toBe(
      '<!-- readagent:anchor page=3 start=10 end=20 -->',
    );
  });

  it('埋め込んだアンカーを取り出せる（ノート ↔ 本文の双方向リンク）', () => {
    const markdown = renderEntry(entry);

    expect(parseAnchors(markdown)).toEqual([{ page: 12, start: 100, end: 140 }]);
  });

  it('複数エントリのアンカーを順に取り出す', () => {
    const first = renderEntry(entry);
    const second = renderEntry({ ...entry, anchor: { page: 20, start: 0, end: 5 } });

    expect(parseAnchors(`${first}\n${second}`)).toEqual([
      { page: 12, start: 100, end: 140 },
      { page: 20, start: 0, end: 5 },
    ]);
  });

  it('アンカーが無い文書では空を返す', () => {
    expect(parseAnchors('# ただのメモ\n\n本文')).toEqual([]);
  });
});

describe('appendEntry', () => {
  it('空のノートには見出しから作る', () => {
    const result = appendEntry('', entry, '型システム入門');

    expect(result.startsWith('# 型システム入門 読書ノート')).toBe(true);
    expect(result).toContain('## p.12');
  });

  it('既存のノートの末尾に足す', () => {
    const first = appendEntry('', entry, '本');
    const second = appendEntry(first, { ...entry, anchor: { page: 13, start: 0, end: 3 } });

    expect(second.indexOf('## p.12')).toBeLessThan(second.indexOf('## p.13'));
    expect(second.split('# 本 読書ノート')).toHaveLength(2);
  });

  it('既存の内容を書き換えない（手で編集した箇所を壊さない）', () => {
    const handwritten = '# 私のノート\n\n自分で書いたメモ。消えたら困る。\n';
    const result = appendEntry(handwritten, entry);

    expect(result).toContain('自分で書いたメモ。消えたら困る。');
    expect(result.indexOf('自分で書いた')).toBeLessThan(result.indexOf('## p.12'));
  });

  it('追記してもアンカーは全て残る', () => {
    let note = appendEntry('', entry, '本');
    note = appendEntry(note, { ...entry, anchor: { page: 13, start: 0, end: 3 } });
    note = appendEntry(note, { ...entry, anchor: { page: 14, start: 5, end: 9 } });

    expect(parseAnchors(note)).toHaveLength(3);
  });
});

describe('parseEntries', () => {
  const build = () => {
    let note = appendEntry('', entry, '本');
    note = appendEntry(note, {
      anchor: { page: 20, start: 5, end: 9 },
      quote: '二件目の引用',
      question: '二件目の質問',
      answer: '二件目の回答',
      createdAt: '2026-08-10T01:00:00.000Z',
    });
    return note;
  };

  it('エントリをアンカーつきで取り出す', () => {
    const entries = parseEntries(build());

    expect(entries).toHaveLength(2);
    expect(entries[0]?.anchor).toEqual({ page: 12, start: 100, end: 140 });
    expect(entries[1]?.anchor).toEqual({ page: 20, start: 5, end: 9 });
  });

  it('見出しからページ表記を落とす', () => {
    expect(parseEntries(build())[0]?.heading).toBe('なぜガードが要る？');
  });

  it('引用と本文を分ける', () => {
    const parsed = parseEntries(build())[1];

    expect(parsed?.quote).toBe('二件目の引用');
    expect(parsed?.body).toContain('二件目の回答');
    expect(parsed?.body).not.toContain('readagent:anchor');
  });

  it('時刻は本文から外して取り出す（読み返すときに邪魔になる）', () => {
    const parsed = parseEntries(build())[1];

    expect(parsed?.createdAt).toBe('2026-08-10T01:00:00.000Z');
    expect(parsed?.body).not.toContain('<sub>');
    expect(parsed?.body).not.toContain('2026-08-10T01:00:00.000Z');
  });

  it('複数行の引用を復元する', () => {
    const note = appendEntry('', { ...entry, quote: '一行目\n二行目' });

    expect(parseEntries(note)[0]?.quote).toBe('一行目\n二行目');
  });

  it('アンカーが無い節は飛ばす（手書きのメモを壊さない）', () => {
    const note = `# ノート\n\n## 自分で書いた見出し\n\n本文\n\n${renderEntry(entry)}`;

    const entries = parseEntries(note);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.heading).toBe('なぜガードが要る？');
  });

  it('エントリが無ければ空を返す', () => {
    expect(parseEntries('')).toEqual([]);
    expect(parseEntries('# 見出しだけ')).toEqual([]);
  });
});
