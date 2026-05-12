export interface CsvRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface CsvValidation {
  valid: boolean;
  rows: CsvRow[];
  errors: Array<{ rowNumber: number; field: string; message: string }>;
}

export function parseCsv(csv: string): CsvRow[] {
  const lines = csv.replace(/\r\n/g, '\n').trim().split('\n');
  if (lines.length === 0 || !lines[0]) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const values = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? '']));
    return { rowNumber: index + 2, values };
  });
}

export function validateBatchCsv(csv: string): CsvValidation {
  const rows = parseCsv(csv);
  const errors: CsvValidation['errors'] = [];
  const required = ['name', 'category', 'vendor', 'intake_qty', 'unit_cost', 'unit_price'];

  for (const row of rows) {
    for (const field of required) {
      if (!row.values[field]) errors.push({ rowNumber: row.rowNumber, field, message: `${field} is required.` });
    }
    if (row.values.intake_qty && Number(row.values.intake_qty) <= 0) {
      errors.push({ rowNumber: row.rowNumber, field: 'intake_qty', message: 'Quantity must be above zero.' });
    }
  }

  return { valid: errors.length === 0, rows, errors };
}

export function rowsToCsv(rows: Array<Record<string, unknown>>, headers: string[]) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => quoteCsv(row[header])).join(','));
  }
  return lines.join('\n');
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function quoteCsv(value: unknown) {
  const raw = value == null ? '' : Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}
