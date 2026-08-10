import { useCallback, useState } from 'react';
import { type SearchHit, searchNotes } from '../lib/api';

interface Props {
  readonly onOpen: (hit: SearchHit) => void;
}

/** 書籍を横断したノート検索（Phase 4） */
export function SearchPane({ onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const run = useCallback(() => {
    if (!query.trim()) return;
    setSearching(true);
    searchNotes(query)
      .then((found) => {
        setHits(found);
        setError(null);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setSearching(false));
  }, [query]);

  return (
    <section className="search">
      <h2>ノートを横断して探す</h2>
      <div className="ask">
        <input
          type="search"
          value={query}
          placeholder="語句で探す"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') run();
          }}
        />
        <button type="button" disabled={!query.trim() || searching} onClick={run}>
          {searching ? '探しています…' : '探す'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {hits?.length === 0 && <p className="muted">一致するノートはありません</p>}

      <ol className="note-list">
        {hits?.map((hit) => (
          <li key={`${hit.bookId}-${hit.anchor.page}-${hit.anchor.start}`}>
            <button type="button" className="note-jump" onClick={() => onOpen(hit)}>
              <span className="note-page">
                {hit.bookTitle} p.{hit.anchor.page}
              </span>
              <span className="note-heading">{hit.heading}</span>
            </button>
            <p className="note-body">{hit.excerpt}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
