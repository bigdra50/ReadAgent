import { chapterRanges } from '@readagent/core';
import { renderQuote } from '@readagent/pdf/text';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
// 既定のビルドは Map.prototype.getOrInsertComputed や Math.sumPrecise といった
// 最新の JS 機能を要求し、少し前の Chromium では実行時に落ちる。
// legacy ビルドはそこを吸収するので、ブラウザ側もサーバー側もこちらに揃える。
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookPicker } from './components/BookPicker';
import { ChatPane } from './components/ChatPane';
import { NotePane } from './components/NotePane';
import { SearchPane } from './components/SearchPane';
import { SplitView } from './components/SplitView';
import { type SelectionRange, TextLayer } from './components/TextLayer';
import { ViewSettings } from './components/ViewSettings';
import {
  type BookRef,
  type DocumentSummary,
  fetchBooks,
  fetchDocument,
  fetchPage,
  type PageResponse,
  pdfFileUrl,
  type SearchHit,
} from './lib/api';
import { NARROW_QUERY, useMediaQuery } from './lib/media';
import { fetchNoteEntries, type ParsedNoteEntry, type ParsedNoteSummary } from './lib/notes';
import {
  isLastPages,
  isPaneState,
  isThemeChoice,
  isZoom,
  type LastPages,
  type PaneState,
  type SidePaneChoice,
  type ThemeChoice,
  usePersistentState,
} from './lib/preferences';

GlobalWorkerOptions.workerSrc = workerUrl;

const DEFAULT_ZOOM = 1.4;
type SidePane = SidePaneChoice;

export function App() {
  const [books, setBooks] = useState<readonly BookRef[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [pageText, setPageText] = useState<PageResponse | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [highlight, setHighlight] = useState<SelectionRange | null>(null);
  /** 別の書籍へ飛ぶとき、その書籍が読み込まれてから当てる移動先 */
  const [pendingJump, setPendingJump] = useState<SelectionRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteEntries, setNoteEntries] = useState<readonly ParsedNoteEntry[]>([]);
  const [noteSummaries, setNoteSummaries] = useState<readonly ParsedNoteSummary[]>([]);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<'idle' | 'updating' | 'failed'>('idle');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 表示の好みは保存する（ADR-0010）
  const [zoom, setZoom] = usePersistentState<number>('zoom', DEFAULT_ZOOM, isZoom);
  const [theme, setTheme] = usePersistentState<ThemeChoice>('theme', 'system', isThemeChoice);
  const [lastPages, setLastPages] = usePersistentState<LastPages>('last-pages', {}, isLastPages);
  // 続きのページは「開いた瞬間の最新」を読めればよい。依存に入れると
  // ページを繰るたびに書籍の読み込みからやり直しになる
  const lastPagesRef = useRef(lastPages);
  lastPagesRef.current = lastPages;

  // 狭い画面ではペインがオーバーレイになる。開いたまま始めると本文が隠れる（要件 4）
  const narrow = useMediaQuery(NARROW_QUERY);
  // 保存された好みが無いときの初期値にだけ使う。以降の広い/狭いは narrow で見る
  const [narrowAtStart] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  const [panes, setPanes] = usePersistentState<PaneState>(
    'panes',
    { toc: !narrowAtStart, side: narrowAtStart ? null : 'chat' },
    isPaneState,
  );
  const showToc = panes.toc;
  const sidePane: SidePane = panes.side;
  const setShowToc = useCallback(
    (next: boolean) => setPanes((current) => ({ ...current, toc: next })),
    [setPanes],
  );
  const setSidePane = useCallback(
    (next: SidePane) => setPanes((current) => ({ ...current, side: next })),
    [setPanes],
  );

  const openToc = useCallback(
    (next: boolean) => {
      setShowToc(next);
      if (next && narrow) setSidePane(null);
    },
    [narrow, setShowToc, setSidePane],
  );

  const openSide = useCallback(
    (next: SidePane) => {
      setSidePane(next);
      if (next && narrow) setShowToc(false);
    },
    [narrow, setShowToc, setSidePane],
  );

  // 配色は data-theme で切り替える。未指定なら CSS 側が OS の設定に従う
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  const wasNarrow = useRef(narrow);
  useEffect(() => {
    if (narrow && !wasNarrow.current) {
      // 広い→狭いへ変わった瞬間。開いていたペインは本文を覆うので畳む
      setShowToc(false);
      setSidePane(null);
    } else if (narrow && panes.toc && panes.side !== null) {
      // 狭い画面で開き直した場合。重なったままだと本文が完全に隠れる（要件 4）
      setShowToc(false);
    }
    wasNarrow.current = narrow;
  }, [narrow, panes.toc, panes.side, setShowToc, setSidePane]);

  useEffect(() => {
    fetchBooks()
      .then((found) => {
        setBooks(found);
        setBookId((current) => current ?? found[0]?.id ?? null);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  // 書籍が変わったら、本文もノートも取り直す
  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    setPdf(null);
    setPage(null);
    setPageNumber(1);
    setSelection(null);
    setHighlight(null);

    fetchDocument(bookId)
      .then((loaded) => {
        if (cancelled) return;
        setSummary(loaded);
        // 前回の続きから開く。範囲外なら1ページ目に落とす
        const remembered = lastPagesRef.current[bookId];
        if (remembered && remembered >= 1 && remembered <= loaded.pageCount) {
          setPageNumber(remembered);
        }
      })
      .catch((e: unknown) => setError(String(e)));
    getDocument({ url: pdfFileUrl(bookId) })
      .promise.then((loaded) => {
        if (!cancelled) setPdf(loaded);
      })
      .catch((e: unknown) => setError(String(e)));

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (!pdf || !bookId) return;
    let cancelled = false;
    pdf.getPage(pageNumber).then((loaded) => {
      if (!cancelled) setPage(loaded);
    });
    fetchPage(bookId, pageNumber)
      .then((text) => {
        if (!cancelled) setPageText(text);
      })
      .catch((e: unknown) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [pdf, bookId, pageNumber]);

  // 本文の描画。テキストレイヤと同じ viewport を使わないと選択位置がずれる。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas) return;
    const viewport = page.getViewport({ scale: zoom });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const task = page.render({ canvas, canvasContext: context, viewport });
    return () => {
      task.cancel();
    };
  }, [page, zoom]);

  const reloadNotes = useCallback(() => {
    if (!bookId) return;
    setNoteLoading(true);
    fetchNoteEntries(bookId)
      .then(({ entries, summaries }) => {
        setNoteEntries(entries);
        setNoteSummaries(summaries);
        setNoteError(null);
      })
      .catch((cause: unknown) =>
        setNoteError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setNoteLoading(false));
  }, [bookId]);

  useEffect(() => {
    if (sidePane === 'notes') reloadNotes();
  }, [sidePane, reloadNotes]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === 'i') {
        event.preventDefault();
        openSide(sidePane === 'notes' ? 'chat' : 'notes');
      }
      if (event.key === 'b') {
        event.preventDefault();
        openToc(!showToc);
      }
      if (event.key === 'k') {
        event.preventDefault();
        openSide(sidePane === 'search' ? 'chat' : 'search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSide, openToc, showToc, sidePane]);

  /** ノートから本文へ戻る（要件 3.3 の双方向リンク） */
  const jumpTo = useCallback((target: SelectionRange) => {
    setPageNumber(target.page);
    setHighlight(target);
    setSelection(target);
  }, []);

  /** 検索結果から、別の書籍の該当箇所へ移動する */
  const openHit = useCallback(
    (hit: SearchHit) => {
      const target = { page: hit.anchor.page, start: hit.anchor.start, end: hit.anchor.end };
      if (hit.bookId === bookId) {
        jumpTo(target);
        return;
      }
      // 書籍の切り替えは非同期に進み、その途中で選択は捨てられる。
      // 「読み込めたら当てる」を状態として持たせ、待ち時間に頼らない。
      setBookId(hit.bookId);
      setPendingJump(target);
    },
    [bookId, jumpTo],
  );

  // 切り替え先の書籍が読み込めた時点で、保留していた移動を当てる
  useEffect(() => {
    if (!pdf || !pendingJump) return;
    jumpTo(pendingJump);
    setPendingJump(null);
  }, [pdf, pendingJump, jumpTo]);

  const goToPage = useCallback(
    (next: number) => {
      setPageNumber(next);
      setHighlight(null);
      setSelection(null);
      if (bookId) setLastPages((current) => ({ ...current, [bookId]: next }));
    },
    [bookId, setLastPages],
  );

  const quote =
    pageText && selection ? renderQuote(pageText, selection.start, selection.end) : null;

  // 目次のページが解決できている書籍でだけ、章単位のまとめが選べる
  const chapters = useMemo(
    () => (summary ? chapterRanges(summary.toc, summary.pageCount) : []),
    [summary],
  );

  return (
    <div className="app">
      <header className="app-header">
        <strong className="app-title">ReadAgent</strong>
        <BookPicker books={books} current={bookId} onSelect={setBookId} />
        <button type="button" aria-pressed={showToc} onClick={() => openToc(!showToc)}>
          目次
        </button>
        <button
          type="button"
          aria-pressed={sidePane === 'chat'}
          onClick={() => openSide(sidePane === 'chat' ? null : 'chat')}
        >
          チャット
        </button>
        <button
          type="button"
          aria-pressed={sidePane === 'notes'}
          onClick={() => openSide(sidePane === 'notes' ? null : 'notes')}
        >
          ノート
          {noteStatus === 'updating' && (
            <span className="badge" role="status" aria-label="ノートを更新中" />
          )}
          {noteStatus === 'failed' && (
            <span className="badge badge-failed" role="status" aria-label="ノートの更新に失敗" />
          )}
        </button>
        <button
          type="button"
          aria-pressed={sidePane === 'search'}
          onClick={() => openSide(sidePane === 'search' ? null : 'search')}
        >
          検索
        </button>
        <ViewSettings zoom={zoom} onZoom={setZoom} theme={theme} onTheme={setTheme} />
        <span className="muted app-hint">⌘I ノート / ⌘K 検索 / ⌘B 目次</span>
      </header>

      <SplitView
        showToc={showToc}
        showSide={sidePane !== null}
        onDismiss={(pane) => (pane === 'toc' ? setShowToc(false) : setSidePane(null))}
        toc={
          <>
            <h2>目次</h2>
            {summary?.toc.length ? (
              <ul className="toc">
                {summary.toc.map((entry) => (
                  <li key={entry.id} style={{ paddingLeft: entry.depth * 12 }}>
                    {entry.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">この PDF には目次がありません</p>
            )}
          </>
        }
        reader={
          <>
            <div className="toolbar">
              <button type="button" onClick={() => goToPage(Math.max(1, pageNumber - 1))}>
                前
              </button>
              <span>
                {pageNumber} / {summary?.pageCount ?? '-'}
              </span>
              <button
                type="button"
                onClick={() => goToPage(Math.min(summary?.pageCount ?? pageNumber, pageNumber + 1))}
              >
                次
              </button>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="page">
              <canvas ref={canvasRef} />
              {page && (
                <TextLayer
                  page={page}
                  pageNumber={pageNumber}
                  scale={zoom}
                  highlight={highlight}
                  onSelect={setSelection}
                />
              )}
            </div>
          </>
        }
        side={
          sidePane === 'notes' ? (
            <NotePane
              bookId={bookId ?? ''}
              entries={noteEntries}
              summaries={noteSummaries}
              loading={noteLoading}
              error={noteError}
              onJump={jumpTo}
              onSummarized={reloadNotes}
              chapters={chapters}
            />
          ) : sidePane === 'search' ? (
            <SearchPane onOpen={openHit} />
          ) : (
            <ChatPane
              bookId={bookId ?? ''}
              selection={selection}
              quote={quote}
              onNoteStatus={setNoteStatus}
              onNoteUpdated={reloadNotes}
              noteConfig={summary?.config ?? null}
            />
          )
        }
      />
    </div>
  );
}
