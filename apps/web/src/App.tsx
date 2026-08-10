import { renderQuote } from '@readagent/pdf/text';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { ChatPane } from './components/ChatPane';
import { SplitView } from './components/SplitView';
import { type SelectionRange, TextLayer } from './components/TextLayer';
import {
  type DocumentSummary,
  fetchDocument,
  fetchPage,
  type PageResponse,
  pdfFileUrl,
} from './lib/api';

GlobalWorkerOptions.workerSrc = workerUrl;

const SCALE = 1.4;

export function App() {
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [pageText, setPageText] = useState<PageResponse | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    setSelection(null);
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

  const quote =
    pageText && selection ? renderQuote(pageText, selection.start, selection.end) : null;

  return (
    <SplitView
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
            <button type="button" onClick={() => setPageNumber((n) => Math.max(1, n - 1))}>
              前
            </button>
            <span>
              {pageNumber} / {summary?.pageCount ?? '-'}
            </span>
            <button
              type="button"
              onClick={() => setPageNumber((n) => Math.min(summary?.pageCount ?? n, n + 1))}
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
                onSelect={setSelection}
              />
            )}
          </div>
        </>
      }
      side={<ChatPane selection={selection} quote={quote} />}
    />
  );
}
