import { describe, expect, it } from 'vitest';
import { buildSelectionPrompt } from '../src/prompt.js';

const budget = { maxContextChars: 8000 };

describe('buildSelectionPrompt', () => {
  it('選択箇所とページを含める', () => {
    const prompt = buildSelectionPrompt({ page: 12, quote: 'トレースを記録する' }, budget);

    expect(prompt).toContain('ページ: 12');
    expect(prompt).toContain('選択箇所:');
    expect(prompt).toContain('トレースを記録する');
  });

  it('質問が無ければ解説を求める', () => {
    const prompt = buildSelectionPrompt({ page: 1, quote: 'x' }, budget);

    expect(prompt).toContain('この箇所について解説してください。');
  });

  it('質問があればそれを使う', () => {
    const prompt = buildSelectionPrompt(
      { page: 1, quote: 'x', question: 'なぜガードが必要なのか？' },
      budget,
    );

    expect(prompt).toContain('なぜガードが必要なのか？');
    expect(prompt).not.toContain('この箇所について解説してください。');
  });

  it('空白だけの質問は既定の依頼として扱う', () => {
    const prompt = buildSelectionPrompt({ page: 1, quote: 'x', question: '   ' }, budget);

    expect(prompt).toContain('この箇所について解説してください。');
  });

  it('周辺文脈があれば前後として添える', () => {
    const prompt = buildSelectionPrompt(
      { page: 3, quote: '本題', before: '前の話', after: '次の話' },
      budget,
    );

    expect(prompt).toContain('直前の文脈:');
    expect(prompt).toContain('前の話');
    expect(prompt).toContain('直後の文脈:');
    expect(prompt).toContain('次の話');
  });

  it('予算を超えたら周辺文脈から削る', () => {
    const prompt = buildSelectionPrompt(
      { page: 1, quote: 'abcde', before: 'B'.repeat(100), after: 'A'.repeat(100) },
      { maxContextChars: 10 },
    );

    expect(prompt).toContain('abcde');
    // 引用 5 文字 + 周辺 5 文字 = 予算ちょうど
    expect((prompt.match(/B/g) ?? []).length + (prompt.match(/A/g) ?? []).length).toBe(5);
  });

  it('引用だけで予算を使い切るときは周辺文脈を諦める', () => {
    const prompt = buildSelectionPrompt(
      { page: 1, quote: 'Q'.repeat(50), before: 'B'.repeat(50) },
      { maxContextChars: 20 },
    );

    expect(prompt).toContain('Q'.repeat(20));
    expect(prompt).not.toContain('直前の文脈:');
  });

  it('直前の文脈は末尾側を残す（選択箇所に近いほうが効く）', () => {
    const prompt = buildSelectionPrompt(
      { page: 1, quote: 'x', before: '遠い部分。近い部分' },
      { maxContextChars: 6 },
    );

    expect(prompt).toContain('近い部分');
    expect(prompt).not.toContain('遠い部分');
  });

  it('全文を投げない（予算が本文長より小さければ必ず切り詰められる）', () => {
    const huge = 'あ'.repeat(50_000);
    const prompt = buildSelectionPrompt({ page: 1, quote: huge }, { maxContextChars: 100 });

    expect(prompt.length).toBeLessThan(500);
  });
});
