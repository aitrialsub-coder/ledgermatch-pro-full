/**
 * Date Parser — Deterministic date extraction and normalization
 * 
 * Supports 15+ date format variants commonly found in bank statements
 * and ledgers worldwide. Outputs ISO 8601 (YYYY-MM-DD).
 * 
 * No external dependencies — pure regex + manual parsing.
 */

export interface DateParseResult {
  iso: string;           // "2024-01-15"
  year: number;
  month: number;         // 1-12
  day: number;           // 1-31
  format: string;        // detected format label
  confidence: number;    // 0-1
  original: string;      // raw input
}

// ─── Month name mappings ──────────────────────────────────────
const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

// ─── Format patterns (ordered by specificity) ─────────────────
interface DatePattern {
  regex: RegExp;
  format: string;
  extract: (match: RegExpMatchArray) => { day: number; month: number; year: number } | null;
}

const DATE_PATTERNS: DatePattern[] = [
  // ISO: 2024-01-15
  {
    regex: /(\d{4})-(\d{1,2})-(\d{1,2})/,
    format: 'YYYY-MM-DD',
    extract: (m) => ({
      year: parseInt(m[1]),
      month: parseInt(m[2]),
      day: parseInt(m[3]),
    }),
  },

  // ISO slash: 2024/01/15
  {
    regex: /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
    format: 'YYYY/MM/DD',
    extract: (m) => ({
      year: parseInt(m[1]),
      month: parseInt(m[2]),
      day: parseInt(m[3]),
    }),
  },

  // DD-Mon-YYYY: 15-Jan-2024
  {
    regex: /(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})/,
    format: 'DD-MMM-YYYY',
    extract: (m) => {
      const month = MONTH_NAMES[m[2].toLowerCase()];
      if (!month) return null;
      return {
        day: parseInt(m[1]),
        month,
        year: parseInt(m[3]),
      };
    },
  },

  // DD-Mon-YY: 15-Jan-24
  {
    regex: /(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2})(?!\d)/,
    format: 'DD-MMM-YY',
    extract: (m) => {
      const month = MONTH_NAMES[m[2].toLowerCase()];
      if (!month) return null;
      return {
        day: parseInt(m[1]),
        month,
        year: expandTwoDigitYear(parseInt(m[3])),
      };
    },
  },

  // Mon DD, YYYY: Jan 15, 2024  OR  January 15, 2024
  {
    regex: /([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/,
    format: 'MMM DD, YYYY',
    extract: (m) => {
      const month = MONTH_NAMES[m[1].toLowerCase()];
      if (!month) return null;
      return {
        day: parseInt(m[2]),
        month,
        year: parseInt(m[3]),
      };
    },
  },

  // DD Mon YYYY: 15 Jan 2024  OR  15 January 2024
  {
    regex: /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/,
    format: 'DD MMM YYYY',
    extract: (m) => {
      const month = MONTH_NAMES[m[2].toLowerCase()];
      if (!month) return null;
      return {
        day: parseInt(m[1]),
        month,
        year: parseInt(m[3]),
      };
    },
  },

  // DD/MM/YYYY: 15/01/2024  (tried BEFORE MM/DD/YYYY — preference configurable)
  {
    regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    format: 'DD/MM/YYYY',
    extract: (m) => ({
      day: parseInt(m[1]),
      month: parseInt(m[2]),
      year: parseInt(m[3]),
    }),
  },

  // DD-MM-YYYY: 15-01-2024
  {
    regex: /(\d{1,2})-(\d{1,2})-(\d{4})/,
    format: 'DD-MM-YYYY',
    extract: (m) => ({
      day: parseInt(m[1]),
      month: parseInt(m[2]),
      year: parseInt(m[3]),
    }),
  },

  // DD.MM.YYYY: 15.01.2024 (European)
  {
    regex: /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
    format: 'DD.MM.YYYY',
    extract: (m) => ({
      day: parseInt(m[1]),
      month: parseInt(m[2]),
      year: parseInt(m[3]),
    }),
  },

  // DD/MM/YY: 15/01/24
  {
    regex: /(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d)/,
    format: 'DD/MM/YY',
    extract: (m) => ({
      day: parseInt(m[1]),
      month: parseInt(m[2]),
      year: expandTwoDigitYear(parseInt(m[3])),
    }),
  },

  // DD-MM-YY: 15-01-24
  {
    regex: /(\d{1,2})-(\d{1,2})-(\d{2})(?!\d)/,
    format: 'DD-MM-YY',
    extract: (m) => ({
      day: parseInt(m[1]),
      month: parseInt(m[2]),
      year: expandTwoDigitYear(parseInt(m[3])),
    }),
  },

  // MM/DD/YYYY (US): differentiated from DD/MM/YYYY via context
  // This is a fallback — only used when explicitly configured
  {
    regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    format: 'MM/DD/YYYY',
    extract: (m) => ({
      month: parseInt(m[1]),
      day: parseInt(m[2]),
      year: parseInt(m[3]),
    }),
  },

  // YYYYMMDD (compact): 20240115
  {
    regex: /(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/,
    format: 'YYYYMMDD',
    extract: (m) => ({
      year: parseInt(m[1]),
      month: parseInt(m[2]),
      day: parseInt(m[3]),
    }),
  },
];

// ─── Two-digit year expansion ─────────────────────────────────
function expandTwoDigitYear(twoDigit: number): number {
  // 00-49 → 2000-2049, 50-99 → 1950-1999
  return twoDigit < 50 ? 2000 + twoDigit : 1900 + twoDigit;
}

// ─── Validation ──────────────────────────────────────────────
function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;

  // Days in month
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Leap year
  if (month === 2) {
    const isLeap =
      (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (day > (isLeap ? 29 : 28)) return false;
  } else {
    if (day > daysInMonth[month]) return false;
  }

  return true;
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Main parse function ─────────────────────────────────────
export function parseDate(
  raw: string,
  preferredFormat?: string
): DateParseResult | null {
  if (!raw || raw.trim().length === 0) return null;

  const trimmed = raw.trim();

  // If a preferred format is specified, try it first
  if (preferredFormat) {
    const preferredPatterns = DATE_PATTERNS.filter(
      (p) => p.format === preferredFormat
    );
    for (const pattern of preferredPatterns) {
      const result = tryPattern(trimmed, pattern);
      if (result) return result;
    }
  }

  // Try all patterns in order
  for (const pattern of DATE_PATTERNS) {
    const result = tryPattern(trimmed, pattern);
    if (result) return result;
  }

  return null;
}

function tryPattern(
  input: string,
  pattern: DatePattern
): DateParseResult | null {
  const match = input.match(pattern.regex);
  if (!match) return null;

  const extracted = pattern.extract(match);
  if (!extracted) return null;

  const { year, month, day } = extracted;

  if (!isValidDate(year, month, day)) return null;

  return {
    iso: toIso(year, month, day),
    year,
    month,
    day,
    format: pattern.format,
    confidence: 0.9,
    original: input,
  };
}

// ─── Auto-detect date format from multiple samples ────────────
export interface DateFormatDetection {
  format: string;
  confidence: number;
  sampleCount: number;
  ambiguous: boolean;
  possibleFormats: string[];
}

export function detectDateFormat(
  samples: string[]
): DateFormatDetection {
  const formatCounts: Record<string, number> = {};
  const validSamples: string[] = [];

  for (const sample of samples) {
    const trimmed = sample.trim();
    if (!trimmed) continue;

    for (const pattern of DATE_PATTERNS) {
      const match = trimmed.match(pattern.regex);
      if (match) {
        const extracted = pattern.extract(match);
        if (extracted && isValidDate(extracted.year, extracted.month, extracted.day)) {
          formatCounts[pattern.format] = (formatCounts[pattern.format] || 0) + 1;
          validSamples.push(trimmed);
          break;
        }
      }
    }
  }

  const entries = Object.entries(formatCounts).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return {
      format: 'DD/MM/YYYY',
      confidence: 0,
      sampleCount: 0,
      ambiguous: true,
      possibleFormats: [],
    };
  }

  const topFormat = entries[0][0];
  const topCount = entries[0][1];
  const totalValid = validSamples.length;

  // Check DD/MM vs MM/DD ambiguity
  const isAmbiguous = checkDdMmAmbiguity(validSamples);

  return {
    format: topFormat,
    confidence: totalValid > 0 ? topCount / totalValid : 0,
    sampleCount: totalValid,
    ambiguous: isAmbiguous,
    possibleFormats: entries.map((e) => e[0]),
  };
}

/**
 * Detect DD/MM vs MM/DD ambiguity
 * If all day values <= 12 and all month values <= 12, it's ambiguous
 */
function checkDdMmAmbiguity(samples: string[]): boolean {
  let hasValueOver12InFirst = false;
  let hasValueOver12InSecond = false;

  for (const sample of samples) {
    const match = sample.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (match) {
      const first = parseInt(match[1]);
      const second = parseInt(match[2]);

      if (first > 12) hasValueOver12InFirst = true;
      if (second > 12) hasValueOver12InSecond = true;
    }
  }

  // If first position has values > 12, it MUST be day (DD/MM)
  // If second position has values > 12, it MUST be day (MM/DD)
  // If neither exceeds 12, it's truly ambiguous
  return !hasValueOver12InFirst && !hasValueOver12InSecond;
}

// ─── Date difference in days ──────────────────────────────────
export function dayDifference(isoA: string, isoB: string): number {
  const dateA = new Date(isoA + 'T00:00:00Z');
  const dateB = new Date(isoB + 'T00:00:00Z');
  const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// ─── Date range check ─────────────────────────────────────────
export function isWithinDateWindow(
  isoA: string,
  isoB: string,
  windowDays: number
): boolean {
  return dayDifference(isoA, isoB) <= windowDays;
}

// ─── Normalize date string for hashing ────────────────────────
export function normalizeDateForHash(iso: string | null): string {
  if (!iso) return '0000-00-00';
  return iso;
}