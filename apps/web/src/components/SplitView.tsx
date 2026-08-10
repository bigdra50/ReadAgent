import { type ReactNode, useCallback, useRef, useState } from 'react';

interface Props {
  readonly toc: ReactNode;
  readonly reader: ReactNode;
  readonly side: ReactNode;
  readonly showToc: boolean;
  readonly showSide: boolean;
  readonly onDismiss: (pane: 'toc' | 'side') => void;
}

const MIN_PANE = 160;
const KEYBOARD_STEP = 16;

interface DividerProps {
  readonly label: string;
  readonly width: number;
  readonly max: number;
  readonly onResize: (width: number) => void;
  readonly onDrag: (event: React.PointerEvent<HTMLHRElement>) => void;
}

/** ペインの境界。ポインタでも矢印キーでも動かせる（要件 4 のリサイズ可能な分割ビュー） */
function Divider({ label, width, max, onResize, onDrag }: DividerProps) {
  return (
    <hr
      className="divider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      aria-valuemin={MIN_PANE}
      aria-valuemax={Math.round(max)}
      onPointerDown={onDrag}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        onResize(width + (event.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP));
      }}
    />
  );
}

/**
 * リサイズ可能な3ペイン（要件 4）。
 *
 * 広い画面では同時に並べ、狭い画面では本文だけを残して
 * 目次とサイドをオーバーレイに落とす。切り替えは CSS 側で行い、
 * ここでは「表示するかどうか」だけを扱う。
 */
export function SplitView({ toc, reader, side, showToc, showSide, onDismiss }: Props) {
  const [tocWidth, setTocWidth] = useState(240);
  const [sideWidth, setSideWidth] = useState(340);
  const rootRef = useRef<HTMLDivElement>(null);

  const clamp = useCallback((value: number) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    const max = bounds ? bounds.width - MIN_PANE * 2 : Number.POSITIVE_INFINITY;
    return Math.max(MIN_PANE, Math.min(value, max));
  }, []);

  const startDrag = useCallback(
    (which: 'toc' | 'side') => (event: React.PointerEvent<HTMLHRElement>) => {
      event.preventDefault();
      const move = (moveEvent: PointerEvent) => {
        const bounds = rootRef.current?.getBoundingClientRect();
        if (!bounds) return;
        const next =
          which === 'toc' ? moveEvent.clientX - bounds.left : bounds.right - moveEvent.clientX;
        const width = clamp(next);
        if (which === 'toc') setTocWidth(width);
        else setSideWidth(width);
      };
      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
    },
    [clamp],
  );

  const max = rootRef.current
    ? rootRef.current.getBoundingClientRect().width - MIN_PANE * 2
    : MIN_PANE;

  // 幅は CSS 変数で渡す。列の組み立てを CSS 側に置くことで、
  // 狭い画面では通常のルールで上書きできる（インラインの style だと !important が要る）
  const style = {
    '--toc-width': showToc ? `${tocWidth}px` : '0px',
    '--toc-divider': showToc ? '4px' : '0px',
    '--side-divider': showSide ? '4px' : '0px',
    '--side-width': showSide ? `${sideWidth}px` : '0px',
  } as React.CSSProperties;

  return (
    <div className="split" ref={rootRef} style={style}>
      <aside className="pane pane-toc" data-open={showToc} aria-hidden={!showToc}>
        {toc}
      </aside>
      {showToc ? (
        <Divider
          label="目次ペインの幅"
          width={tocWidth}
          max={max}
          onResize={(value) => setTocWidth(clamp(value))}
          onDrag={startDrag('toc')}
        />
      ) : (
        <div />
      )}

      <main className="pane pane-reader">{reader}</main>

      {showSide ? (
        <Divider
          label="サイドペインの幅"
          width={sideWidth}
          max={max}
          onResize={(value) => setSideWidth(clamp(value))}
          onDrag={startDrag('side')}
        />
      ) : (
        <div />
      )}
      <aside className="pane pane-side" data-open={showSide} aria-hidden={!showSide}>
        {side}
      </aside>

      {/* 狭い画面ではペインがオーバーレイになる。外側を触ると閉じる */}
      {(showToc || showSide) && (
        <button
          type="button"
          className="scrim"
          aria-label="ペインを閉じる"
          onClick={() => onDismiss(showSide ? 'side' : 'toc')}
        />
      )}
    </div>
  );
}
