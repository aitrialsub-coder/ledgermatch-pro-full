/**
 * Amount Parser — Extracts numeric amounts from OCR text
 * 
 * Handles:
 * - Currency symbols: $, £, €, ₹, ¥
 * - Thousand separators (US, EU, Indian)
 * - Decimal separators (. or ,)
 * - Negative notation: (5,000.00), -5000, 5000 DR, 5000-
 * - CR/DR suffixes
 * - Mixed formats within same document
 */

import type { NumberFormatConfig, NumberFormat } from '@/types';

export interface AmountParseResult {
  value: number;           // parsed numeric value
  cents: number;           // value * 100, rounded
  isNegative: boolean;     // was marked as debit/negative
  isCredit: boolean;       // was marked as credit
  original: string;        // raw input
  confidence: number;      // 0-1
}

// ─── Currency symbols to strip ────────────────────────────────
const CURRENCY_REGEX = /[$£€₹¥₩]/g;
const CURRENCY_WORD_REGEX = /\b(USD|EUR|GBP|INR|JPY|CHF|CAD|AUD)\b/gi;

// ─── CR/DR detection ─────────────────────────────────────────
const CR_PATTERN = /\s*(CR|Cr|cr|CREDIT|Credit)\s*$/;
const DR_PATTERN = /\s*(DR|Dr|dr|DEBIT|Debit)\s*$/;

// ─── Negative patterns ──────────────────────────────────────
const PARENTHETICAL_PATTERN = /^\((.+)\)$/;
const LEADING_MINUS_PATTERN = /^-\s*/;
const TRAILING_MINUS_PATTERN = /\s*-$/;

/**
 * Parse an amount string into a number
 */
export function parseAmount(
  raw: string,
  formatConfig?: NumberFormatConfig
): AmountParseResult | null {
  if (!raw || raw.trim().length === 0) return null;

  let text = raw.trim();
  let isNegative = false;
  let isCredit = false;

  // ── Step 1: Detect CR/DR indicator ──
  if (CR_PATTERN.test(text)) {
    isCredit = true;
    text = text.replace(CR_PATTERN, '');
  } else if (DR_PATTERN.test(text)) {
    isNegative = true;
    text = text.replace(DR_PATTERN, '');
  }

  // ── Step 2: Strip currency symbols ──
  text = text.replace(CURRENCY_REGEX, '').replace(CURRENCY_WORD_REGEX, '').trim();

  // ── Step 3: Detect parenthetical negative ──
  const parenMatch = text.match(PARENTHETICAL_PATTERN);
  if (parenMatch) {
    isNegative = true;
    text = parenMatch[1];
  }

  // ── Step 4: Detect leading/trailing minus ──
  if (LEADING_MINUS_PATTERN.test(text)) {
    isNegative = true;
    text = text.replace(LEADING_MINUS_PATTERN, '');
  } else if (TRAILING_MINUS_PATTERN.test(text)) {
    isNegative = true;
    text = text.replace(TRAILING_MINUS_PATTERN, '');
  }

  // ── Step 5: Remove whitespace ──
  text = text.replace(/\s/g, '');

  // ── Step 6: Validate — must have at least one digit ──
  if (!/\d/.test(text)) return null;

  // ── Step 7: Parse based on format ──
  const format = formatConfig?.format ?? autoDetectSingleFormat(text);
  const numericValue = parseByFormat(text, format);

  if (numericValue === null || !isFinite(numericValue)) return null;

  const finalValue = isNegative ? -Math.abs(numericValue) : Math.abs(numericValue);

  return {
    value: finalValue,
    cents: Math.round(finalValue * 100),
    isNegative,
    isCredit,
    original: raw,
    confidence: computeConfidence(raw, numericValue),
  };
}

// ─── Parse number by detected format ─────────────────────────
function parseByFormat(text: string, format: NumberFormat): number | null {
  let cleaned: string;

  switch (format) {
    case 'US':
    case 'IN':
      // thousand sep = comma, decimal = period
      // Remove commas: "1,234,567.89" → "1234567.89"
      cleaned = text.replace(/,/g, '');
      break;

    case 'EU':
      // thousand sep = period, decimal = comma
      // Remove period thousands: "1.234.567,89" → "1234567,89"
      // Then replace comma decimal with period: "1234567,89" → "1234567.89"
      cleaned = text.replace(/\./g, '').replace(',', '.');
      break;

    case 'AMBIGUOUS':
    default:
      cleaned = resolveAmbiguous(text);
      break;
  }

  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

// ─── Resolve ambiguous single number ─────────────────────────
function resolveAmbiguous(text: string): string {
  // "1,234" — could be 1234 (US) or 1.234 (EU meaning 1234)
  // "1.234" — could be 1.234 (US decimal) or 1234 (EU thousand)

  // Count separators
  const commas = (text.match(/,/g) || []).length;
  const periods = (text.match(/\./g) || []).length;

  if (commas === 0 && periods === 0) {
    // No separators: "12345" → 12345
    return text;
  }

  if (commas === 0 && periods === 1) {
    // "1234.56" or "1.234"
    const afterPeriod = text.split('.')[1];
    if (afterPeriod.length === 3 && !text.includes(',')) {
      // "1.234" — ambiguous but likely thousand sep in EU
      // Default to US interpretation: 1.234 (decimal)
      return text;
    }
    // "1234.56" — clearly a decimal
    return text;
  }

  if (commas === 1 && periods === 0) {
    // "1,234" or "1,23"
    const afterComma = text.split(',')[1];
    if (afterComma.length === 3) {
      // "1,234" — likely US thousand: 1234
      return text.replace(',', '');
    }
    if (afterComma.length <= 2) {
      // "1,23" — likely EU decimal: 1.23
      return text.replace(',', '.');
    }
    return text.replace(',', '');
  }

  if (commas >= 1 && periods === 1) {
    // Has both: determine which is thousand, which is decimal
    const lastCommaIdx = text.lastIndexOf(',');
    const lastPeriodIdx = text.lastIndexOf('.');

    if (lastPeriodIdx > lastCommaIdx) {
      // "1,234.56" → US format
      return text.replace(/,/g, '');
    } else {
      // "1.234,56" → EU format
      return text.replace(/\./g, '').replace(',', '.');
    }
  }

  if (periods >= 1 && commas === 1) {
    const lastCommaIdx = text.lastIndexOf(',');
    const lastPeriodIdx = text.lastIndexOf('.');

    if (lastCommaIdx > lastPeriodIdx) {
      // "1.234,56" → EU
      return text.replace(/\./g, '').replace(',', '.');
    } else {
      // "1,234.56" → US
      return text.replace(/,/g, '');
    }
  }

  if (commas > 1 && periods === 0) {
    // "1,234,567" — definitely US thousands
    return text.replace(/,/g, '');
  }

  if (periods > 1 && commas === 0) {
    // "1.234.567" — definitely EU thousands
    return text.replace(/\./g, '');
  }

  // Fallback: try stripping all non-numeric except last period
  const parts = text.split('.');
  if (parts.length > 1) {
    const lastPart = parts.pop()!;
    return parts.join('').replace(/[^0-9]/g, '') + '.' + lastPart;
  }

  return text.replace(/[^0-9.-]/g, '');
}

// ─── Auto-detect format for a single number ──────────────────
function autoDetectSingleFormat(text: string): NumberFormat {
  // Definite patterns
  if (/,\d{3}\./.test(text)) return 'US';
  if (/\.\d{3},/.test(text)) return 'EU';
  if (/\d{1,2},\d{2},\d{3}/.test(text)) return 'IN';

  // Weak patterns
  if (/\.\d{2}$/.test(text)) return 'US';
  if (/,\d{2}$/.test(text)) return 'EU';

  return 'AMBIGUOUS';
}

// ─── Confidence scoring ──────────────────────────────────────
function computeConfidence(raw: string, parsed: number): number {
  let confidence = 0.9;

  // Lower confidence for ambiguous formats
  if (/^\d{1,3}[.,]\d{3}$/.test(raw.replace(/[$£€₹\s]/g, ''))) {
    confidence -= 0.2; // e.g., "1,234" or "1.234"
  }

  // Lower confidence for very large numbers (possible OCR error)
  if (Math.abs(parsed) > 10_000_000) {
    confidence -= 0.1;
  }

  // Lower confidence for zero
  if (parsed === 0) {
    confidence -= 0.1;
  }

  return Math.max(0.3, confidence);
}

// ─── Batch amount extraction ─────────────────────────────────
/**
 * Extract all amounts from a line of text.
 * Returns all number-like substrings parsed as amounts.
 */
export function extractAmountsFromText(
  text: string,
  formatConfig?: NumberFormatConfig
): AmountParseResult[] {
  const results: AmountParseResult[] = [];

  // Match number-like patterns including currency symbols
  const pattern =
    /[$£€₹¥]?\s*-?\(?\d[\d,. ]*\d\)?(?:\s*(?:CR|DR|Cr|Dr))?/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const parsed = parseAmount(match[0], formatConfig);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}

// ─── Format amount for display ───────────────────────────────
export function formatAmountDisplay(
  value: number,
  config?: NumberFormatConfig
): string {
  const absValue = Math.abs(value);
  const symbol = config?.currencySymbol ?? '$';
  const isPrefix = config?.currencyPosition !== 'suffix';

  let formatted: string;

  if (config?.format === 'EU') {
    formatted = absValue
      .toFixed(2)
      .replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  } else if (config?.format === 'IN') {
    formatted = formatIndian(absValue);
  } else {
    formatted = absValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  const sign = value < 0 ? '-' : '';
  return isPrefix
    ? `${sign}${symbol}${formatted}`
    : `${sign}${formatted} ${symbol}`;
}

function formatIndian(value: number): string {
  const [intPart, decPart] = value.toFixed(2).split('.');
  const lastThree = intPart.slice(-3);
  const otherDigits = intPart.slice(0, -3);

  const formatted = otherDigits
    ? otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree;

  return formatted + '.' + decPart;
}