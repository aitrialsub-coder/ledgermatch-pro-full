/**
 * Number Format Detector
 * 
 * Automatically detects whether numbers use US (1,234.56),
 * EU (1.234,56), or Indian (1,23,456.78) formatting.
 * 
 * Scans a batch of raw amount strings and votes on the format.
 */

import type { NumberFormat, NumberFormatConfig } from '@/types';

export interface FormatDetectionResult {
  format: NumberFormat;
  confidence: number;       // 0-1
  config: NumberFormatConfig;
  sampleSize: number;
  ambiguousCount: number;
}

// ─── Scoring weights ──────────────────────────────────────────
const DEFINITE_WEIGHT = 10;
const STRONG_WEIGHT = 5;
const WEAK_WEIGHT = 2;

export function detectNumberFormat(
  rawAmounts: string[]
): FormatDetectionResult {
  let usScore = 0;
  let euScore = 0;
  let inScore = 0;
  let ambiguousCount = 0;
  let analyzed = 0;

  for (const raw of rawAmounts) {
    const cleaned = raw.replace(/[$£€₹¥₩R\s]/g, '').trim();
    if (!cleaned || !/\d/.test(cleaned)) continue;

    analyzed++;
    const result = analyzeNumberString(cleaned);

    usScore += result.us;
    euScore += result.eu;
    inScore += result.in;
    if (result.ambiguous) ambiguousCount++;
  }

  // Determine winner
  const maxScore = Math.max(usScore, euScore, inScore);
  const totalScore = usScore + euScore + inScore;

  let format: NumberFormat;
  let config: NumberFormatConfig;

  if (totalScore === 0 || maxScore === 0) {
    format = 'AMBIGUOUS';
    config = getFormatConfig('US'); // default
  } else if (usScore >= euScore * 2 && usScore >= inScore * 2) {
    format = 'US';
    config = getFormatConfig('US');
  } else if (euScore >= usScore * 2 && euScore >= inScore * 2) {
    format = 'EU';
    config = getFormatConfig('EU');
  } else if (inScore >= usScore * 2 && inScore >= euScore * 2) {
    format = 'IN';
    config = getFormatConfig('IN');
  } else {
    format = 'AMBIGUOUS';
    // Default to US if close
    config = getFormatConfig(usScore >= euScore ? 'US' : 'EU');
  }

  const confidence =
    totalScore > 0 ? maxScore / totalScore : 0;

  return {
    format,
    confidence,
    config,
    sampleSize: analyzed,
    ambiguousCount,
  };
}

// ─── Analyze a single number string ──────────────────────────
function analyzeNumberString(s: string): {
  us: number;
  eu: number;
  in: number;
  ambiguous: boolean;
} {
  let us = 0;
  let eu = 0;
  let ind = 0;
  let ambiguous = false;

  // ── Definite patterns ──

  // comma then 3 digits then period: "1,234.56" → definite US
  if (/,\d{3}\./.test(s)) {
    us += DEFINITE_WEIGHT;
  }

  // period then 3 digits then comma: "1.234,56" → definite EU
  if (/\.\d{3},/.test(s)) {
    eu += DEFINITE_WEIGHT;
  }

  // Indian grouping: "1,23,456" or "12,34,567"
  if (/\d{1,2},\d{2},\d{3}/.test(s)) {
    ind += DEFINITE_WEIGHT;
  }

  // ── Strong patterns ──

  // Ends with .DD → likely US decimal
  if (/\.\d{2}$/.test(s) && !/,/.test(s.slice(-6))) {
    us += STRONG_WEIGHT;
  }

  // Ends with ,DD → likely EU decimal
  if (/,\d{2}$/.test(s) && !/\./.test(s.slice(-6))) {
    eu += STRONG_WEIGHT;
  }

  // Comma followed by exactly 3 digits at end (no decimal): "1,234" → US thousand
  if (/,\d{3}$/.test(s) && !/\./.test(s)) {
    us += WEAK_WEIGHT;
  }

  // Period followed by exactly 3 digits at end (no comma): "1.234" → EU thousand
  if (/\.\d{3}$/.test(s) && !/,/.test(s)) {
    eu += WEAK_WEIGHT;
  }

  // ── Weak / ambiguous ──

  // "1,234" or "1.234" with no other separators — ambiguous
  if (
    (/^\d{1,3},\d{3}$/.test(s) || /^\d{1,3}\.\d{3}$/.test(s)) &&
    us === 0 && eu === 0
  ) {
    ambiguous = true;
  }

  // No separators at all: "1234" or "1234.56" → assume US
  if (!/[,.]/.test(s.replace(/\.\d{1,2}$/, ''))) {
    us += 1; // very weak signal
  }

  return { us, eu, in: ind, ambiguous };
}

// ─── Format configurations ───────────────────────────────────
function getFormatConfig(format: 'US' | 'EU' | 'IN'): NumberFormatConfig {
  switch (format) {
    case 'US':
      return {
        format: 'US',
        thousandSeparator: ',',
        decimalSeparator: '.',
        currencySymbol: '$',
        currencyPosition: 'prefix',
      };
    case 'EU':
      return {
        format: 'EU',
        thousandSeparator: '.',
        decimalSeparator: ',',
        currencySymbol: '€',
        currencyPosition: 'prefix',
      };
    case 'IN':
      return {
        format: 'IN',
        thousandSeparator: ',',
        decimalSeparator: '.',
        currencySymbol: '₹',
        currencyPosition: 'prefix',
      };
  }
}

// ─── Detect currency symbol from raw strings ──────────────────
export function detectCurrencySymbol(rawAmounts: string[]): string {
  const symbolCounts: Record<string, number> = {};
  const symbols = ['$', '£', '€', '₹', '¥', '₩', 'R$', 'CHF', 'kr'];

  for (const raw of rawAmounts) {
    for (const symbol of symbols) {
      if (raw.includes(symbol)) {
        symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
      }
    }
  }

  const entries = Object.entries(symbolCounts).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? entries[0][0] : '$';
}