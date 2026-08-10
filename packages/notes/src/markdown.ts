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
  /** 引用より後の本文。時刻とアンカーは取り除いてある */
  readonly body: string;
  /** 記録した時刻（ISO 8601）。書式が違えば undefined */
  readonly createdAt?: string;
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

    entries.push({
      anchor,
      heading,
      quote: quoteLines.join('\n').trim(),
      // 時刻とアンカーは表示用の本文から外す。読み返すときに邪魔になる
      body: rawBody
        .replace(/<sub>[\s\S]*?<\/sub>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim(),
      ...(createdAt ? { createdAt } : {}),
    });
  }

  return entries;
}
