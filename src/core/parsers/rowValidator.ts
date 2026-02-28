/**
 * Row Validator — Filters valid data rows from headers, footers, totals, and blanks
 * 
 * Also handles multi-page table merging:
 * - Removes repeated headers across pages
 * - Removes page footers
 * - Removes subtotal/total rows
 * - Removes blank rows
 * - Detects continuation rows (wrapped descriptions)
 */

import type {
  OcrLine,
  ParsedRow,
  ParsedCell,
  ColumnMap,
  LedgerEntry,
  Party,
} from '@/types';
import { SKIP_ROW_PATTERNS } from '@/constants';
import { parseDate } from './dateParser';
import { parseAmount } from './amountParser';
import { assignWordsToColumns } from './columnDetector';
import type { NumberFormatConfig } from '@/types';

// ─── Row Classification ─────────────────────────────────────
export type RowClassification =
  | 'data'
  | 'header'
  | 'footer'
  | 'subtotal'
  | 'empty'
  | 'continuation'
  | 'unknown';

export interface ClassifiedRow {
  line: OcrLine;
  lineIndex: number;
  classification: RowClassification;
  confidence: number;
}

/**
 * Classify all rows in OCR output
 */
export function classifyRows(
  lines: OcrLine[],
  headerRowIndex: number
): ClassifiedRow[] {
  const classified: ClassifiedRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text.trim();

    let classification: RowClassification;
    let confidence = 0.8;

    // ── Empty check ──
    if (!text || text.length < 2) {
      classification = 'empty';
      confidence = 1.0;
    }
    // ── Header check ──
    else if (i === headerRowIndex || isHeaderRow(text)) {
      classification = 'header';
      confidence = 0.9;
    }
    // ── Footer check ──
    else if (isFooterRow(text)) {
      classification = 'footer';
      confidence = 0.85;
    }
    // ── Subtotal check ──
    else if (isSubtotalRow(text)) {
      classification = 'subtotal';
      confidence = 0.9;
    }
    // ── Skip pattern check ──
    else if (matchesSkipPattern(text)) {
      classification = 'footer';
      confidence = 0.85;
    }
    // ── Continuation check (no date at start, likely wrapped description) ──
    else if (i > 0 && isContinuationRow(line, lines[i - 1])) {
      classification = 'continuation';
      confidence = 0.7;
    }
    // ── Data row ──
    else {
      classification = 'data';
      confidence = 0.8;
    }

    classified.push({
      line,
      lineIndex: i,
      classification,
      confidence,
    });
  }

  return classified;
}

// ─── Header detection ────────────────────────────────────────
function isHeaderRow(text: string): boolean {
  const lower = text.toLowerCase();
  const headerTerms = [
    'date', 'description', 'narration', 'particulars',
    'debit', 'credit', 'balance', 'amount', 'withdrawal',
    'deposit', 'reference', 'ref no',
  ];

  let matchCount = 0;
  for (const term of headerTerms) {
    if (lower.includes(term)) matchCount++;
  }

  return matchCount >= 2;
}

// ─── Footer detection ────────────────────────────────────────
function isFooterRow(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /^page\s+\d+/i.test(lower) ||
    /continued\s+(on|from)/i.test(lower) ||
    /this\s+is\s+(a\s+)?computer/i.test(lower) ||
    /generated\s+(on|at)/i.test(lower) ||
    /end\s+of\s+statement/i.test(lower) ||
    /^\*{3,}/.test(text) ||
    /^-{10,}$/.test(text) ||
    /^={10,}$/.test(text)
  );
}

// ─── Subtotal detection ──────────────────────────────────────
function isSubtotalRow(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(sub\s?total|total|balance\s+(c\/f|b\/f|carried|brought))\b/i.test(lower) ||
    /\b(opening\s+balance|closing\s+balance)\b/i.test(lower) ||
    /\b(total\s+(debit|credit|withdrawal|deposit)s?)\b/i.test(lower) ||
    /\btotal\s+for\s+/i.test(lower)
  );
}

// ─── Skip pattern matching ───────────────────────────────────
function matchesSkipPattern(text: string): boolean {
  return SKIP_ROW_PATTERNS.some((pattern) => pattern.test(text));
}

// ─── Continuation row detection ──────────────────────────────
function isContinuationRow(
  currentLine: OcrLine,
  previousLine: OcrLine
): boolean {
  const text = currentLine.text.trim();

  // A continuation row typically:
  // 1. Has no date-like pattern at the start
  // 2. Has no numeric amount
  // 3. Is indented (x position > typical date column x)
  // 4. Previous line was a data row

  const startsWithDate = /^\d{1,2}[\/\-.]/.test(text);
  const hasAmount = /\d+[.,]\d{2}/.test(text);
  const isIndented = currentLine.words.length > 0 &&
    currentLine.words[0].bbox.x0 > 50; // rough heuristic

  // If no date at start and no amounts, likely continuation
  return !startsWithDate && !hasAmount && isIndented;
}

// ─── Parse classified rows into LedgerEntries ────────────────
export function parseRowsToEntries(
  classifiedRows: ClassifiedRow[],
  columnMap: ColumnMap,
  party: Party,
  pageNumber: number,
  numberFormatConfig?: NumberFormatConfig,
  preferredDateFormat?: string
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let pendingContinuation = '';

  for (let i = 0; i < classifiedRows.length; i++) {
    const row = classifiedRows[i];

    // Skip non-data rows
    if (row.classification !== 'data' && row.classification !== 'continuation') {
      continue;
    }

    // Handle continuation rows — append to previous entry's description
    if (row.classification === 'continuation' && entries.length > 0) {
      const lastEntry = entries[entries.length - 1];
      lastEntry.description = (lastEntry.description + ' ' + row.line.text.trim()).trim();
      lastEntry.rawText += '\n' + row.line.text;
      continue;
    }

    // Parse data row
    const entry = parseDataRow(
      row,
      columnMap,
      party,
      pageNumber,
      entries.length,
      numberFormatConfig,
      preferredDateFormat
    );

    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

// ─── Parse a single data row ─────────────────────────────────
function parseDataRow(
  row: ClassifiedRow,
  columnMap: ColumnMap,
  party: Party,
  pageNumber: number,
  rowIndex: number,
  numberFormatConfig?: NumberFormatConfig,
  preferredDateFormat?: string
): LedgerEntry | null {
  const line = row.line;

  // Assign words to columns by x-position
  const columnValues = assignWordsToColumns(line.words, columnMap);

  // ── Extract date ──
  const dateRaw = columnValues.get('date') ?? '';
  const dateParsed = parseDate(dateRaw, preferredDateFormat);

  // ── Extract description ──
  const description = columnValues.get('description') ?? line.text;

  // ── Extract amounts ──
  let debit: number | null = null;
  let credit: number | null = null;
  let balance: number | null = null;

  if (columnMap.amountStyle === 'separate_debit_credit') {
    const debitRaw = columnValues.get('debit') ?? '';
    const creditRaw = columnValues.get('credit') ?? '';

    const debitParsed = parseAmount(debitRaw, numberFormatConfig);
    const creditParsed = parseAmount(creditRaw, numberFormatConfig);

    if (debitParsed) debit = Math.abs(debitParsed.value);
    if (creditParsed) credit = Math.abs(creditParsed.value);
  } else {
    // Single amount column
    const amountRaw = columnValues.get('amount') ?? '';
    const amountParsed = parseAmount(amountRaw, numberFormatConfig);

    if (amountParsed) {
      if (amountParsed.isNegative || amountParsed.value < 0) {
        debit = Math.abs(amountParsed.value);
      } else {
        credit = Math.abs(amountParsed.value);
      }
    }
  }

  // ── Extract balance ──
  const balanceRaw = columnValues.get('balance') ?? '';
  const balanceParsed = parseAmount(balanceRaw, numberFormatConfig);
  if (balanceParsed) balance = balanceParsed.value;

  // ── Extract reference ──
  const refNumber = columnValues.get('reference') ?? null;

  // ── Compute signed amount ──
  const amount = (credit ?? 0) - (debit ?? 0);
  const amountAbs = Math.abs(amount);
  const amountCents = Math.round(amount * 100);

  // ── Validate: must have at least a date or an amount ──
  if (!dateParsed && debit === null && credit === null) {
    return null;
  }

  // ── Build entry ──
  const entry: LedgerEntry = {
    id: crypto.randomUUID(),
    party,
    rowIndex,
    pageNumber,
    date: dateParsed?.iso ?? null,
    description: description.trim(),
    debit,
    credit,
    balance,
    refNumber: refNumber?.trim() ?? null,
    amount,
    amountAbs,
    amountCents,
    rawText: line.text,
    ocrConfidence: line.confidence,
    boundingBox: {
      x: line.bbox.x0,
      y: line.bbox.y0,
      width: line.bbox.x1 - line.bbox.x0,
      height: line.bbox.y1 - line.bbox.y0,
      pageNumber,
    },
    createdAt: Date.now(),
  };

  return entry;
}

// ─── Multi-page table merge ──────────────────────────────────
/**
 * Merge entries from multiple pages, removing duplicate header rows
 * and maintaining correct row ordering.
 */
export function mergeMultiPageEntries(
  pageEntries: LedgerEntry[][]
): LedgerEntry[] {
  const merged: LedgerEntry[] = [];
  const seenHashes = new Set<string>();

  for (const pageEntriesList of pageEntries) {
    for (const entry of pageEntriesList) {
      // Dedup by content hash (catches repeated first/last rows across pages)
      const hash = `${entry.date}|${entry.amountCents}|${entry.description.slice(0, 30)}`;

      if (seenHashes.has(hash)) {
        // Check if it's truly a duplicate or just similar
        // Allow if row index is different enough
        const isDuplicate = merged.some(
          (m) =>
            m.date === entry.date &&
            m.amountCents === entry.amountCents &&
            m.description === entry.description &&
            Math.abs(m.pageNumber - entry.pageNumber) <= 1
        );

        if (isDuplicate) continue;
      }

      seenHashes.add(hash);
      merged.push({
        ...entry,
        rowIndex: merged.length, // renumber sequentially
      });
    }
  }

  return merged;
}

// ─── Build ledger summary stats ──────────────────────────────
export function buildLedgerSummary(
  entries: LedgerEntry[],
  party: Party,
  fileName: string
): import('@/types').LedgerSummary {
  const validEntries = entries.filter((e) => e.date !== null);
  const dates = validEntries
    .map((e) => e.date!)
    .sort();

  const totalDebit = entries.reduce(
    (sum, e) => sum + (e.debit ?? 0), 0
  );
  const totalCredit = entries.reduce(
    (sum, e) => sum + (e.credit ?? 0), 0
  );
  const lowConfCount = entries.filter(
    (e) => e.ocrConfidence < 70
  ).length;
  const avgConfidence = entries.length > 0
    ? entries.reduce((sum, e) => sum + e.ocrConfidence, 0) / entries.length
    : 0;

  return {
    party,
    fileName,
    totalRows: entries.length,
    validRows: validEntries.length,
    skippedRows: entries.length - validEntries.length,
    lowConfidenceRows: lowConfCount,
    totalDebit,
    totalCredit,
    netAmount: totalCredit - totalDebit,
    dateRange: {
      earliest: dates.length > 0 ? dates[0] : null,
      latest: dates.length > 0 ? dates[dates.length - 1] : null,
    },
    ocrAverageConfidence: Math.round(avgConfidence * 100) / 100,
  };
}