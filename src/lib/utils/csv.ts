/**
 * RFC 4180 CSV serialisation.
 *
 * Cells beginning with =, +, -, @ or a control character are prefixed with an
 * apostrophe so a spreadsheet treats them as text rather than a formula.
 */
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
}
