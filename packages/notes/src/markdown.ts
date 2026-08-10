/**
 * 読書ノート（Markdown）の組み立て。
 *
 * 保存形式は ADR-0006。書籍ごとに1ファイルへ追記し、既存のエントリは書き換えない。
 * ここはファイルに触らない純粋な処理にしてある。
 */

export interface NoteAnchor {
  readonly page: number;
  readonly start: number;
  readonly end: number;
}

export interface NoteEntryDraft {
  readonly anchor: NoteAnchor;
  /** 本文からの引用（表示用に整形済み） */
  readonly quote: string;
  readonly question?: string;
  readonly answer?: string;
  readonly tags?: readonly string[];
  /** ISO 8601。呼び出し側が渡す（時刻の取得はここの責務ではない） */
  readonly createdAt: string;
}

const ANCHOR_PATTERN = /<!--\s*readagent:anchor page=(\d+) start=(\d+) end=(\d+)\s*-->/g;

/** 本文へ戻るための目印。Markdown として読むときに邪魔にならない形にする */
export function renderAnchor(anchor: NoteAnchor): string {
  return `<!-- readagent:anchor page=${anchor.page} start=${anchor.start} end=${anchor.end} -->`;
}

/** ノート本文から、埋め込まれたアンカーを取り出す（ノート → 本文のリンク） */
export function parseAnchors(markdown: string): NoteAnchor[] {
  const anchors: NoteAnchor[] = [];
  for (const match of markdown.matchAll(ANCHOR_PATTERN)) {
    const [, page, start, end] = match;
    if (page && start && end) {
      anchors.push({ page: Number(page), start: Number(start), end: Number(end) });
    }
  }
  return anchors;
}

/** 引用を Markdown の引用ブロックにする。空行も引用として保つ */
function asBlockquote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

export function renderEntry(entry: NoteEntryDraft): string {
  const heading = entry.question?.trim() || '読書メモ';
  const lines = [
    `## p.${entry.anchor.page} ${heading}`,
    '',
    renderAnchor(entry.anchor),
    '',
    asBlockquote(entry.quote),
    '',
  ];

  if (entry.answer?.trim()) {
    lines.push(entry.answer.trim(), '');
  }

  if (entry.tags?.length) {
    lines.push(entry.tags.map((tag) => `#${tag}`).join(' '), '');
  }

  lines.push(`<sub>${entry.createdAt}</sub>`, '');
  return lines.join('\n');
}

/** 書籍ノートの先頭に置く見出し */
export function renderHeader(bookTitle: string): string {
  return `# ${bookTitle} 読書ノート\n\n`;
}

/**
 * 既存のノートへエントリを追記した結果を返す。
 * 追記しかしないので、利用者が手で編集した箇所と衝突しない（ADR-0006）。
 */
export function appendEntry(existing: string, entry: NoteEntryDraft, bookTitle?: string): string {
  const base = existing.trim()
    ? `${existing.replace(/\s+$/, '')}\n\n`
    : bookTitle
      ? renderHeader(bookTitle)
      : '';
  return `${base}${renderEntry(entry)}`;
}

export interface ParsedNoteEntry {
  readonly anchor: NoteAnchor;
  /** `## ` 見出しの本文（ページ表記を除いた部分） */
  readonly heading: string;
  readonly quote: string;
  /** 引用と時刻とタグを取り除いた本文 */
  readonly body: string;
  /** 記録した時刻（ISO 8601）。書式が違えば undefined */
  readonly createdAt?: string;
  /** `#タグ` の行から取り出したタグ。順序は本文の出現順 */
  readonly tags: readonly string[];
}

/** タグだけの行（`#a #b`）からタグを取り出す。本文中の `#` は拾わない */
const TAG_LINE = /^\s*(#[^\s#]+(?:\s+#[^\s#]+)*)\s*$/;

export function extractTags(body: string): { tags: string[]; rest: string } {
  const tags: string[] = [];
  const rest: string[] = [];

  for (const line of body.split('\n')) {
    const match = TAG_LINE.exec(line);
    if (match?.[1]) {
      for (const tag of match[1].split(/\s+/)) {
        const value = tag.slice(1);
        if (value && !tags.includes(value)) tags.push(value);
      }
      continue;
    }
    rest.push(line);
  }

  return { tags, rest: rest.join('\n').trim() };
}

/** ノート全体に出てくるタグを、使われた回数の多い順に返す */
export function collectTags(entries: readonly ParsedNoteEntry[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * ノートを読み返し用の構造に戻す。
 * ノート → 本文のジャンプ（要件 3.3 の双方向リンク）に使う。
 *
 * 手で編集されている前提で、解析できない部分は落として先に進む。
 * 1エントリの崩れでノート全体が読めなくなるほうが困る。
 */
export function parseEntries(markdown: string): ParsedNoteEntry[] {
  const entries: ParsedNoteEntry[] = [];
  const sections = markdown.split(/^## /m).slice(1);

  for (const section of sections) {
    const anchors = parseAnchors(section);
    const anchor = anchors[0];
    if (!anchor) continue; // アンカーが無いものは本文へ戻れないので対象外

    const lines = section.split('\n');
    const rawHeading = lines[0] ?? '';
    const heading = rawHeading.replace(/^p\.\d+\s*/, '').trim();

    const quoteLines: string[] = [];
    const bodyLines: string[] = [];
    let seenQuote = false;

    for (const line of lines.slice(1)) {
      if (line.startsWith('>')) {
        seenQuote = true;
        quoteLines.push(line.replace(/^>\s?/, ''));
      } else if (seenQuote) {
        bodyLines.push(line);
      }
    }

    const rawBody = bodyLines.join('\n');
    const createdAt = /<sub>([^<]+)<\/sub>/.exec(rawBody)?.[1]?.trim();

    // 時刻・アンカー・タグは表示用の本文から外す。読み返すときに邪魔になる
    const { tags, rest } = extractTags(
      rawBody.replace(/<sub>[\s\S]*?<\/sub>/g, '').replace(/<!--[\s\S]*?-->/g, ''),
    );

    entries.push({
      anchor,
      heading,
      quote: quoteLines.join('\n').trim(),
      body: rest,
      tags,
      ...(createdAt ? { createdAt } : {}),
    });
  }

  return entries;
}

export interface NoteSummaryDraft {
  /** まとめの対象範囲。ページ番号の下限と上限 */
  readonly fromPage: number;
  readonly toPage: number;
  /** まとめ本文（Mermaid を含んでよい） */
  readonly body: string;
  readonly tags?: readonly string[];
  readonly createdAt: string;
}

export interface ParsedNoteSummary {
  readonly fromPage: number;
  readonly toPage: number;
  readonly body: string;
  readonly createdAt?: string;
}

const SUMMARY_PATTERN = /<!--\s*readagent:summary pages=(\d+)-(\d+)\s*-->/g;

/**
 * まとめのエントリを組み立てる。
 *
 * 既存のエントリを書き換えず、末尾に足すだけにしてある（ADR-0009）。
 * 再構成は「読み直して要約を書き足す」ことであって、記録の改変ではない。
 */
export function renderSummary(summary: NoteSummaryDraft): string {
  const lines = [
    `## まとめ p.${summary.fromPage}–${summary.toPage}`,
    '',
    `<!-- readagent:summary pages=${summary.fromPage}-${summary.toPage} -->`,
    '',
    summary.body.trim(),
    '',
  ];

  if (summary.tags?.length) {
    lines.push(summary.tags.map((tag) => `#${tag}`).join(' '), '');
  }

  lines.push(`<sub>${summary.createdAt}</sub>`, '');
  return lines.join('\n');
}

export function appendSummary(existing: string, summary: NoteSummaryDraft): string {
  const base = existing.trim() ? `${existing.replace(/\s+$/, '')}\n\n` : '';
  return `${base}${renderSummary(summary)}`;
}

/** まとめだけを取り出す。読書エントリ（parseEntries）とは別に扱う */
export function parseSummaries(markdown: string): ParsedNoteSummary[] {
  const summaries: ParsedNoteSummary[] = [];

  for (const section of markdown.split(/^## /m).slice(1)) {
    SUMMARY_PATTERN.lastIndex = 0;
    const match = SUMMARY_PATTERN.exec(section);
    const from = match?.[1];
    const to = match?.[2];
    if (!from || !to) continue;

    const withoutHeading = section.split('\n').slice(1).join('\n');
    const createdAt = /<sub>([^<]+)<\/sub>/.exec(withoutHeading)?.[1]?.trim();

    summaries.push({
      fromPage: Number(from),
      toPage: Number(to),
      body: withoutHeading
        .replace(/<sub>[\s\S]*?<\/sub>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim(),
      ...(createdAt ? { createdAt } : {}),
    });
  }

  return summaries;
}
