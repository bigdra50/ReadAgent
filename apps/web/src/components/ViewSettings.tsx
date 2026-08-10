import type { ComponentType } from 'react';
import {
  clampZoom,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  type ThemeChoice,
  ZOOM_STEP,
} from '../lib/preferences';
import { AutoIcon, MinusIcon, MoonIcon, PlusIcon, SunIcon } from './icons';
import { ToolbarButton } from './ToolbarButton';

interface Props {
  readonly zoom: number;
  readonly onZoom: (next: number) => void;
  readonly theme: ThemeChoice;
  readonly onTheme: (next: ThemeChoice) => void;
}

const THEMES: { value: ThemeChoice; label: string; icon: ComponentType }[] = [
  { value: 'system', label: 'OSに従う', icon: AutoIcon },
  { value: 'light', label: '明るい配色', icon: SunIcon },
  { value: 'dark', label: '暗い配色', icon: MoonIcon },
];

/** 表示倍率と配色。どちらも端末ごとの好みなので保存される（ADR-0010） */
export function ViewSettings({ zoom, onZoom, theme, onTheme }: Props) {
  return (
    <>
      <fieldset className="toolbar-group">
        <legend className="visually-hidden">表示倍率</legend>
        <ToolbarButton
          label="縮小"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => onZoom(clampZoom(zoom - ZOOM_STEP))}
        >
          <MinusIcon />
        </ToolbarButton>
        <button
          type="button"
          className="zoom-value"
          aria-label={`表示倍率 ${Math.round(zoom * 100)}%。押すと既定に戻す`}
          onClick={() => onZoom(DEFAULT_ZOOM)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <ToolbarButton
          label="拡大"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => onZoom(clampZoom(zoom + ZOOM_STEP))}
        >
          <PlusIcon />
        </ToolbarButton>
      </fieldset>

      <fieldset className="toolbar-group">
        <legend className="visually-hidden">配色</legend>
        {THEMES.map(({ value, label, icon: Icon }) => (
          <ToolbarButton
            key={value}
            label={label}
            pressed={theme === value}
            onClick={() => onTheme(value)}
          >
            <Icon />
          </ToolbarButton>
        ))}
      </fieldset>
    </>
  );
}
