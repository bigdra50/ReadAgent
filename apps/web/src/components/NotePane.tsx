import { useCallback, useRef, useState } from 'react';
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
}: Props) {
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** 溜まったノートを読み直してまとめを書き足す（ADR-0009） */
  const summarize = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSummary('');
    setSummaryError(null);
    setSummarizing(true);

    try {
      for await (const event of streamSummary(bookId, controller.signal)) {
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
  }, [bookId, onSummarized]);

  return (
    <section className="notes">
      <h2>読書ノート</h2>

      {entries.length > 0 && (
        <div className="ask">
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

      <ol className="note-list">
        {entries.map((entry) => (
          <li key={`${entry.anchor.page}-${entry.anchor.start}-${entry.anchor.end}`}>
            <button type="button" className="note-jump" onClick={() => onJump(entry.anchor)}>
              <span className="note-page">p.{entry.anchor.page}</span>
              <span className="note-heading">{entry.heading}</span>
            </button>
            <blockquote>{entry.quote}</blockquote>
            {entry.body && <NoteBody body={entry.body} />}
          </li>
        ))}
      </ol>
    </section>
  );
}
