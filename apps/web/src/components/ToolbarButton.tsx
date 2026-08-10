import type { ReactNode } from 'react';

interface Props {
  /** 読み上げにも吹き出しにも使う名前 */
  readonly label: string;
  /** 吹き出しの右に小さく出すキーボードショートカット */
  readonly hint?: string | undefined;
  readonly pressed?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onClick: () => void;
  readonly children: ReactNode;
  /** 更新中などの印。ボタンの右上に重ねる */
  readonly badge?: ReactNode | undefined;
}

/**
 * アイコンだけのボタンと、ホバー・フォーカスで出る吹き出し。
 *
 * 文字を出さないのは、狭い画面でラベルが1文字ずつ折り返して
 * ヘッダーが崩れていたため。名前は aria-label で残す。
 * 吹き出しは装飾なので aria-hidden にし、読み上げでは二重にしない。
 */
export function ToolbarButton({ label, hint, pressed, disabled, onClick, children, badge }: Props) {
  return (
    <button
      type="button"
      className="toolbar-button"
      aria-label={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      {...(disabled === undefined ? {} : { disabled })}
      onClick={onClick}
    >
      {children}
      {badge}
      <span className="tip" aria-hidden="true">
        {label}
        {hint && <kbd className="tip-key">{hint}</kbd>}
      </span>
    </button>
  );
}
