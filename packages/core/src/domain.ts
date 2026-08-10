/**
 * ReadAgent のドメインモデル。
 *
 * ここには UI・Claude Agent SDK・ファイルシステムへの依存を持ち込まない。
 * ローカル完結版と将来のWebサーバー版で共有される唯一の語彙にするため。
 */

/** 書籍（現状はPDFのみ。将来 EPUB 等を追加する余地を残す） */
export interface Book {
  readonly id: string;
  readonly title: string;
  /** 書籍ファイルへのパス、またはサーバー上のリソース識別子 */
  readonly source: string;
  readonly format: BookFormat;
  readonly pageCount: number;
  readonly addedAt: string;
}

export type BookFormat = 'pdf';

/** 目次項目。ネスト可能。 */
export interface TocEntry {
  readonly id: string;
  readonly title: string;
  readonly page: number;
  readonly depth: number;
  readonly children: readonly TocEntry[];
}

/**
 * 本文中の選択範囲。エージェントに渡す最小単位であり、
 * ノートから本文へ戻るための双方向リンクの実体でもある。
 */
export interface Selection {
  readonly id: string;
  readonly bookId: string;
  /** 1始まりのページ番号 */
  readonly page: number;
  /** ページ内の抽出テキストにおける開始オフセット（0始まり、終端は含まない） */
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** 選択位置に対応する目次項目（判定できた場合） */
  readonly tocEntryId?: string;
  readonly createdAt: string;
}

/** 読書ノートの1エントリ。Markdown へのシリアライズ前の中間表現。 */
export interface NoteEntry {
  readonly id: string;
  readonly bookId: string;
  readonly selectionId?: string;
  /** 引用した原文 */
  readonly quote?: string;
  readonly question?: string;
  readonly answer?: string;
  /** Mermaid 等の図解ブロック */
  readonly diagrams: readonly string[];
  readonly links: readonly string[];
  readonly tags: readonly string[];
  /** 生成元のエージェントセッション。ノート↔チャット履歴のリンクに使う。 */
  readonly sessionId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
