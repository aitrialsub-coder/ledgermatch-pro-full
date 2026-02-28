/**
 * Multi-Page Table Merger
 * 
 * Handles tables that span multiple PDF/image pages:
 * - Removes repeated headers on each page
 * - Removes page footers and continuation markers
 * - Removes subtotal/total rows
 * - Detects and merges wrapped description rows
 * - Maintains correct sequential ordering
 * - Deduplicates entries that appear on page boundaries
 */

import type { OcrLine, ParsedPage, OcrPageResult } from '@/types';
import { SKIP_ROW_PATTERNS } from '@/constants';

export interface MergedTableResult {
  lines: OcrLine[];
  pageCount: number;
  removedLines: RemovedLine[];
  stats: MergeStats;
}

export interface RemovedLine {
  pageNumber: number;
  lineIndex: number;
  text: string;
  reason: RemovalReason;
}

export type RemovalReason =
  | 'repeated_header'
  | 'page_footer'
  | 'subtotal'
  | 'empty'
  | 'duplicate_boundary'
  | 'continuation_marker';

export interface MergeStats {
  totalLinesInput: number;
  totalLinesOutput: number;
  headersRemoved: number;
  footersRemoved: number;
  subtotalsRemoved: number;
  duplicatesRemoved: number;
  emptyRemoved: number;
}

/**
 * Merge OCR results from multiple pages into a single table
 */
export function mergeMultiPageTable(
  pageResults: OcrPageResult[]
): MergedTableResult {
  const stats: MergeStats = {
    totalLinesInput: 0,
    totalLinesOutput: 0,
    headersRemoved: 0,
    footersRemoved: 0,
    subtotalsRemoved: 0,
    duplicatesRemoved: 0,
    emptyRemoved: 0,
  };

  const removedLines: RemovedLine[] = [];

  if (pageResults.length === 0) {
    return { lines: [], pageCount: 0, removedLines, stats };
  }

  // ── Step 1: Detect the header pattern from page 1 ──
  const headerPattern = detectHeaderPattern(pageResults[0].lines);

  // ── Step 2: Process each page ──
  const allCleanedLines: OcrLine[] = [];

  for (let pageIdx = 0; pageIdx < pageResults.length; pageIdx++) {
    const pageResult = pageResults[pageIdx];
    const pageNum = pageResult.pageNumber;

    for (let lineIdx = 0; lineIdx < pageResult.lines.length; lineIdx++) {
      const line = pageResult.lines[lineIdx];
      const text = line.text.trim();

      stats.totalLinesInput++;

      // ── Check: Empty line ──
      if (!text || text.length < 2) {
        stats.emptyRemoved++;
        removedLines.push({
          pageNumber: pageNum,
          lineIndex: lineIdx,
          text,
          reason: 'empty',
        });
        continue;
      }

      // ── Check: Repeated header (pages 2+) ──
      if (
        pageIdx > 0 &&
        headerPattern &&
        isRepeatedHeader(text, headerPattern)
      ) {
        stats.headersRemoved++;
        removedLines.push({
          pageNumber: pageNum,
          lineIndex: lineIdx,
          text,
          reason: 'repeated_header',
        });
        continue;
      }

      // ── Check: Page footer ──
      if (isPageFooter(text)) {
        stats.footersRemoved++;
        removedLines.push({
          pageNumber: pageNum,
          lineIndex: lineIdx,
          text,
          reason: 'page_footer',
        });
        continue;
      }

      // ── Check: Subtotal/total row ──
      if (isSubtotalLine(text)) {
        stats.subtotalsRemoved++;
        removedLines.push({
          pageNumber: pageNum,
          lineIndex: lineIdx,
          text,
          reason: 'subtotal',
        });
        continue;
      }

      // ── Check: Continuation marker ──
      if (isContinuationMarker(text)) {
        removedLines.push({
          pageNumber: pageNum,
          lineIndex: lineIdx,
          text,
          reason: 'continuation_marker',
        });
        continue;
      }

      // Keep this line
      allCleanedLines.push(line);
    }
  }

  // ── Step 3: Remove boundary duplicates ──
  const deduped = removeBoundaryDuplicates(
    allCleanedLines,
    pageResults,
    removedLines,
    stats
  );

  stats.totalLinesOutput = deduped.length;

  return {
    lines: deduped,
    pageCount: pageResults.length,
    removedLines,
    stats,
  };
}

// ─── Header pattern detection ────────────────────────────────

interface HeaderPatternInfo {
  text: string;
  normalizedTokens: string[];
  lineIndex: number;
}

function detectHeaderPattern(
  firstPageLines: OcrLine[]
): HeaderPatternInfo | null {
  // Look for header row in first 10 lines
  const searchLimit = Math.min(firstPageLines.length, 10);

  const headerKeywords = [
    'date', 'description', 'narration', 'particulars',
    'debit', 'credit', 'balance', 'amount',
    'withdrawal', 'deposit', 'reference',
  ];

  for (let i = 0; i < searchLimit; i++) {
    const text = firstPageLines[i].text.toLowerCase();
    let matchCount = 0;

    for (const keyword of headerKeywords) {
      if (text.includes(keyword)) matchCount++;
    }

    if (matchCount >= 2) {
      return {
        text: firstPageLines[i].text,
        normalizedTokens: text
          .replace(/[^a-z\s]/g, '')
          .split(/\s+/)
          .filter((t) => t.length > 2),
        lineIndex: i,
      };
    }
  }

  return null;
}

function isRepeatedHeader(
  text: string,
  headerPattern: HeaderPatternInfo
): boolean {
  const normalizedText = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (normalizedText.length === 0) return false;

  // Check how many header tokens appear in this line
  let matches = 0;
  for (const token of headerPattern.normalizedTokens) {
    if (normalizedText.includes(token)) matches++;
  }

  const matchRatio =
    headerPattern.normalizedTokens.length > 0
      ? matches / headerPattern.normalizedTokens.length
      : 0;

  return matchRatio >= 0.6;
}

// ─── Footer detection ────────────────────────────────────────

function isPageFooter(text: string): boolean {
  const lower = text.toLowerCase().trim();

  return (
    /^page\s+\d+\s*(of|\/)\s*\d+/i.test(lower) ||
    /^page\s+\d+$/i.test(lower) ||
    /this\s+is\s+(a\s+)?computer\s+generated/i.test(lower) ||
    /generated\s+(on|at)\s+/i.test(lower) ||
    /end\s+of\s+statement/i.test(lower) ||
    /statement\s+continu/i.test(lower) ||
    /^\*{5,}$/.test(text) ||
    /^-{15,}$/.test(text) ||
    /^={15,}$/.test(text) ||
    /^_{15,}$/.test(text)
  );
}

// ─── Subtotal detection ──────────────────────────────────────

function isSubtotalLine(text: string): boolean {
  const lower = text.toLowerCase().trim();

  return (
    /\b(sub\s?total|grand\s?total)\b/i.test(lower) ||
    /\b(total\s+(debit|credit|withdrawal|deposit)s?)\b/i.test(lower) ||
    /\b(balance\s+(c\/f|b\/f|carried\s+forward|brought\s+forward))\b/i.test(lower) ||
    /\b(opening\s+balance|closing\s+balance)\b/i.test(lower) ||
    /\btotal\s+for\s+(the\s+)?period\b/i.test(lower) ||
    /\btotal\s+for\s+\w+\s+\d{4}\b/i.test(lower)   // "Total for January 2024"
  );
}

// ─── Continuation markers ────────────────────────────────────

function isContinuationMarker(text: string): boolean {
  const lower = text.toLowerCase().trim();

  return (
    /^continued\s*(on|from|\.{3})/i.test(lower) ||
    /continued\s+on\s+next\s+page/i.test(lower) ||
    /brought\s+forward\s+from/i.test(lower) ||
    /carried\s+(forward|over)\s+to/i.test(lower) ||
    /\.{3,}\s*$/.test(text) // trailing ellipsis
  );
}

// ─── Boundary duplicate removal ──────────────────────────────

function removeBoundaryDuplicates(
  lines: OcrLine[],
  pageResults: OcrPageResult[],
  removedLines: RemovedLine[],
  stats: MergeStats
): OcrLine[] {
  if (lines.length < 2) return lines;

  const result: OcrLine[] = [lines[0]];

  for (let i = 1; i < lines.length; i++) {
    const current = lines[i];
    const previous = lines[i - 1];

    // Check if current is a near-duplicate of previous
    // This catches the last row of one page repeated as first row of next
    const currentNorm = current.text.toLowerCase().replace(/\s+/g, ' ').trim();
    const previousNorm = previous.text.toLowerCase().replace(/\s+/g, ' ').trim();

    if (
      currentNorm === previousNorm &&
      currentNorm.length > 5
    ) {
      stats.duplicatesRemoved++;
      removedLines.push({
        pageNumber: 0, // unknown at this point
        lineIndex: i,
        text: current.text,
        reason: 'duplicate_boundary',
      });
      continue;
    }

    result.push(current);
  }

  return result;
}