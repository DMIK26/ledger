/** Small RFC 4180 CSV reader and writer, tolerant of what spreadsheets and banks actually export. */

export const BOM = '\uFEFF';

/** Picks the delimiter that splits the first line into the most fields (comma, semicolon or tab). */
export function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  let best = ',';
  let bestCount = -1;
  for (const d of [',', ';', '\t']) {
    let count = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty lines (trailing newlines, spacer rows).
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/**
 * Text that a spreadsheet would run as a formula (=, +, -, @ at the start) is prefixed with an
 * apostrophe, so a merchant name can never execute in Excel. Numbers are written as they are.
 */
export function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export const unsafeText = (value: string): string =>
  /^'[=+\-@]/.test(value) ? value.slice(1) : value;

function quote(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** CSV text with a byte-order mark and CRLF line ends, so Excel opens ₹ and Indian names correctly. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return BOM + rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';
}
