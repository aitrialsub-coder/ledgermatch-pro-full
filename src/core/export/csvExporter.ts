/**
 * CSV Exporter — Full reconciliation report as CSV
 * 
 * Generates multiple CSV formats:
 * 1. Match report: side-by-side A | Status | B with match details
 * 2. Unmatched only: entries that didn't match
 * 3. Summary: aggregate statistics
 * 4. Audit trail: all match decisions with reasons
 * 
 * Uses PapaParse for robust CSV serialization.
 */

import Papa from 'papaparse';
import type {
  MatchGroup,
  MatchResult,
  LedgerEntry,
  MatchingConfig,
} from '@/types';
import {
  MATCH_TYPE_LABELS,
  MATCH_STATUS_LABELS,
} from '@/constants';
import { formatAmountDisplay } from '../parsers/amountParser';

// ─── Export options ──────────────────────────────────────────

export interface CsvExportOptions {
  includeRawText: boolean;        // include raw OCR text column
  includeConfidence: boolean;     // include OCR confidence column
  includeMatchReason: boolean;    // include match reason column
  includeComments: boolean;       // include comments column
  dateFormat: string;             // output date format
  currency: string;               // currency symbol for amounts
  separator: ',' | ';' | '\t';   // CSV delimiter
  encoding: 'utf-8' | 'utf-8-bom'; // BOM for Excel compatibility
}

export const DEFAULT_CSV_OPTIONS: CsvExportOptions = {
  includeRawText: false,
  includeConfidence: true,
  includeMatchReason: true,
  includeComments: true,
  dateFormat: 'YYYY-MM-DD',
  currency: 'USD',
  separator: ',',
  encoding: 'utf-8-bom',
};

// ─── Main export: Full match report ──────────────────────────

export function exportMatchReportCsv(
  result: MatchResult,
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  options: CsvExportOptions = DEFAULT_CSV_OPTIONS
): string {
  const entryMapA = new Map(entriesA.map((e) => [e.id, e]));
  const entryMapB = new Map(entriesB.map((e) => [e.id, e]));

  const rows: Record<string, string>[] = [];

  for (const group of result.matchGroups) {
    // Get entries for this match group
    const aEntries = group.entriesA
      .map((id) => entryMapA.get(id))
      .filter(Boolean) as LedgerEntry[];
    const bEntries = group.entriesB
      .map((id) => entryMapB.get(id))
      .filter(Boolean) as LedgerEntry[];

    // For split matches, we may have 1:N or N:1
    const maxRows = Math.max(aEntries.length, bEntries.length, 1);

    for (let i = 0; i < maxRows; i++) {
      const entryA = aEntries[i] ?? null;
      const entryB = bEntries[i] ?? null;

      const row: Record<string, string> = {
        'Match ID': i === 0 ? group.id.substring(0, 8) : '',
        'Match Type': i === 0 ? MATCH_TYPE_LABELS[group.matchType] ?? group.matchType : '',
        'Status': i === 0 ? MATCH_STATUS_LABELS[group.status] ?? group.status : '',
        'Confidence': i === 0 ? `${group.confidence}%` : '',

        // Ledger A columns
        'A — Date': entryA?.date ?? '',
        'A — Description': entryA?.description ?? '',
        'A — Debit': entryA?.debit != null ? formatAmount(entryA.debit) : '',
        'A — Credit': entryA?.credit != null ? formatAmount(entryA.credit) : '',
        'A — Balance': entryA?.balance != null ? formatAmount(entryA.balance) : '',
        'A — Reference': entryA?.refNumber ?? '',

        // Ledger B columns
        'B — Date': entryB?.date ?? '',
        'B — Description': entryB?.description ?? '',
        'B — Debit': entryB?.debit != null ? formatAmount(entryB.debit) : '',
        'B — Credit': entryB?.credit != null ? formatAmount(entryB.credit) : '',
        'B — Balance': entryB?.balance != null ? formatAmount(entryB.balance) : '',
        'B — Reference': entryB?.refNumber ?? '',

        // Difference
        'Amount Difference': i === 0 ? formatAmount(group.amountDifference) : '',
        'Date Difference (days)': i === 0 && group.dateDifference >= 0
          ? group.dateDifference.toString()
          : '',
      };

      // Optional columns
      if (options.includeMatchReason) {
        row['Match Reason'] = i === 0 ? group.matchReason : '';
      }

      if (options.includeConfidence) {
        row['A — OCR Confidence'] = entryA
          ? `${Math.round(entryA.ocrConfidence)}%`
          : '';
        row['B — OCR Confidence'] = entryB
          ? `${Math.round(entryB.ocrConfidence)}%`
          : '';
      }

      if (options.includeRawText) {
        row['A — Raw OCR Text'] = entryA?.rawText ?? '';
        row['B — Raw OCR Text'] = entryB?.rawText ?? '';
      }

      if (options.includeComments && group.comments.length > 0 && i === 0) {
        row['Comments'] = group.comments
          .map((c) => `[${new Date(c.createdAt).toLocaleDateString()}] ${c.text}`)
          .join(' | ');
      } else if (options.includeComments) {
        row['Comments'] = '';
      }

      rows.push(row);
    }
  }

  return serializeCsv(rows, options);
}

// ─── Unmatched-only export ───────────────────────────────────

export function exportUnmatchedCsv(
  result: MatchResult,
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  options: CsvExportOptions = DEFAULT_CSV_OPTIONS
): string {
  const entryMapA = new Map(entriesA.map((e) => [e.id, e]));
  const entryMapB = new Map(entriesB.map((e) => [e.id, e]));

  const rows: Record<string, string>[] = [];

  const unmatchedGroups = result.matchGroups.filter(
    (mg) => mg.matchType === 'unmatched_a' || mg.matchType === 'unmatched_b'
  );

  for (const group of unmatchedGroups) {
    const isA = group.matchType === 'unmatched_a';
    const entryIds = isA ? group.entriesA : group.entriesB;
    const entryMap = isA ? entryMapA : entryMapB;

    for (const id of entryIds) {
      const entry = entryMap.get(id);
      if (!entry) continue;

      rows.push({
        'Ledger': isA ? 'A' : 'B',
        'Date': entry.date ?? '',
        'Description': entry.description,
        'Debit': entry.debit != null ? formatAmount(entry.debit) : '',
        'Credit': entry.credit != null ? formatAmount(entry.credit) : '',
        'Balance': entry.balance != null ? formatAmount(entry.balance) : '',
        'Reference': entry.refNumber ?? '',
        'Amount': formatAmount(entry.amountAbs),
        'OCR Confidence': `${Math.round(entry.ocrConfidence)}%`,
        'Reason': group.matchReason,
      });
    }
  }

  return serializeCsv(rows, options);
}

// ─── Summary export ──────────────────────────────────────────

export function exportSummaryCsv(
  result: MatchResult,
  options: CsvExportOptions = DEFAULT_CSV_OPTIONS
): string {
  const s = result.summary;

  const rows: Record<string, string>[] = [
    { 'Metric': 'Session ID', 'Value': result.sessionId },
    { 'Metric': 'Completed At', 'Value': new Date(result.completedAt).toISOString() },
    { 'Metric': 'Processing Time', 'Value': `${(s.processingTimeMs / 1000).toFixed(2)}s` },
    { 'Metric': '', 'Value': '' },
    { 'Metric': '── Entries ──', 'Value': '' },
    { 'Metric': 'Total Entries (Ledger A)', 'Value': s.totalEntriesA.toString() },
    { 'Metric': 'Total Entries (Ledger B)', 'Value': s.totalEntriesB.toString() },
    { 'Metric': '', 'Value': '' },
    { 'Metric': '── Match Results ──', 'Value': '' },
    { 'Metric': 'Matched', 'Value': s.matchedCount.toString() },
    { 'Metric': 'Unmatched (Ledger A)', 'Value': s.unmatchedACount.toString() },
    { 'Metric': 'Unmatched (Ledger B)', 'Value': s.unmatchedBCount.toString() },
    { 'Metric': 'Split Matches', 'Value': s.splitCount.toString() },
    { 'Metric': 'Duplicates', 'Value': s.duplicateCount.toString() },
    { 'Metric': 'Match Rate', 'Value': `${(s.matchRate * 100).toFixed(1)}%` },
    { 'Metric': 'Average Confidence', 'Value': `${s.averageConfidence}%` },
    { 'Metric': '', 'Value': '' },
    { 'Metric': '── Amounts ──', 'Value': '' },
    { 'Metric': 'Total Amount (Ledger A)', 'Value': formatAmount(s.totalAmountA) },
    { 'Metric': 'Total Amount (Ledger B)', 'Value': formatAmount(s.totalAmountB) },
    { 'Metric': 'Total Discrepancy', 'Value': formatAmount(s.totalDiscrepancy) },
    { 'Metric': 'Matched Amount', 'Value': formatAmount(s.matchedAmount) },
    { 'Metric': 'Unmatched Amount (A)', 'Value': formatAmount(s.unmatchedAmountA) },
    { 'Metric': 'Unmatched Amount (B)', 'Value': formatAmount(s.unmatchedAmountB) },
    { 'Metric': '', 'Value': '' },
    { 'Metric': '── By Pass ──', 'Value': '' },
  ];

  for (const pass of s.byPass) {
    rows.push({
      'Metric': `Pass ${pass.passNumber}: ${pass.passName}`,
      'Value': `${pass.matchCount} matches (avg ${pass.averageConfidence}% confidence, ${pass.timeMs.toFixed(0)}ms)`,
    });
  }

  // Config
  rows.push({ 'Metric': '', 'Value': '' });
  rows.push({ 'Metric': '── Configuration ──', 'Value': '' });
  rows.push({
    'Metric': 'Date Tolerance',
    'Value': `±${result.config.dateToleranceDays} days`,
  });
  rows.push({
    'Metric': 'Amount Tolerance (%)',
    'Value': `±${(result.config.amountTolerancePercent * 100).toFixed(2)}%`,
  });
  rows.push({
    'Metric': 'Amount Tolerance (fixed)',
    'Value': `±$${result.config.amountToleranceFixed.toFixed(2)}`,
  });
  rows.push({
    'Metric': 'Description Threshold',
    'Value': `${(result.config.descriptionThreshold * 100).toFixed(0)}%`,
  });
  rows.push({
    'Metric': 'Polarity Mode',
    'Value': result.config.polarityMode,
  });

  return serializeCsv(rows, options);
}

// ─── Audit trail export ──────────────────────────────────────

export function exportAuditTrailCsv(
  result: MatchResult,
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  options: CsvExportOptions = DEFAULT_CSV_OPTIONS
): string {
  const entryMapA = new Map(entriesA.map((e) => [e.id, e]));
  const entryMapB = new Map(entriesB.map((e) => [e.id, e]));

  const rows: Record<string, string>[] = [];

  for (const group of result.matchGroups) {
    const aDescs = group.entriesA
      .map((id) => entryMapA.get(id)?.description ?? '')
      .filter(Boolean)
      .join('; ');
    const bDescs = group.entriesB
      .map((id) => entryMapB.get(id)?.description ?? '')
      .filter(Boolean)
      .join('; ');

    const aAmounts = group.entriesA
      .map((id) => entryMapA.get(id)?.amountAbs ?? 0)
      .reduce((sum, a) => sum + a, 0);
    const bAmounts = group.entriesB
      .map((id) => entryMapB.get(id)?.amountAbs ?? 0)
      .reduce((sum, a) => sum + a, 0);

    rows.push({
      'Match Group ID': group.id.substring(0, 8),
      'Pass': group.passNumber.toString(),
      'Type': MATCH_TYPE_LABELS[group.matchType] ?? group.matchType,
      'Confidence': `${group.confidence}%`,
      'Status': MATCH_STATUS_LABELS[group.status] ?? group.status,
      'Entries A (count)': group.entriesA.length.toString(),
      'Entries B (count)': group.entriesB.length.toString(),
      'Amount A': formatAmount(aAmounts),
      'Amount B': formatAmount(bAmounts),
      'Amount Difference': formatAmount(group.amountDifference),
      'Date Difference': group.dateDifference >= 0 ? `${group.dateDifference} days` : 'N/A',
      'Description Similarity': group.descriptionSimilarity > 0
        ? `${(group.descriptionSimilarity * 100).toFixed(0)}%`
        : 'N/A',
      'Match Reason': group.matchReason,
      'A Descriptions': aDescs,
      'B Descriptions': bDescs,
      'Comments': group.comments
        .map((c) => c.text)
        .join(' | '),
      'Created At': new Date(group.createdAt).toISOString(),
    });
  }

  return serializeCsv(rows, options);
}

// ─── Ledger entries export (single side) ─────────────────────

export function exportLedgerEntriesCsv(
  entries: LedgerEntry[],
  party: 'A' | 'B',
  options: CsvExportOptions = DEFAULT_CSV_OPTIONS
): string {
  const rows: Record<string, string>[] = entries.map((entry) => {
    const row: Record<string, string> = {
      'Row': entry.rowIndex.toString(),
      'Page': entry.pageNumber.toString(),
      'Date': entry.date ?? '',
      'Description': entry.description,
      'Debit': entry.debit != null ? formatAmount(entry.debit) : '',
      'Credit': entry.credit != null ? formatAmount(entry.credit) : '',
      'Balance': entry.balance != null ? formatAmount(entry.balance) : '',
      'Reference': entry.refNumber ?? '',
      'Net Amount': formatAmount(entry.amount),
      'OCR Confidence': `${Math.round(entry.ocrConfidence)}%`,
    };

    if (options.includeRawText) {
      row['Raw OCR Text'] = entry.rawText;
    }

    return row;
  });

  return serializeCsv(rows, options);
}

// ─── CSV serialization ──────────────────────────────────────

function serializeCsv(
  rows: Record<string, string>[],
  options: CsvExportOptions
): string {
  if (rows.length === 0) return '';

  const csv = Papa.unparse(rows, {
    delimiter: options.separator,
    newline: '\r\n',
    quotes: true,
    quoteChar: '"',
    escapeChar: '"',
    header: true,
  });

  // Add BOM for Excel compatibility
  if (options.encoding === 'utf-8-bom') {
    return '\uFEFF' + csv;
  }

  return csv;
}

// ─── Amount formatting helper ────────────────────────────────

function formatAmount(value: number): string {
  if (value === 0) return '0.00';
  return value.toFixed(2);
}

// ─── Download trigger ────────────────────────────────────────

export function downloadCsv(
  content: string,
  filename: string
): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}