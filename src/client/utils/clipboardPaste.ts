/**
 * UX-C02: Reusable TSV clipboard paste utilities for operational grids.
 *
 * AG Grid Enterprise ships ClipboardModule (registered in main.tsx via
 * ModuleRegistry.registerModules([ClipboardModule])). For AG Grid grids we
 * leverage its built-in processDataFromClipboard. For bespoke HTML-table
 * grids (QuickLedgerGrid) we provide a hook-based document-paste handler.
 *
 * Contract:
 * - Pasted rows land as DRAFTS only — never auto-post.
 * - Invalid / unrecognised cells are flagged needs_fix-style.
 * - A summary toast "N rows pasted, M need fixes" is shown after paste.
 * - Paste is scoped: the QuickLedgerGrid hook only fires when the table
 *   container element (or a descendant) is the document's active element.
 */

export interface PastedField {
  key: string;
  value: string;
  invalid: boolean;
}

export interface PastedRow {
  fields: PastedField[];
  hasErrors: boolean;
}

/**
 * Parse a TSV string into a 2-D array of cell strings.
 * Handles \r\n, \r, and \n line endings.
 */
export function parseTsv(raw: string): string[][] {
  return raw
    .split(/\r?\n|\r/)
    .filter((line) => line.trim() !== '')
    .map((line) => line.split('\t'));
}

/**
 * Map TSV rows onto a set of known field names.
 * `fieldNames` is an ordered list of the editable columns (header row expected
 * if the first row looks like column names, otherwise auto-assigned left-to-right).
 *
 * Returns structured rows with per-cell validity flags.
 */
export function mapTsvToFields(
  rawRows: string[][],
  fieldNames: string[],
  validators?: Record<string, (v: string) => boolean>
): PastedRow[] {
  const hasHeader =
    rawRows.length > 0 &&
    rawRows[0].some((cell) => fieldNames.includes(cell.trim().toLowerCase()));

  const headers: string[] = hasHeader
    ? rawRows[0].map((cell) => cell.trim().toLowerCase())
    : fieldNames.slice(0, rawRows[0]?.length ?? 0);

  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

  return dataRows.map((cells) => {
    const fields: PastedField[] = headers.map((key, i) => {
      const value = cells[i]?.trim() ?? '';
      const validator = validators?.[key];
      const invalid = validator ? !validator(value) : false;
      return { key, value, invalid };
    });
    return { fields, hasErrors: fields.some((f) => f.invalid) };
  });
}

/**
 * Summarise paste result: how many rows were pasted and how many have errors.
 */
export function pasteSummary(rows: PastedRow[]): string {
  const total = rows.length;
  const bad = rows.filter((r) => r.hasErrors).length;
  if (bad === 0) return `${total} row${total !== 1 ? 's' : ''} pasted`;
  return `${total} row${total !== 1 ? 's' : ''} pasted, ${bad} need${bad === 1 ? 's' : ''} fixes`;
}
