/**
 * CSV Parser — Direct import for CSV/spreadsheet files (no OCR needed)
 * 
 * Uses PapaParse for robust CSV parsing, then applies the same
 * column detection and amount/date parsing as OCR'd documents.
 */

import Papa from 'papaparse';
import type {
  Party,
  LedgerEntry,
  ColumnMap,
  ColumnType,
  NumberFormatConfig,
} from '@/types';
import { parseDate, detectDateFormat } from './dateParser';
import { parseAmount } from './amountParser';
import { detectNumberFormat } from './numberFormatDetector';
import { buildLedgerSummary } from './rowValidator';
import { HEADER_KEYWORDS } from '@/constants';

export interface CsvParseResult {
  entries: LedgerEntry[];
  columnMap: ColumnMap;
  numberFormat: NumberFormatConfig;
  dateFormat: string;
  summary: import('@/types').LedgerSummary;
  warnings: string[];
}

/**
 * Parse a CSV file directly into LedgerEntries
 */
export function parseCsvFile(
  csvContent: string,
  party: Party,
  fileName: string
): CsvParseResult {
  const warnings: string[] = [];

  // ── Step 1: Parse CSV with PapaParse ──
  const parsed = Papa.parse(csvContent, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
    trimHeaders: true,
  });

  if (parsed.errors.length > 0) {
    for (const err of parsed.errors.slice(0, 5)) {
      warnings.push(`CSV parse warning (row ${err.row}): ${err.message}`);
    }
  }

  const rows = parsed.data as string[][];
  if (rows.length < 2) {
    return emptyResult(party, fileName, ['CSV has fewer than 2 rows']);
  }

  // ── Step 2: Detect header row ──
  const headerIndex = findHeaderRow(rows);
  const headerRow = headerIndex >= 0 ? rows[headerIndex] : null;
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows;

  // ── Step 3: Map columns from header ──
  const columnMap = headerRow
    ? mapColumnsFromCsvHeader(headerRow)
    : mapColumnsByPosition(rows[0].length);

  // ── Step 4: Detect number format from data ──
  const amountSamples = extractAmountSamples(dataRows, columnMap);
  const formatDetection = detectNumberFormat(amountSamples);

  // ── Step 5: Detect date format from data ──
  const dateSamples = extractDateSamples(dataRows, columnMap);
  const dateDetection = detectDateFormat(dateSamples);

  if (dateDetection.ambiguous) {
    warnings.push(
      `Date format is ambiguous (DD/MM vs MM/DD). Using ${dateDetection.format}. ` +
      'You can override this in settings.'
    );
  }

  // ── Step 6: Parse each row into LedgerEntry ──
  const entries: LedgerEntry[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const entry = parseCsvRow(
      row,
      columnMap,
      party,
      i,
      formatDetection.config,
      dateDetection.format
    );

    if (entry) {
      entries.push(entry);
    }
  }

  const summary = buildLedgerSummary(entries, party, fileName);

  return {
    entries,
    columnMap,
    numberFormat: formatDetection.config,
    dateFormat: dateDetection.format,
    summary,
    warnings,
  };
}

// ─── Find header row in CSV ──────────────────────────────────
function findHeaderRow(rows: string[][]): number {
  const searchLimit = Math.min(rows.length, 5);

  for (let i = 0; i < searchLimit; i++) {
    const row = rows[i];
    const rowText = row.join(' ').toLowerCase();

    let matchCount = 0;
    for (const keywords of Object.values(HEADER_KEYWORDS)) {
      for (const keyword of keywords) {
        if (rowText.includes(keyword)) {
          matchCount++;
          break; // only count each category once
        }
      }
    }

    if (matchCount >= 2) return i;
  }

  return -1; // no header found — assume first row is data
}

// ─── Map columns from CSV header text ────────────────────────
function mapColumnsFromCsvHeader(headerRow: string[]): ColumnMap {
  const columns: import('@/types').ColumnMapping[] = [];

  for (let i = 0; i < headerRow.length; i++) {
    const header = headerRow[i].trim().toLowerCase();
    const type = identifyColumnType(header);

    columns.push({
      index: i,
      type,
      headerText: headerRow[i].trim(),
      xStart: i * 100,
      xEnd: (i + 1) * 100,
      confidence: type !== 'unknown' ? 0.9 : 0.3,
    });
  }

  return assembleColumnMapFromCsv(columns);
}

function identifyColumnType(header: string): ColumnType {
  for (const [type, keywords] of Object.entries(HEADER_KEYWORDS)) {
    for (const keyword of keywords) {
      if (header === keyword || header.includes(keyword)) {
        return type as ColumnType;
      }
    }
  }
  return 'unknown';
}

// ─── Map columns by position (no header) ─────────────────────
function mapColumnsByPosition(numColumns: number): ColumnMap {
  // Common CSV layouts:
  // 4 columns: Date, Description, Amount, Balance
  // 5 columns: Date, Description, Debit, Credit, Balance
  // 6 columns: Date, Description, Ref, Debit, Credit, Balance

  const types: ColumnType[] = [];

  if (numColumns <= 3) {
    types.push('date', 'description', 'amount');
  } else if (numColumns === 4) {
    types.push('date', 'description', 'amount', 'balance');
  } else if (numColumns === 5) {
    types.push('date', 'description', 'debit', 'credit', 'balance');
  } else {
    types.push('date', 'description', 'reference', 'debit', 'credit', 'balance');
    for (let i = 6; i < numColumns; i++) {
      types.push('ignore');
    }
  }

  const columns: import('@/types').ColumnMapping[] = types.map((type, i) => ({
    index: i,
    type,
    headerText: type,
    xStart: i * 100,
    xEnd: (i + 1) * 100,
    confidence: 0.4,
  }));

  return assembleColumnMapFromCsv(columns);
}

function assembleColumnMapFromCsv(
  columns: import('@/types').ColumnMapping[]
): ColumnMap {
  const findIdx = (type: ColumnType) =>
    columns.find((c) => c.type === type)?.index ?? -1;

  const debitIdx = findIdx('debit');
  const creditIdx = findIdx('credit');
  const amountIdx = findIdx('amount');

  let amountStyle: import('@/types').AmountStyle;
  if (debitIdx >= 0 && creditIdx >= 0) {
    amountStyle = 'separate_debit_credit';
  } else {
    amountStyle = 'single_signed';
  }

  return {
    columns,
    dateColumnIndex: findIdx('date'),
    descriptionColumnIndex: findIdx('description'),
    debitColumnIndex: debitIdx,
    creditColumnIndex: creditIdx,
    amountColumnIndex: amountIdx,
    balanceColumnIndex: findIdx('balance'),
    referenceColumnIndex: findIdx('reference'),
    amountStyle,
  };
}

// ─── Extract samples for format detection ────────────────────
function extractAmountSamples(
  rows: string[][],
  columnMap: ColumnMap
): string[] {
  const samples: string[] = [];
  const indices = [
    columnMap.debitColumnIndex,
    columnMap.creditColumnIndex,
    columnMap.amountColumnIndex,
    columnMap.balanceColumnIndex,
  ].filter((i) => i >= 0);

  const sampleLimit = Math.min(rows.length, 20);

  for (let i = 0; i < sampleLimit; i++) {
    for (const colIdx of indices) {
      if (colIdx < rows[i].length && rows[i][colIdx].trim()) {
        samples.push(rows[i][colIdx].trim());
      }
    }
  }

  return samples;
}

function extractDateSamples(
  rows: string[][],
  columnMap: ColumnMap
): string[] {
  const samples: string[] = [];
  const dateIdx = columnMap.dateColumnIndex;

  if (dateIdx < 0) return samples;

  const sampleLimit = Math.min(rows.length, 20);
  for (let i = 0; i < sampleLimit; i++) {
    if (dateIdx < rows[i].length && rows[i][dateIdx].trim()) {
      samples.push(rows[i][dateIdx].trim());
    }
  }

  return samples;
}

// ─── Parse a single CSV row ──────────────────────────────────
function parseCsvRow(
  row: string[],
  columnMap: ColumnMap,
  party: Party,
  rowIndex: number,
  numberFormat: NumberFormatConfig,
  dateFormat: string
): LedgerEntry | null {
  const getValue = (colIdx: number): string =>
    colIdx >= 0 && colIdx < row.length ? row[colIdx].trim() : '';

  // Date
  const dateRaw = getValue(columnMap.dateColumnIndex);
  const dateParsed = parseDate(dateRaw, dateFormat);

  // Description
  const description = getValue(columnMap.descriptionColumnIndex);

  // Amounts
  let debit: number | null = null;
  let credit: number | null = null;

  if (columnMap.amountStyle === 'separate_debit_credit') {
    const debitParsed = parseAmount(getValue(columnMap.debitColumnIndex), numberFormat);
    const creditParsed = parseAmount(getValue(columnMap.creditColumnIndex), numberFormat);
    if (debitParsed) debit = Math.abs(debitParsed.value);
    if (creditParsed) credit = Math.abs(creditParsed.value);
  } else {
    const amountParsed = parseAmount(getValue(columnMap.amountColumnIndex), numberFormat);
    if (amountParsed) {
      if (amountParsed.value < 0) {
        debit = Math.abs(amountParsed.value);
      } else {
        credit = amountParsed.value;
      }
    }
  }

  // Balance
  const balanceParsed = parseAmount(getValue(columnMap.balanceColumnIndex), numberFormat);
  const balance = balanceParsed?.value ?? null;

  // Reference
  const refNumber = getValue(columnMap.referenceColumnIndex) || null;

  // Skip if no usable data
  if (!dateParsed && debit === null && credit === null && !description) {
    return null;
  }

  const amount = (credit ?? 0) - (debit ?? 0);

  return {
    id: crypto.randomUUID(),
    party,
    rowIndex,
    pageNumber: 1,
    date: dateParsed?.iso ?? null,
    description,
    debit,
    credit,
    balance,
    refNumber,
    amount,
    amountAbs: Math.abs(amount),
    amountCents: Math.round(amount * 100),
    rawText: row.join(' | '),
    ocrConfidence: 100, // CSV = perfect extraction
    createdAt: Date.now(),
  };
}

// ─── Empty result helper ─────────────────────────────────────
function emptyResult(
  party: Party,
  fileName: string,
  warnings: string[]
): CsvParseResult {
  return {
    entries: [],
    columnMap: mapColumnsByPosition(4),
    numberFormat: {
      format: 'US',
      thousandSeparator: ',',
      decimalSeparator: '.',
      currencySymbol: '$',
      currencyPosition: 'prefix',
    },
    dateFormat: 'DD/MM/YYYY',
    summary: {
      party,
      fileName,
      totalRows: 0,
      validRows: 0,
      skippedRows: 0,
      lowConfidenceRows: 0,
      totalDebit: 0,
      totalCredit: 0,
      netAmount: 0,
      dateRange: { earliest: null, latest: null },
      ocrAverageConfidence: 0,
    },
    warnings,
  };
}