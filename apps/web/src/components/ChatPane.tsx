import type { AgentEvent } from '@readagent/agent';
import type { NoteConfig } from '@readagent/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from '../lib/chat';
import { type RequestOverrides, RequestSettings } from './RequestSettings';
import type { SelectionRange } from './TextLayer';

interface Props {
  readonly bookId: string;
  readonly selection: SelectionRange | null;
  readonly quote: string | null;
  /** ノート更新の状態。ヘッダーに控えめに出す（要件 4） */
  readonly onNoteStatus: (status: 'idle' | 'updating' | 'failed') => void;
  readonly onNoteUpdated: () => void;
  /** 書籍までで解決済みの設定。一時上書きの出発点 */
  readonly noteConfig: NoteConfig | null;
}

interface ToolRun {
  readonly id: string;
  readonly name: string;
  readonly state: 'running' | 'done' | 'failed';
}

/**
 * 選択箇所を起点にした深掘りチャット（要件 3.2）。
 * 走っている問い合わせは常に中断できる。読書を止めないことが前提のため（要件 5）。
 */
export function ChatPane({
  bookId,
  selection,
  quote,
  onNoteStatus,
  onNoteUpdated,
  noteConfig,
}: Props) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [tools, setTools] = useState<ToolRun[]>([]);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'error'>('idle');
  const [overrides, setOverrides] = useState<RequestOverrides>({});
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 画面を離れるときに走っている問い合わせを残さない
  useEffect(() => () => abortRef.current?.abort(), []);

  const applyEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case 'text':
          setAnswer((current) => current + event.text);
          break;
        case 'tool-start':
          setTools((current) => [...current, { id: event.id, name: event.name, state: 'running' }]);
          break;
        case 'tool-end':
          setTools((current) =>
            current.map((tool) =>
              tool.id === event.id ? { ...tool, state: event.ok ? 'done' : 'failed' } : tool,
            ),
          );
          break;
        case 'done':
          setStatus(event.ok ? 'idle' : 'error');
          if (!event.ok) setError(event.error ?? '応答を完了できませんでした');
          break;
        case 'note-start':
          onNoteStatus('updating');
          break;
        case 'note-updated':
          onNoteStatus('idle');
          onNoteUpdated();
          break;
        case 'note-failed':
          onNoteStatus('failed');
          setError(`ノートを更新できませんでした: ${event.error}`);
          break;
      }
    },
    [onNoteStatus, onNoteUpdated],
  );

  const ask = useCallback(async () => {
    if (!selection) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAnswer('');
    setTools([]);
    setError(null);
    setStatus('streaming');
    onNoteStatus('idle');

    try {
      // モデルは設定の一部ではないので、送る形を分ける
      const { model: rawModel, ...config } = overrides;
      const model = rawModel?.trim();

      const request = {
        page: selection.page,
        start: selection.start,
        end: selection.end,
        ...(question.trim() ? { question: question.trim() } : {}),
        ...(model ? { model } : {}),
        ...(Object.keys(config).length > 0 ? { config } : {}),
      };
      for await (const event of streamChat(bookId, request, controller.signal)) {
        applyEvent(event);
      }
      setStatus((current) => (current === 'streaming' ? 'idle' : current));
    } catch (cause) {
      if (controller.signal.aborted) return; // 中断は失敗ではない
      setStatus('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [applyEvent, bookId, onNoteStatus, overrides, question, selection]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
  }, []);

  return (
    <section className="chat">
      <h2>選択範囲</h2>
      {selection ? (
        <>
          <p className="muted">
            p.{selection.page} [{selection.start}, {selection.end})
          </p>
          <blockquote>{quote}</blockquote>
        </>
      ) : (
        <p className="muted">本文を選択すると、ここから深掘りできます</p>
      )}

      <div className="ask">
        <textarea
          value={question}
          placeholder="この箇所について聞きたいこと（空欄なら解説を求めます）"
          rows={3}
          disabled={!selection}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void ask();
          }}
        />
        {status === 'streaming' ? (
          <button type="button" onClick={stop}>
            中断
          </button>
        ) : (
          <button type="button" disabled={!selection} onClick={() => void ask()}>
            聞く
          </button>
        )}
      </div>

      {tools.length > 0 && (
        <ul className="tools">
          {tools.map((tool) => (
            <li key={tool.id} data-state={tool.state}>
              {tool.name}
              {tool.state === 'running' ? ' 実行中…' : tool.state === 'failed' ? ' 失敗' : ' 完了'}
            </li>
          ))}
        </ul>
      )}

      <RequestSettings resolved={noteConfig} overrides={overrides} onChange={setOverrides} />

      {answer && <div className="answer">{answer}</div>}
      {status === 'streaming' && !answer && <p className="muted">考えています…</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
