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
  /** True when the field has optionSource values and the pasted value doesn't match any option.
   *  The value is kept — it's just flagged with an amber indicator for operator review. */
  unmatched?: boolean;
}

export interface PastedRow {
  fields: PastedField[];
  hasErrors: boolean;
  /** True when any field is unmatched (amber indicator) but not invalid. */
  hasUnmatched?: boolean;
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
 * `optionSources` maps field keys to their option source definitions.
 * Smart paste: matched values use enum/status options from schema.
 * If a pasted value doesn't match any option, the cell is flagged unmatched
 * (amber indicator) but the value is kept — it's not rejected.
 *
 * Returns structured rows with per-cell validity and unmatched flags.
 */
export function mapTsvToFields(
  rawRows: string[][],
  fieldNames: string[],
  validators?: Record<string, (v: string) => boolean>,
  optionSources?: Record<string, { kind: string; values?: { value: string; label: string }[] }>
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

      // Smart paste: matched values use enum/status options from schema.
      // If the field has an optionSource with enum/status values and the
      // pasted value doesn't match any option, flag it as unmatched (amber)
      // but keep the text — don't reject the paste.
      let unmatched: boolean | undefined;
      if (value && !invalid) {
        const os = optionSources?.[key];
        if (os && (os.kind === 'enum' || os.kind === 'status') && os.values && os.values.length > 0) {
          const matched = os.values.some(
            (opt) => opt.value.toLowerCase() === value.toLowerCase() || opt.label.toLowerCase() === value.toLowerCase(),
          );
          if (!matched) {
            unmatched = true;
          }
        }
      }

      return { key, value, invalid, unmatched };
    });
    return {
      fields,
      hasErrors: fields.some((f) => f.invalid),
      hasUnmatched: fields.some((f) => f.unmatched),
    };
  });
}

/**
 * Summarise paste result: how many rows were pasted, how many have errors,
 * and how many have unmatched values (amber flag — smart paste review).
 */
export function pasteSummary(rows: PastedRow[]): string {
  const total = rows.length;
  const bad = rows.filter((r) => r.hasErrors).length;
  const unmatched = rows.filter((r) => r.hasUnmatched && !r.hasErrors).length;
  let summary = `${total} row${total !== 1 ? 's' : ''} pasted`;
  if (bad > 0) {
    summary += `, ${bad} need${bad === 1 ? 's' : ''} fixes`;
  }
  if (unmatched > 0) {
    summary += `, ${unmatched} flagged for review`;
  }
  return summary;
}
