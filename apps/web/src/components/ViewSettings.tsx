import { clampZoom, MAX_ZOOM, MIN_ZOOM, type ThemeChoice, ZOOM_STEP } from '../lib/preferences';

interface Props {
  readonly zoom: number;
  readonly onZoom: (next: number) => void;
  readonly theme: ThemeChoice;
  readonly onTheme: (next: ThemeChoice) => void;
}

const THEME_LABELS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'OSに従う' },
  { value: 'light', label: '明るい' },
  { value: 'dark', label: '暗い' },
];

/** 表示倍率と配色。どちらも端末ごとの好みなので保存される（ADR-0010） */
export function ViewSettings({ zoom, onZoom, theme, onTheme }: Props) {
  return (
    <>
      <fieldset className="zoom">
        <legend className="visually-hidden">表示倍率</legend>
        <button
          type="button"
          aria-label="縮小"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => onZoom(clampZoom(zoom - ZOOM_STEP))}
        >
          −
        </button>
        <button type="button" className="zoom-value" onClick={() => onZoom(1.4)} title="既定に戻す">
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="拡大"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => onZoom(clampZoom(zoom + ZOOM_STEP))}
        >
          ＋
        </button>
      </fieldset>

      <label className="theme">
        <span className="visually-hidden">配色</span>
        <select value={theme} onChange={(event) => onTheme(event.target.value as ThemeChoice)}>
          {THEME_LABELS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
