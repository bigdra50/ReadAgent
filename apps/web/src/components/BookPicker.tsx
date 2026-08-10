import type { BookRef } from '../lib/api';

interface Props {
  readonly books: readonly BookRef[];
  readonly current: string | null;
  readonly onSelect: (id: string) => void;
}

/** 書籍の切り替え（Phase 4 の複数書籍対応） */
export function BookPicker({ books, current, onSelect }: Props) {
  if (books.length <= 1) {
    return <span className="book-name">{books[0]?.title ?? ''}</span>;
  }

  return (
    <label className="book-picker">
      <span className="visually-hidden">書籍</span>
      <select value={current ?? ''} onChange={(event) => onSelect(event.target.value)}>
        {books.map((book) => (
          <option key={book.id} value={book.id}>
            {book.title}
          </option>
        ))}
      </select>
    </label>
  );
}
