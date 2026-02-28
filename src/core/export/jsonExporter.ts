/**
 * JSON Exporter — Full structured data export
 * 
 * Exports the complete match result as a JSON file,
 * including all entries, match groups, configuration,
 * and summary statistics.
 * 
 * Useful for:
 * - Integration with other systems
 * - Archiving reconciliation results
 * - Importing back into LedgerMatch Pro
 */

import type {
  MatchResult,
  LedgerEntry,
  LedgerSummary,
  MatchingConfig,
} from '@/types';

// ─── Export options ──────────────────────────────────────────

export interface JsonExportOptions {
  includeEntries: boolean;          // include full entry data
  includeRawText: boolean;          // include raw OCR text per entry
  includeBoundingBoxes: boolean;    // include OCR bounding boxes
  prettyPrint: boolean;             // indent JSON for readability
  includeConfig: boolean;           // include matching configuration
  includeMetadata: boolean;         // include export metadata
}

export const DEFAULT_JSON_OPTIONS: JsonExportOptions = {
  includeEntries: true,
  includeRawText: false,
  includeBoundingBoxes: false,
  prettyPrint: true,
  includeConfig: true,
  includeMetadata: true,
};

// ─── Export data structure ───────────────────────────────────

export interface JsonExportData {
  metadata: {
    exportedAt: string;
    version: string;
    format: 'ledgermatch-pro-v1';
  };
  session: {
    id: string;
    completedAt: string;
    processingTimeMs: number;
  };
  config: MatchingConfig | null;
  summary: MatchResult['summary'];
  matchGroups: Array<{
    id: string;
    matchType: string;
    confidence: number;
    status: string;
    matchReason: string;
    passNumber: number;
    amountDifference: number;
    dateDifference: number;
    descriptionSimilarity: number;
    entriesA: string[];
    entriesB: string[];
    comments: Array<{
      text: string;
      createdBy: string;
      createdAt: string;
    }>;
  }>;
  ledgerA: {
    summary: LedgerSummary | null;
    entries: JsonEntry[] | null;
  };
  ledgerB: {
    summary: LedgerSummary | null;
    entries: JsonEntry[] | null;
  };
}

interface JsonEntry {
  id: string;
  rowIndex: number;
  pageNumber: number;
  date: string | null;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  refNumber: string | null;
  amount: number;
  ocrConfidence: number;
  rawText?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    pageNumber: number;
  };
}

// ─── Main export function ────────────────────────────────────

export function exportMatchResultJson(
  result: MatchResult,
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  summaryA: LedgerSummary | null,
  summaryB: LedgerSummary | null,
  options: JsonExportOptions = DEFAULT_JSON_OPTIONS
): string {
  const exportData: JsonExportData = {
    metadata: options.includeMetadata
      ? {
          exportedAt: new Date().toISOString(),
          version: '1.0.0',
          format: 'ledgermatch-pro-v1',
        }
      : { exportedAt: '', version: '', format: 'ledgermatch-pro-v1' },

    session: {
      id: result.sessionId,
      completedAt: new Date(result.completedAt).toISOString(),
      processingTimeMs: result.processingTimeMs,
    },

    config: options.includeConfig ? result.config : null,

    summary: result.summary,

    matchGroups: result.matchGroups.map((mg) => ({
      id: mg.id,
      matchType: mg.matchType,
      confidence: mg.confidence,
      status: mg.status,
      matchReason: mg.matchReason,
      passNumber: mg.passNumber,
      amountDifference: mg.amountDifference,
      dateDifference: mg.dateDifference,
      descriptionSimilarity: mg.descriptionSimilarity,
      entriesA: mg.entriesA,
      entriesB: mg.entriesB,
      comments: mg.comments.map((c) => ({
        text: c.text,
        createdBy: c.createdBy,
        createdAt: new Date(c.createdAt).toISOString(),
      })),
    })),

    ledgerA: {
      summary: summaryA,
      entries: options.includeEntries
        ? entriesA.map((e) => formatEntry(e, options))
        : null,
    },

    ledgerB: {
      summary: summaryB,
      entries: options.includeEntries
        ? entriesB.map((e) => formatEntry(e, options))
        : null,
    },
  };

  if (options.prettyPrint) {
    return JSON.stringify(exportData, null, 2);
  }

  return JSON.stringify(exportData);
}

// ─── Entry formatting ────────────────────────────────────────

function formatEntry(
  entry: LedgerEntry,
  options: JsonExportOptions
): JsonEntry {
  const formatted: JsonEntry = {
    id: entry.id,
    rowIndex: entry.rowIndex,
    pageNumber: entry.pageNumber,
    date: entry.date,
    description: entry.description,
    debit: entry.debit,
    credit: entry.credit,
    balance: entry.balance,
    refNumber: entry.refNumber,
    amount: entry.amount,
    ocrConfidence: entry.ocrConfidence,
  };

  if (options.includeRawText) {
    formatted.rawText = entry.rawText;
  }

  if (options.includeBoundingBoxes && entry.boundingBox) {
    formatted.boundingBox = entry.boundingBox;
  }

  return formatted;
}

// ─── Import (load previously exported JSON) ──────────────────

export interface JsonImportResult {
  success: boolean;
  data: JsonExportData | null;
  error: string | null;
  version: string;
}

export function importMatchResultJson(
  jsonContent: string
): JsonImportResult {
  try {
    const parsed = JSON.parse(jsonContent);

    // Validate format
    if (parsed.metadata?.format !== 'ledgermatch-pro-v1') {
      return {
        success: false,
        data: null,
        error: 'Unrecognized file format. Expected ledgermatch-pro-v1.',
        version: '',
      };
    }

    // Basic structure validation
    if (!parsed.summary || !parsed.matchGroups) {
      return {
        success: false,
        data: null,
        error: 'Invalid file structure: missing summary or matchGroups.',
        version: parsed.metadata?.version ?? '',
      };
    }

    return {
      success: true,
      data: parsed as JsonExportData,
      error: null,
      version: parsed.metadata?.version ?? '1.0.0',
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Failed to parse JSON: ${err instanceof Error ? err.message : 'Unknown error'}`,
      version: '',
    };
  }
}

// ─── Download trigger ────────────────────────────────────────

export function downloadJson(
  content: string,
  filename: string
): void {
  const blob = new Blob([content], {
    type: 'application/json;charset=utf-8',
  });
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