/**
 * Scoring Utilities — Shared helpers for all matching passes
 * 
 * Handles:
 * - Amount comparison with tolerance (percent, fixed, or both)
 * - Date comparison within window
 * - Polarity adjustment (same_sign, opposite_sign, absolute)
 * - Confidence score computation
 * - Human-readable match reason generation
 */

import type { MatchingConfig, PolarityMode, MatchType } from '@/types';
import type { LedgerEntry } from '@/types';
import { dayDifference } from '../parsers/dateParser';
import {
  MATCH_CONFIDENCE_EXACT,
  MATCH_CONFIDENCE_AMOUNT_DATE_HIGH,
  MATCH_CONFIDENCE_AMOUNT_DATE_LOW,
  MATCH_CONFIDENCE_FUZZY_HIGH,
  MATCH_CONFIDENCE_FUZZY_LOW,
  MATCH_CONFIDENCE_SPLIT,
} from '@/constants';

// ─── Amount comparison ───────────────────────────────────────

/**
 * Get the comparable amount value from an entry,
 * adjusted for polarity mode
 */
export function getComparableAmount(
  entry: LedgerEntry,
  polarityMode: PolarityMode
): number {
  switch (polarityMode) {
    case 'absolute':
      return Math.abs(entry.amount);
    case 'opposite_sign':
      return -entry.amount;
    case 'same_sign':
    case 'auto_detect':
    default:
      return entry.amount;
  }
}

/**
 * Check if two amounts are within tolerance
 */
export function amountsMatch(
  amountA: number,
  amountB: number,
  config: MatchingConfig
): { matches: boolean; difference: number; withinPercent: boolean; withinFixed: boolean } {
  const diff = Math.abs(amountA - amountB);

  let withinPercent = false;
  let withinFixed = false;

  // Percentage tolerance
  const baseAmount = Math.max(Math.abs(amountA), Math.abs(amountB));
  const percentTolerance = baseAmount * config.amountTolerancePercent;

  if (diff <= percentTolerance) {
    withinPercent = true;
  }

  // Fixed tolerance
  if (diff <= config.amountToleranceFixed) {
    withinFixed = true;
  }

  let matches = false;
  switch (config.amountToleranceMode) {
    case 'percent':
      matches = withinPercent;
      break;
    case 'fixed':
      matches = withinFixed;
      break;
    case 'both':
    default:
      // Either tolerance satisfied → match
      matches = withinPercent || withinFixed;
      break;
  }

  return { matches, difference: diff, withinPercent, withinFixed };
}

/**
 * Exact amount check (within ±0.01 for rounding)
 */
export function amountsExactMatch(amountA: number, amountB: number): boolean {
  return Math.abs(amountA - amountB) < 0.01;
}

// ─── Date comparison ─────────────────────────────────────────

/**
 * Check if two dates are within the tolerance window
 */
export function datesMatch(
  dateA: string | null,
  dateB: string | null,
  toleranceDays: number
): { matches: boolean; daysDiff: number } {
  if (!dateA || !dateB) {
    // If either date is missing, consider it a partial match
    return { matches: true, daysDiff: -1 };
  }

  const diff = dayDifference(dateA, dateB);
  return {
    matches: diff <= toleranceDays,
    daysDiff: diff,
  };
}

/**
 * Exact date check
 */
export function datesExactMatch(
  dateA: string | null,
  dateB: string | null
): boolean {
  if (!dateA || !dateB) return false;
  return dateA === dateB;
}

// ─── Reference number comparison ─────────────────────────────

/**
 * Normalize and compare reference numbers
 */
export function refsMatch(
  refA: string | null | undefined,
  refB: string | null | undefined,
  caseSensitive: boolean = false
): boolean {
  if (!refA || !refB) return false;

  const normA = normalizeRef(refA, caseSensitive);
  const normB = normalizeRef(refB, caseSensitive);

  if (normA.length === 0 || normB.length === 0) return false;

  return normA === normB;
}

function normalizeRef(ref: string, caseSensitive: boolean): string {
  let normalized = ref
    .replace(/[^a-zA-Z0-9]/g, '') // strip non-alphanumeric
    .trim();

  if (!caseSensitive) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

// ─── Confidence score computation ────────────────────────────

export interface ConfidenceFactors {
  dateMatch: boolean;
  dateDiff: number;          // days (-1 if unknown)
  amountExact: boolean;
  amountDiff: number;        // absolute difference
  amountBase: number;        // larger of the two amounts
  refMatch: boolean;
  descriptionSimilarity: number; // 0-1
  matchType: MatchType;
}

/**
 * Compute a confidence score (0-100) from match factors
 */
export function computeConfidence(factors: ConfidenceFactors): number {
  switch (factors.matchType) {
    case 'exact':
      return MATCH_CONFIDENCE_EXACT;

    case 'amount_date': {
      let score = MATCH_CONFIDENCE_AMOUNT_DATE_HIGH;

      // Penalize for date difference
      if (factors.dateDiff > 0) {
        score -= factors.dateDiff * 3; // -3 per day difference
      }

      // Penalize for amount difference
      if (!factors.amountExact && factors.amountBase > 0) {
        const pctDiff = factors.amountDiff / factors.amountBase;
        score -= pctDiff * 100; // proportional penalty
      }

      // Bonus for ref match
      if (factors.refMatch) {
        score += 5;
      }

      return clampConfidence(score);
    }

    case 'fuzzy': {
      let score = MATCH_CONFIDENCE_FUZZY_LOW;

      // Base on description similarity
      score += factors.descriptionSimilarity * 30;

      // Penalize for date difference
      if (factors.dateDiff > 0) {
        score -= factors.dateDiff * 2;
      }

      // Penalize for amount difference
      if (!factors.amountExact && factors.amountBase > 0) {
        const pctDiff = factors.amountDiff / factors.amountBase;
        score -= pctDiff * 50;
      }

      // Bonus for ref match
      if (factors.refMatch) {
        score += 10;
      }

      return clampConfidence(score);
    }

    case 'split':
      return MATCH_CONFIDENCE_SPLIT;

    case 'unmatched_a':
    case 'unmatched_b':
      return 0;

    case 'duplicate':
      return 0;

    default:
      return 0;
  }
}

function clampConfidence(score: number): number {
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ─── Match reason generation ─────────────────────────────────

/**
 * Generate a human-readable explanation of why two entries matched
 */
export function generateMatchReason(
  matchType: MatchType,
  factors: ConfidenceFactors,
  config: MatchingConfig,
  extras?: {
    splitCount?: number;
    splitTotal?: number;
    duplicateCount?: number;
  }
): string {
  switch (matchType) {
    case 'exact': {
      const parts = ['Exact match:'];
      parts.push('date identical');
      parts.push(`amount identical ($${factors.amountBase.toFixed(2)})`);
      if (factors.refMatch) {
        parts.push('reference number identical');
      }
      return parts.join(', ').replace(':,', ':');
    }

    case 'amount_date': {
      const parts = ['Amount + Date match:'];

      if (factors.amountExact) {
        parts.push(`amount identical ($${factors.amountBase.toFixed(2)})`);
      } else {
        parts.push(
          `amount within tolerance (±$${factors.amountDiff.toFixed(2)})`
        );
      }

      if (factors.dateDiff === 0) {
        parts.push('same date');
      } else if (factors.dateDiff > 0) {
        parts.push(`${factors.dateDiff} day${factors.dateDiff > 1 ? 's' : ''} apart`);
      } else {
        parts.push('date not compared');
      }

      if (factors.refMatch) {
        parts.push('reference number matches');
      }

      return parts.join(', ').replace(':,', ':');
    }

    case 'fuzzy': {
      const parts = ['Fuzzy match:'];
      parts.push(
        `description ${Math.round(factors.descriptionSimilarity * 100)}% similar`
      );

      if (factors.amountExact) {
        parts.push(`amount identical ($${factors.amountBase.toFixed(2)})`);
      } else {
        parts.push(
          `amount within tolerance (±$${factors.amountDiff.toFixed(2)})`
        );
      }

      if (factors.dateDiff >= 0) {
        parts.push(
          factors.dateDiff === 0
            ? 'same date'
            : `${factors.dateDiff} day${factors.dateDiff > 1 ? 's' : ''} apart`
        );
      }

      return parts.join(', ').replace(':,', ':');
    }

    case 'split': {
      const count = extras?.splitCount ?? 0;
      const total = extras?.splitTotal ?? 0;
      return (
        `Split transaction: 1 entry ($${factors.amountBase.toFixed(2)}) ` +
        `matches ${count} entries totaling $${total.toFixed(2)}`
      );
    }

    case 'unmatched_a':
      return (
        `Unmatched: no corresponding entry found in Ledger B ` +
        `within ±${config.dateToleranceDays} days and ` +
        `±${(config.amountTolerancePercent * 100).toFixed(1)}% amount tolerance`
      );

    case 'unmatched_b':
      return (
        `Unmatched: no corresponding entry found in Ledger A ` +
        `within ±${config.dateToleranceDays} days and ` +
        `±${(config.amountTolerancePercent * 100).toFixed(1)}% amount tolerance`
      );

    case 'duplicate': {
      const count = extras?.duplicateCount ?? 2;
      return `Duplicate: ${count} identical entries found on same ledger side`;
    }

    default:
      return 'Unknown match type';
  }
}

// ─── Polarity auto-detection ─────────────────────────────────

/**
 * Auto-detect whether ledgers use same or opposite sign conventions
 * by comparing the first N entries that have similar amounts
 */
export function autoDetectPolarity(
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  sampleSize: number = 20
): PolarityMode {
  let sameSignMatches = 0;
  let oppositeSignMatches = 0;

  const sampleA = entriesA.slice(0, sampleSize);

  for (const a of sampleA) {
    if (a.amountAbs < 0.01) continue;

    // Find entries in B with similar absolute amount
    const candidates = entriesB.filter(
      (b) => Math.abs(b.amountAbs - a.amountAbs) < a.amountAbs * 0.01
    );

    for (const b of candidates) {
      if (Math.sign(a.amount) === Math.sign(b.amount)) {
        sameSignMatches++;
      } else {
        oppositeSignMatches++;
      }
    }
  }

  if (sameSignMatches === 0 && oppositeSignMatches === 0) {
    return 'absolute'; // can't determine
  }

  if (oppositeSignMatches > sameSignMatches * 2) {
    return 'opposite_sign';
  } else if (sameSignMatches > oppositeSignMatches * 2) {
    return 'same_sign';
  }

  return 'absolute'; // ambiguous
}

// ─── Entry hash for deduplication ────────────────────────────

export function entryContentHash(entry: LedgerEntry): string {
  const parts = [
    entry.date ?? '',
    entry.amountCents.toString(),
    entry.description.toLowerCase().trim().substring(0, 50),
    entry.refNumber ?? '',
  ];
  return parts.join('|');
}