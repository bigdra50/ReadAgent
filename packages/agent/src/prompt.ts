/**
 * 選択範囲からエージェントへの問いかけを組み立てる。
 *
 * 全文を投げないことが設計の前提（要件 5）。渡すのは選択範囲と、その周辺だけで、
 * 合計は maxContextChars を超えない。超える場合は周辺から先に削る。
 */

export interface SelectionContext {
  /** 書籍名。分かる範囲でよい */
  readonly bookTitle?: string;
  readonly page: number;
  /** 選択範囲の引用（表示用に整形済み） */
  readonly quote: string;
  /** 選択の前後にある本文。無くてもよい */
  readonly before?: string;
  readonly after?: string;
  /** 読者からの質問。無ければ「解説してほしい」とみなす */
  readonly question?: string;
}

export interface PromptBudget {
  readonly maxContextChars: number;
}

export const SYSTEM_PROMPT = [
  'あなたは技術書を読んでいる読者の相棒です。読者が選んだ箇所について、深く正確に答えます。',
  '',
  '守ること:',
  '- 選択範囲の内容を出発点にする。書かれていないことを、書いてあるかのように語らない。',
  '- 確信が持てないことは「本文からは判断できない」と明示する。推測は推測と分かる形で述べる。',
  '- 前置きと要約の繰り返しをしない。読者は本文を読んだ上で質問している。',
  '- 必要なら図解を Mermaid で示す。文章で足りるなら図は描かない。',
  '- 日本語で答える。技術用語は原語を併記してよい。',
].join('\n');

/** 引用と周辺文脈を、予算に収まるように切り詰める */
function fitToBudget(context: SelectionContext, budget: PromptBudget) {
  const max = Math.max(0, budget.maxContextChars);
  // 引用が最優先。これが入らないなら文脈は諦める
  const quote = context.quote.slice(0, max);
  let remaining = max - quote.length;

  const take = (text: string | undefined, fromEnd: boolean) => {
    if (!text || remaining <= 0) return '';
    const slice = fromEnd ? text.slice(-remaining) : text.slice(0, remaining);
    remaining -= slice.length;
    return slice;
  };

  // 直前の文脈のほうが、選択箇所の理解に効くことが多い
  const before = take(context.before, true);
  const after = take(context.after, false);
  return { quote, before, after };
}

export function buildSelectionPrompt(context: SelectionContext, budget: PromptBudget): string {
  const { quote, before, after } = fitToBudget(context, budget);
  const lines: string[] = [];

  if (context.bookTitle) lines.push(`書籍: ${context.bookTitle}`);
  lines.push(`ページ: ${context.page}`);
  lines.push('');

  if (before) {
    lines.push('直前の文脈:', before, '');
  }

  lines.push('選択箇所:', quote, '');

  if (after) {
    lines.push('直後の文脈:', after, '');
  }

  lines.push(context.question?.trim() || 'この箇所について解説してください。');
  return lines.join('\n');
}
