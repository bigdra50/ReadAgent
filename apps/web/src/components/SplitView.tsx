import { type ReactNode, useCallback, useRef, useState } from 'react';

interface Props {
  readonly toc: ReactNode;
  readonly reader: ReactNode;
  readonly side: ReactNode;
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
        const delta = event.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP;
        onResize(width + delta);
      }}
    />
  );
}

/**
 * リサイズ可能な3ペイン（要件 4）。
 * 狭い画面へのフォールバック（スタック・オーバーレイ）は Phase 3 で扱う。
 */
export function SplitView({ toc, reader, side }: Props) {
  const [tocWidth, setTocWidth] = useState(240);
  const [sideWidth, setSideWidth] = useState(320);
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

  return (
    <div
      className="split"
      ref={rootRef}
      style={{ gridTemplateColumns: `${tocWidth}px 4px 1fr 4px ${sideWidth}px` }}
    >
      <aside className="pane pane-toc">{toc}</aside>
      <Divider
        label="目次ペインの幅"
        width={tocWidth}
        max={max}
        onResize={(value) => setTocWidth(clamp(value))}
        onDrag={startDrag('toc')}
      />
      <main className="pane pane-reader">{reader}</main>
      <Divider
        label="サイドペインの幅"
        width={sideWidth}
        max={max}
        onResize={(value) => setSideWidth(clamp(value))}
        onDrag={startDrag('side')}
      />
      <aside className="pane pane-side">{side}</aside>
    </div>
  );
}
