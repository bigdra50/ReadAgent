/**
 * ページ本文の組み立て。
 *
 * 設計の根拠は docs/spike-pdf-text-anchor.md にある実測結果:
 * - 正規のページ文字列には、テキストアイテムの文字列だけを連結する。
 *   改行を合成すると、その改行はブラウザのテキストレイヤ上のどのノードにも属さず、
 *   選択位置（オフセット）を DOM へ復元できなくなる（実測で 1.6〜4.5% が復元不能）。
 * - 行の区切りは本文とは別に保持し、表示や引用のときにだけ合成する。
 */

/** pdf.js の TextItem のうち、本文の組み立てに必要な部分だけ */
export interface TextItemLike {
  readonly str: string;
  readonly hasEOL: boolean;
}

export interface PageText {
  /** アイテム文字列を連結しただけの正規テキスト。アンカーはこの上のオフセットで表す */
  readonly text: string;
  /** 行が終わる位置（この位置の直前までが1行）。昇順・重複なし */
  readonly lineBreaks: readonly number[];
}

export function buildPageText(items: readonly TextItemLike[]): PageText {
  let text = '';
  const lineBreaks: number[] = [];

  for (const item of items) {
    text += item.str;
    if (item.hasEOL && lineBreaks.at(-1) !== text.length) {
      lineBreaks.push(text.length);
    }
  }

  return { text, lineBreaks };
}

/** 正規テキストの [start, end) を切り出す。範囲はテキスト長に丸める */
export function sliceRange(page: PageText, start: number, end: number): string {
  const from = Math.max(0, Math.min(start, page.text.length));
  const to = Math.max(from, Math.min(end, page.text.length));
  return page.text.slice(from, to);
}

export interface QuoteOptions {
  /** 行末のハイフンで分断された語を繋ぐ（既定: true） */
  readonly joinHyphenated?: boolean;
}

/**
 * 人間とエージェントに見せるための引用文を作る。
 * 行の区切りを復元し、行末ハイフンで割れた語を繋ぐ。
 *
 * 保存するのはあくまで正規テキスト上のオフセットで、ここで作る文字列は表示用。
 * この2つを混ぜると、引用の整形を変えた瞬間にノートのリンクが壊れる。
 */
export function renderQuote(
  page: PageText,
  start: number,
  end: number,
  options: QuoteOptions = {},
): string {
  const { joinHyphenated = true } = options;
  const from = Math.max(0, Math.min(start, page.text.length));
  const to = Math.max(from, Math.min(end, page.text.length));

  let quote = '';
  let cursor = from;
  for (const at of page.lineBreaks) {
    if (at <= from || at >= to) continue;
    quote += page.text.slice(cursor, at);
    quote += '\n';
    cursor = at;
  }
  quote += page.text.slice(cursor, to);

  if (joinHyphenated) {
    // 行末のハイフン + 改行 + 小文字始まり を、分断された1語とみなして繋ぐ。
    // 「TCP-\nIP」のような大文字始まりは複合語の可能性が高いので触らない。
    quote = quote.replace(/(\p{Ll})[-‐]\n(\p{Ll})/gu, '$1$2');
  }

  return quote;
}
