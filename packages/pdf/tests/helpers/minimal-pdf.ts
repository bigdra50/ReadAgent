/**
 * 最小限の PDF をその場で組み立てる。
 * バイナリのフィクスチャをリポジトリに置かずに、pdf.js との結線を実際に検証するため。
 * 収録するのは ASCII のみ（標準フォント Helvetica を使い、フォント埋め込みを避ける）。
 */

const HEADER = '%PDF-1.4\n';

function contentStream(lines: readonly string[]): string {
  const body = lines
    .map((line, index) => (index === 0 ? `(${line}) Tj` : `0 -16 Td (${line}) Tj`))
    .join('\n');
  return `BT\n/F1 12 Tf\n72 720 Td\n${body}\nET\n`;
}

export interface OutlineSpec {
  /** ASCII のみ。PDF 文字列としてそのまま埋める */
  readonly title: string;
  /** 1 始まりのページ番号 */
  readonly page: number;
}

/** 各ページの行を受け取り、有効な PDF のバイト列を返す */
export function buildMinimalPdf(
  pages: readonly (readonly string[])[],
  outline: readonly OutlineSpec[] = [],
): Uint8Array {
  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];

  // 1: Catalog, 2: Pages, 3以降: ページと内容が交互, フォント, 目次（あれば）
  const fontNumber = 3 + pages.length * 2;
  const outlinesNumber = fontNumber + 1;
  const firstItemNumber = outlinesNumber + 1;

  objects.push(
    outline.length > 0
      ? `<< /Type /Catalog /Pages 2 0 R /Outlines ${outlinesNumber} 0 R >>`
      : '<< /Type /Catalog /Pages 2 0 R >>',
  );

  pages.forEach((_, index) => {
    pageObjectNumbers.push(3 + index * 2);
  });
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );

  pages.forEach((lines, index) => {
    const contentNumber = 4 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${fontNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    );
    const stream = contentStream(lines);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  if (outline.length > 0) {
    objects.push(
      `<< /Type /Outlines /First ${firstItemNumber} 0 R ` +
        `/Last ${firstItemNumber + outline.length - 1} 0 R /Count ${outline.length} >>`,
    );

    outline.forEach((item, index) => {
      const self = firstItemNumber + index;
      const pageNumber = pageObjectNumbers[Math.min(item.page, pages.length) - 1] ?? 3;
      const links = [
        index > 0 ? `/Prev ${self - 1} 0 R` : '',
        index < outline.length - 1 ? `/Next ${self + 1} 0 R` : '',
      ]
        .filter(Boolean)
        .join(' ');
      objects.push(
        `<< /Title (${item.title}) /Parent ${outlinesNumber} 0 R ${links} ` +
          `/Dest [${pageNumber} 0 R /XYZ null null null] >>`,
      );
    });
  }

  let body = HEADER;
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(body + xref + trailer);
}
