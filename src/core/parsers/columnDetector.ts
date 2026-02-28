/**
 * Column Detector — Identifies column types from OCR'd table data
 * 
 * Uses header keyword matching + positional heuristics + content analysis
 * to determine which columns contain dates, descriptions, debits, credits, etc.
 */

import type {
  ColumnMap,
  ColumnMapping,
  ColumnType,
  AmountStyle,
  OcrLine,
  OcrWord,
} from '@/types';
import { HEADER_KEYWORDS } from '@/constants';
import { parseDate } from './dateParser';
import { parseAmount } from './amountParser';

export interface ColumnDetectionResult {
  columnMap: ColumnMap;
  confidence: number;
  headerRowIndex: number;
  method: 'header_keywords' | 'content_analysis' | 'positional_fallback';
  warnings: string[];
}

// ─── Main detection function ─────────────────────────────────
export function detectColumns(
  lines: OcrLine[],
  pageWidth: number
): ColumnDetectionResult {
  const warnings: string[] = [];

  // ── Strategy 1: Header keyword detection ──
  const headerResult = detectByHeaders(lines);
  if (headerResult && headerResult.confidence > 0.7) {
    return {
      columnMap: headerResult.columnMap,
      confidence: headerResult.confidence,
      headerRowIndex: headerResult.headerRowIndex,
      method: 'header_keywords',
      warnings,
    };
  }

  // ── Strategy 2: Content-based analysis ──
  const contentResult = detectByContent(lines, pageWidth);
  if (contentResult && contentResult.confidence > 0.5) {
    if (headerResult && headerResult.confidence > 0.3) {
      warnings.push(
        'Header detection was low confidence; using content analysis as primary.'
      );
    }
    return {
      columnMap: contentResult.columnMap,
      confidence: contentResult.confidence,
      headerRowIndex: contentResult.headerRowIndex,
      method: 'content_analysis',
      warnings,
    };
  }

  // ── Strategy 3: Positional fallback ──
  warnings.push(
    'Could not detect columns from headers or content. Using positional defaults.'
  );
  const fallbackMap = buildPositionalFallback(lines, pageWidth);
  return {
    columnMap: fallbackMap,
    confidence: 0.3,
    headerRowIndex: -1,
    method: 'positional_fallback',
    warnings,
  };
}

// ─── Strategy 1: Header keyword matching ─────────────────────
interface HeaderDetectionResult {
  columnMap: ColumnMap;
  confidence: number;
  headerRowIndex: number;
}

function detectByHeaders(lines: OcrLine[]): HeaderDetectionResult | null {
  // Search first 10 lines for a header row
  const searchLimit = Math.min(lines.length, 10);

  for (let i = 0; i < searchLimit; i++) {
    const line = lines[i];
    const lineText = line.text.toLowerCase();

    // Must contain at least 2 header keywords
    let keywordMatches = 0;
    const columnTypes: Array<{ type: ColumnType; word: OcrWord }> = [];

    for (const word of line.words) {
      const wordLower = word.text.toLowerCase();
      const matched = matchHeaderKeyword(wordLower, lineText);
      if (matched) {
        keywordMatches++;
        columnTypes.push({ type: matched, word });
      }
    }

    if (keywordMatches >= 2) {
      // We found a header row
      const columns = buildColumnsFromHeader(columnTypes, line);
      const columnMap = assembleColumnMap(columns);

      return {
        columnMap,
        confidence: Math.min(0.95, 0.5 + keywordMatches * 0.15),
        headerRowIndex: i,
      };
    }
  }

  return null;
}

function matchHeaderKeyword(
  word: string,
  fullLine: string
): ColumnType | null {
  // Check each keyword category
  for (const [type, keywords] of Object.entries(HEADER_KEYWORDS)) {
    for (const keyword of keywords) {
      // Exact word match or contained in adjacent words
      if (word === keyword || fullLine.includes(keyword)) {
        return type as ColumnType;
      }
    }
  }
  return null;
}

function buildColumnsFromHeader(
  columnTypes: Array<{ type: ColumnType; word: OcrWord }>,
  headerLine: OcrLine
): ColumnMapping[] {
  // Sort by x position
  const sorted = [...columnTypes].sort((a, b) => a.word.bbox.x0 - b.word.bbox.x0);

  const columns: ColumnMapping[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const { type, word } = sorted[i];
    const nextX = i < sorted.length - 1 ? sorted[i + 1].word.bbox.x0 : 9999;

    columns.push({
      index: i,
      type,
      headerText: word.text,
      xStart: word.bbox.x0,
      xEnd: nextX - 1,
      confidence: word.confidence / 100,
    });
  }

  return columns;
}

// ─── Strategy 2: Content-based analysis ──────────────────────
function detectByContent(
  lines: OcrLine[],
  pageWidth: number
): HeaderDetectionResult | null {
  // Skip likely header rows (first 5) and analyze data rows
  const dataLines = lines.slice(3, Math.min(lines.length, 20));

  if (dataLines.length < 3) return null;

  // Divide page into zones based on word positions
  const zones = divideIntoZones(dataLines, pageWidth);

  if (zones.length < 3) return null;

  // Classify each zone by its content
  const classifiedZones = zones.map((zone) => ({
    ...zone,
    type: classifyZoneContent(zone),
  }));

  // Build column map from classified zones
  const columns: ColumnMapping[] = classifiedZones
    .filter((z) => z.type !== 'unknown')
    .map((z, i) => ({
      index: i,
      type: z.type,
      headerText: '',
      xStart: z.xStart,
      xEnd: z.xEnd,
      confidence: z.confidence,
    }));

  if (columns.length < 3) return null;

  const columnMap = assembleColumnMap(columns);
  const avgConfidence =
    columns.reduce((sum, c) => sum + c.confidence, 0) / columns.length;

  return {
    columnMap,
    confidence: avgConfidence,
    headerRowIndex: -1,
  };
}

interface Zone {
  xStart: number;
  xEnd: number;
  values: string[];
  confidence: number;
}

function divideIntoZones(lines: OcrLine[], pageWidth: number): Zone[] {
  // Collect all word x-positions to find column boundaries
  const allWords: Array<{ x: number; text: string }> = [];

  for (const line of lines) {
    for (const word of line.words) {
      allWords.push({ x: word.bbox.x0, text: word.text });
    }
  }

  if (allWords.length === 0) return [];

  // Sort by x position
  allWords.sort((a, b) => a.x - b.x);

  // Find gaps (clusters of x positions with gaps between them)
  const zones: Zone[] = [];
  let currentZone: { xStart: number; xEnd: number; values: string[] } = {
    xStart: allWords[0].x,
    xEnd: allWords[0].x,
    values: [allWords[0].text],
  };

  const gapThreshold = pageWidth * 0.05; // 5% of page width

  for (let i = 1; i < allWords.length; i++) {
    const gap = allWords[i].x - currentZone.xEnd;

    if (gap > gapThreshold) {
      zones.push({ ...currentZone, confidence: 0.5 });
      currentZone = {
        xStart: allWords[i].x,
        xEnd: allWords[i].x,
        values: [allWords[i].text],
      };
    } else {
      currentZone.xEnd = Math.max(currentZone.xEnd, allWords[i].x);
      currentZone.values.push(allWords[i].text);
    }
  }
  zones.push({ ...currentZone, confidence: 0.5 });

  return zones;
}

function classifyZoneContent(zone: Zone): ColumnType {
  const values = zone.values;
  let dateCount = 0;
  let numberCount = 0;
  let textCount = 0;

  for (const value of values) {
    if (parseDate(value)) {
      dateCount++;
    } else if (parseAmount(value)) {
      numberCount++;
    } else if (value.length > 3) {
      textCount++;
    }
  }

  const total = values.length;
  if (total === 0) return 'unknown';

  const dateRatio = dateCount / total;
  const numberRatio = numberCount / total;
  const textRatio = textCount / total;

  if (dateRatio > 0.5) {
    zone.confidence = dateRatio;
    return 'date';
  }
  if (textRatio > 0.5) {
    zone.confidence = textRatio;
    return 'description';
  }
  if (numberRatio > 0.5) {
    zone.confidence = numberRatio;
    return 'amount'; // will be refined to debit/credit later
  }

  return 'unknown';
}

// ─── Strategy 3: Positional fallback ─────────────────────────
function buildPositionalFallback(
  lines: OcrLine[],
  pageWidth: number
): ColumnMap {
  // Common layout: Date | Description | Debit | Credit | Balance
  // Proportions:   15%  | 35%          | 15%   | 15%    | 20%
  const breakpoints = [0.15, 0.50, 0.65, 0.80, 1.0];

  const columns: ColumnMapping[] = [
    {
      index: 0,
      type: 'date',
      headerText: 'Date',
      xStart: 0,
      xEnd: Math.round(pageWidth * breakpoints[0]),
      confidence: 0.3,
    },
    {
      index: 1,
      type: 'description',
      headerText: 'Description',
      xStart: Math.round(pageWidth * breakpoints[0]),
      xEnd: Math.round(pageWidth * breakpoints[1]),
      confidence: 0.3,
    },
    {
      index: 2,
      type: 'debit',
      headerText: 'Debit',
      xStart: Math.round(pageWidth * breakpoints[1]),
      xEnd: Math.round(pageWidth * breakpoints[2]),
      confidence: 0.3,
    },
    {
      index: 3,
      type: 'credit',
      headerText: 'Credit',
      xStart: Math.round(pageWidth * breakpoints[2]),
      xEnd: Math.round(pageWidth * breakpoints[3]),
      confidence: 0.3,
    },
    {
      index: 4,
      type: 'balance',
      headerText: 'Balance',
      xStart: Math.round(pageWidth * breakpoints[3]),
      xEnd: pageWidth,
      confidence: 0.3,
    },
  ];

  return assembleColumnMap(columns);
}

// ─── Assemble final ColumnMap ────────────────────────────────
function assembleColumnMap(columns: ColumnMapping[]): ColumnMap {
  const findIndex = (type: ColumnType): number => {
    const col = columns.find((c) => c.type === type);
    return col ? col.index : -1;
  };

  const debitIdx = findIndex('debit');
  const creditIdx = findIndex('credit');
  const amountIdx = findIndex('amount');

  let amountStyle: AmountStyle;
  if (debitIdx >= 0 && creditIdx >= 0) {
    amountStyle = 'separate_debit_credit';
  } else if (amountIdx >= 0) {
    amountStyle = 'single_signed';
  } else {
    amountStyle = 'separate_debit_credit';
  }

  return {
    columns,
    dateColumnIndex: findIndex('date'),
    descriptionColumnIndex: findIndex('description'),
    debitColumnIndex: debitIdx,
    creditColumnIndex: creditIdx,
    amountColumnIndex: amountIdx,
    balanceColumnIndex: findIndex('balance'),
    referenceColumnIndex: findIndex('reference'),
    amountStyle,
  };
}

// ─── Assign words to columns by x-position ───────────────────
export function assignWordsToColumns(
  words: OcrWord[],
  columnMap: ColumnMap
): Map<ColumnType, string> {
  const result = new Map<ColumnType, string>();

  for (const column of columnMap.columns) {
    const columnWords = words.filter((w) => {
      const wordCenter = (w.bbox.x0 + w.bbox.x1) / 2;
      return wordCenter >= column.xStart && wordCenter <= column.xEnd;
    });

    const text = columnWords.map((w) => w.text).join(' ').trim();
    if (text) {
      result.set(column.type, text);
    }
  }

  return result;
}