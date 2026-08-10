import type { ParsedNoteEntry } from '../lib/notes';
import type { SelectionRange } from './TextLayer';

interface Props {
  readonly entries: readonly ParsedNoteEntry[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onJump: (target: SelectionRange) => void;
}

/**
 * 読書ノート（要件 3.3 / 4）。
 * エントリから本文へ戻れることが、このペインの存在理由。
 *
 * 読み込みは App が持つ。ノートが更新される契機（チャットのイベント）を
 * 知っているのが App だけで、ここに置くと更新の合図を props で渡すことになる。
 */
export function NotePane({ entries, loading, error, onJump }: Props) {
  return (
    <section className="notes">
      <h2>読書ノート</h2>
      {error && <p className="error">{error}</p>}
      {loading && entries.length === 0 && <p className="muted">読み込んでいます…</p>}
      {!loading && entries.length === 0 && !error && (
        <p className="muted">まだノートはありません。対話するとここに溜まります。</p>
      )}

      <ol className="note-list">
        {entries.map((entry) => (
          <li key={`${entry.anchor.page}-${entry.anchor.start}-${entry.anchor.end}`}>
            <button type="button" className="note-jump" onClick={() => onJump(entry.anchor)}>
              <span className="note-page">p.{entry.anchor.page}</span>
              <span className="note-heading">{entry.heading}</span>
            </button>
            <blockquote>{entry.quote}</blockquote>
            {entry.body && <p className="note-body">{entry.body}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
