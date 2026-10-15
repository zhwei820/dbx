import type { ColumnRegular } from "@revolist/revogrid";

export const SPREADSHEET_VIEWER_MAX_ROWS = 200_000;

// RevoGrid keys cells by prop; header text can repeat or be empty, so props are positional.
export function buildSpreadsheetGrid(headers: string[], rows: unknown[][]) {
  let width = headers.length;
  for (const row of rows) if (row.length > width) width = row.length;
  const columns: ColumnRegular[] = Array.from({ length: width }, (_, index) => ({
    prop: `c${index}`,
    name: headers[index] || columnLetter(index),
    sortable: true,
    size: 140,
  }));
  const source = rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (let index = 0; index < width; index++) {
      const value = row[index];
      record[`c${index}`] = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : value;
    }
    return record;
  });
  return { columns, source };
}

export function columnLetter(index: number): string {
  let label = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  }
  return label;
}
