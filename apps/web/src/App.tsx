import { renderQuote } from '@readagent/pdf/text';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
// 既定のビルドは Map.prototype.getOrInsertComputed や Math.sumPrecise といった
// 最新の JS 機能を要求し、少し前の Chromium では実行時に落ちる。
// legacy ビルドはそこを吸収するので、ブラウザ側もサーバー側もこちらに揃える。
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatPane } from './components/ChatPane';
import { NotePane } from './components/NotePane';
import { SplitView } from './components/SplitView';
import { type SelectionRange, TextLayer } from './components/TextLayer';
import {
  type DocumentSummary,
  fetchDocument,
  fetchPage,
  type PageResponse,
  pdfFileUrl,
} from './lib/api';
import { NARROW_QUERY, useMediaQuery } from './lib/media';
import { fetchNoteEntries, type ParsedNoteEntry } from './lib/notes';

GlobalWorkerOptions.workerSrc = workerUrl;

const SCALE = 1.4;
type SidePane = 'chat' | 'notes' | null;

export function App() {
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [pageText, setPageText] = useState<PageResponse | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [highlight, setHighlight] = useState<SelectionRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 狭い画面では本文だけを出して始める。ペインはオーバーレイなので、
  // 開いたまま始めると本文が最初から隠れてしまう（要件 4）。
  const [showToc, setShowToc] = useState(() => !window.matchMedia(NARROW_QUERY).matches);
  const [sidePane, setSidePane] = useState<SidePane>(() =>
    window.matchMedia(NARROW_QUERY).matches ? null : 'chat',
  );
  const [noteEntries, setNoteEntries] = useState<readonly ParsedNoteEntry[]>([]);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<'idle' | 'updating' | 'failed'>('idle');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 狭い画面ではペインがオーバーレイになる。両方開くと本文が隠れるので排他にする（要件 4）
  const narrow = useMediaQuery(NARROW_QUERY);

  const openToc = useCallback(
    (next: boolean) => {
      setShowToc(next);
      if (next && narrow) setSidePane(null);
    },
    [narrow],
  );

  const openSide = useCallback(
    (next: SidePane) => {
      setSidePane(next);
      if (next && narrow) setShowToc(false);
    },
    [narrow],
  );

  // 画面が狭くなった瞬間に、開きっぱなしのペインで本文が隠れないようにする
  const wasNarrow = useRef(narrow);
  useEffect(() => {
    if (narrow && !wasNarrow.current) {
      setShowToc(false);
      setSidePane(null);
    }
    wasNarrow.current = narrow;
  }, [narrow]);

  useEffect(() => {
    fetchDocument()
      .then(setSummary)
      .catch((e: unknown) => setError(String(e)));
    getDocument({ url: pdfFileUrl })
      .promise.then(setPdf)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    pdf.getPage(pageNumber).then((loaded) => {
      if (!cancelled) setPage(loaded);
    });
    fetchPage(pageNumber)
      .then((text) => {
        if (!cancelled) setPageText(text);
      })
      .catch((e: unknown) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  // 本文の描画。テキストレイヤと同じ viewport を使わないと選択位置がずれる。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas) return;
    const viewport = page.getViewport({ scale: SCALE });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const task = page.render({ canvas, canvasContext: context, viewport });
    return () => {
      task.cancel();
    };
  }, [page]);

  // ノートは読書中いつでも開ける（要件 4）
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSide, openToc, showToc, sidePane]);

  const reloadNotes = useCallback(() => {
    setNoteLoading(true);
    fetchNoteEntries()
      .then(({ entries }) => {
        setNoteEntries(entries);
        setNoteError(null);
      })
      .catch((cause: unknown) =>
        setNoteError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setNoteLoading(false));
  }, []);

  // ノートペインを開いたときに最新を読む
  useEffect(() => {
    if (sidePane === 'notes') reloadNotes();
  }, [sidePane, reloadNotes]);

  /** ノートから本文へ戻る（要件 3.3 の双方向リンク） */
  const jumpTo = useCallback((target: SelectionRange) => {
    setPageNumber(target.page);
    setHighlight(target);
    setSelection(target);
  }, []);

  const goToPage = useCallback((next: number) => {
    setPageNumber(next);
    setHighlight(null);
    setSelection(null);
  }, []);

  const quote =
    pageText && selection ? renderQuote(pageText, selection.start, selection.end) : null;

  return (
    <div className="app">
      <header className="app-header">
        <strong className="app-title">ReadAgent</strong>
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
        <span className="muted app-hint">⌘I ノート / ⌘B 目次</span>
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
                  scale={SCALE}
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
              entries={noteEntries}
              loading={noteLoading}
              error={noteError}
              onJump={jumpTo}
            />
          ) : (
            <ChatPane
              selection={selection}
              quote={quote}
              onNoteStatus={setNoteStatus}
              onNoteUpdated={reloadNotes}
            />
          )
        }
      />
    </div>
  );
}
