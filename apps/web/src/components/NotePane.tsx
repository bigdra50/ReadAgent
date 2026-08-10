import type { ChapterRange } from '@readagent/core';
import { collectTags } from '@readagent/notes/markdown';
import { useCallback, useMemo, useRef, useState } from 'react';
import { streamSummary } from '../lib/chat';
import type { ParsedNoteEntry, ParsedNoteSummary } from '../lib/notes';
import { NoteBody } from './NoteBody';
import type { SelectionRange } from './TextLayer';

interface Props {
  readonly bookId: string;
  readonly entries: readonly ParsedNoteEntry[];
  readonly summaries: readonly ParsedNoteSummary[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onJump: (target: SelectionRange) => void;
  readonly onSummarized: () => void;
  /** 目次から求めた章の範囲。ページが解決できた書籍でだけ使える */
  readonly chapters: readonly ChapterRange[];
}

/**
 * 読書ノート（要件 3.3 / 4）。
 * エントリから本文へ戻れることが、このペインの存在理由。
 *
 * 読み込みは App が持つ。ノートが更新される契機（チャットのイベント）を
 * 知っているのが App だけで、ここに置くと更新の合図を props で渡すことになる。
 */
export function NotePane({
  bookId,
  entries,
  summaries,
  loading,
  error,
  onJump,
  onSummarized,
  chapters,
}: Props) {
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [scopeId, setScopeId] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const tags = useMemo(() => collectTags(entries), [entries]);
  const shown = useMemo(
    () => (activeTag ? entries.filter((entry) => entry.tags.includes(activeTag)) : entries),
    [entries, activeTag],
  );

  /** 溜まったノートを読み直してまとめを書き足す（ADR-0009） */
  const summarize = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSummary('');
    setSummaryError(null);
    setSummarizing(true);

    try {
      const chapter = chapters.find((item) => item.id === scopeId);
      const scope = chapter
        ? { fromPage: chapter.fromPage, toPage: chapter.toPage, title: chapter.title }
        : {};

      for await (const event of streamSummary(bookId, scope, controller.signal)) {
        if (event.type === 'text') setSummary((current) => current + event.text);
        if (event.type === 'note-updated') {
          // まとめ本文はノート側に描き直されるので、途中経過は消す（同じ文章を二重に見せない）
          setSummary('');
          onSummarized();
        }
        if (event.type === 'note-failed') setSummaryError(event.error);
        if (event.type === 'done' && !event.ok) setSummaryError(event.error ?? '失敗しました');
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setSummaryError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      setSummarizing(false);
    }
  }, [bookId, chapters, onSummarized, scopeId]);

  return (
    <section className="notes">
      <h2>読書ノート</h2>

      {entries.length > 0 && (
        <div className="ask">
          {chapters.length > 0 && (
            <label className="scope">
              <span className="visually-hidden">まとめる範囲</span>
              <select value={scopeId} onChange={(event) => setScopeId(event.target.value)}>
                <option value="">ノート全体</option>
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {'　'.repeat(chapter.depth)}
                    {chapter.title}（p.{chapter.fromPage}–{chapter.toPage}）
                  </option>
                ))}
              </select>
            </label>
          )}
          {summarizing ? (
            <button type="button" onClick={() => abortRef.current?.abort()}>
              中断
            </button>
          ) : (
            <button type="button" onClick={() => void summarize()}>
              読み直してまとめる
            </button>
          )}
        </div>
      )}
      {summary && <div className="answer">{summary}</div>}
      {summaryError && <p className="error">{summaryError}</p>}
      {error && <p className="error">{error}</p>}
      {loading && entries.length === 0 && <p className="muted">読み込んでいます…</p>}
      {!loading && entries.length === 0 && summaries.length === 0 && !error && (
        <p className="muted">まだノートはありません。対話するとここに溜まります。</p>
      )}

      {summaries.length > 0 && (
        <section className="summaries">
          <h3>まとめ</h3>
          {summaries.map((item) => (
            <article key={`${item.fromPage}-${item.toPage}-${item.createdAt ?? ''}`}>
              <span className="note-page">
                p.{item.fromPage}–{item.toPage}
              </span>
              <NoteBody body={item.body} />
            </article>
          ))}
        </section>
      )}

      {tags.length > 0 && (
        <ul className="tag-list">
          {tags.map(({ tag, count }) => (
            <li key={tag}>
              <button
                type="button"
                aria-pressed={activeTag === tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              >
                #{tag} <span className="muted">{count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ol className="note-list">
        {shown.map((entry) => (
          <li key={`${entry.anchor.page}-${entry.anchor.start}-${entry.anchor.end}`}>
            <button type="button" className="note-jump" onClick={() => onJump(entry.anchor)}>
              <span className="note-page">p.{entry.anchor.page}</span>
              <span className="note-heading">{entry.heading}</span>
            </button>
            <blockquote>{entry.quote}</blockquote>
            {entry.body && <NoteBody body={entry.body} />}
            {entry.tags.length > 0 && (
              <p className="entry-tags">{entry.tags.map((tag) => `#${tag}`).join(' ')}</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
