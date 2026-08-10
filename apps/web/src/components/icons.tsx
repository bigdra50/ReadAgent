import type { ReactNode } from 'react';

/**
 * ヘッダーで使うアイコン。
 *
 * アイコンライブラリは入れていない。必要なのはこの数だけで、
 * 依存を1つ増やすより手で描いたほうが軽い。
 * 色は currentColor に任せ、大きさは CSS 側（.icon）で決める。
 */
function Glyph({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function TocIcon() {
  return (
    <Glyph>
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </Glyph>
  );
}

export function ChatIcon() {
  return (
    <Glyph>
      <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
    </Glyph>
  );
}

export function NoteIcon() {
  return (
    <Glyph>
      <path d="M6.5 3H19a1 1 0 0 1 1 1v17H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    </Glyph>
  );
}

export function SearchIcon() {
  return (
    <Glyph>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </Glyph>
  );
}

export function PrevIcon() {
  return (
    <Glyph>
      <path d="M14.5 5l-7 7 7 7" />
    </Glyph>
  );
}

export function NextIcon() {
  return (
    <Glyph>
      <path d="M9.5 5l7 7-7 7" />
    </Glyph>
  );
}

export function MinusIcon() {
  return (
    <Glyph>
      <path d="M5 12h14" />
    </Glyph>
  );
}

export function PlusIcon() {
  return (
    <Glyph>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  );
}

export function SunIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </Glyph>
  );
}

export function MoonIcon() {
  return (
    <Glyph>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />
    </Glyph>
  );
}

/** OSに従う。半分を塗って「自動」を表す */
export function AutoIcon() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" />
    </Glyph>
  );
}
