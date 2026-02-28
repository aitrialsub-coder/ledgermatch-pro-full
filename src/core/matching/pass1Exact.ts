/**
 * Pass 1 — Exact Hash Match
 * 
 * The fastest pass: O(n) using hash map lookup.
 * 
 * Creates a composite hash key from:
 *   normalize(date) + "|" + amount_cents + "|" + normalize(ref)
 * 
 * If both entries produce the same hash → exact match (confidence: 100)
 * 
 * Handles:
 * - Polarity mode (sign adjustment)
 * - Optional reference number (if both have one)
 * - Multiple entries with same hash (one-to-one matching)
 */

import type { LedgerEntry, MatchGroup, MatchingConfig } from '@/types';
import {
  getComparableAmount,
  datesExactMatch,
  amountsExactMatch,
  refsMatch,
  computeConfidence,
  generateMatchReason,
} from './scoringUtils';

export interface Pass1Result {
  matchGroups: MatchGroup[];
  unmatchedA: Set<string>;   // entry IDs not matched
  unmatchedB: Set<string>;
  timeMs: number;
  matchCount: number;
}

/**
 * Pass 1: Exact hash matching — O(n) complexity
 */
export function pass1ExactMatch(
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  config: MatchingConfig
): Pass1Result {
  const startTime = performance.now();
  const matchGroups: MatchGroup[] = [];

  // Track which entries are available (not yet matched)
  const availableA = new Set(entriesA.map((e) => e.id));
  const availableB = new Set(entriesB.map((e) => e.id));

  // Build hash index for ledger B
  const hashIndexB = buildHashIndex(entriesB, config);

  // For each entry in A, look for exact hash match in B
  for (const entryA of entriesA) {
    if (!availableA.has(entryA.id)) continue;

    const hashKey = createHashKey(entryA, config);
    const candidates = hashIndexB.get(hashKey);

    if (!candidates || candidates.length === 0) continue;

    // Find the first available candidate
    const matchedEntry = candidates.find((c) => availableB.has(c.id));
    if (!matchedEntry) continue;

    // Verify the match (belt and suspenders — hash collision protection)
    const verified = verifyExactMatch(entryA, matchedEntry, config);
    if (!verified) continue;

    // Create match group
    const factors = {
      dateMatch: true,
      dateDiff: 0,
      amountExact: true,
      amountDiff: 0,
      amountBase: Math.abs(entryA.amount),
      refMatch: refsMatch(entryA.refNumber, matchedEntry.refNumber, config.caseSensitiveRef),
      descriptionSimilarity: 0,
      matchType: 'exact' as const,
    };

    const matchGroup: MatchGroup = {
      id: crypto.randomUUID(),
      matchType: 'exact',
      confidence: computeConfidence(factors),
      matchReason: generateMatchReason('exact', factors, config),
      status: 'open',
      entriesA: [entryA.id],
      entriesB: [matchedEntry.id],
      amountDifference: 0,
      dateDifference: 0,
      descriptionSimilarity: 0,
      passNumber: 1,
      createdAt: Date.now(),
      comments: [],
    };

    matchGroups.push(matchGroup);

    // Mark as consumed
    availableA.delete(entryA.id);
    availableB.delete(matchedEntry.id);
  }

  return {
    matchGroups,
    unmatchedA: availableA,
    unmatchedB: availableB,
    timeMs: performance.now() - startTime,
    matchCount: matchGroups.length,
  };
}

// ─── Hash key creation ───────────────────────────────────────

function createHashKey(
  entry: LedgerEntry,
  config: MatchingConfig
): string {
  const dateNorm = entry.date ?? '0000-00-00';

  // Adjust amount for polarity
  const amount = getComparableAmount(entry, config.polarityMode);
  const amountCents = Math.round(Math.abs(amount) * 100);

  // Reference number (optional — only include if present)
  const refNorm = entry.refNumber
    ? entry.refNumber.toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';

  if (config.ignoreDescriptionInExact) {
    return `${dateNorm}|${amountCents}`;
  }

  if (refNorm.length > 0) {
    return `${dateNorm}|${amountCents}|${refNorm}`;
  }

  return `${dateNorm}|${amountCents}`;
}

// ─── Hash index builder ──────────────────────────────────────

function buildHashIndex(
  entries: LedgerEntry[],
  config: MatchingConfig
): Map<string, LedgerEntry[]> {
  const index = new Map<string, LedgerEntry[]>();

  for (const entry of entries) {
    const key = createHashKey(entry, config);

    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key)!.push(entry);
  }

  return index;
}

// ─── Verification (post hash match) ──────────────────────────

function verifyExactMatch(
  entryA: LedgerEntry,
  entryB: LedgerEntry,
  config: MatchingConfig
): boolean {
  // Date must match exactly
  if (!datesExactMatch(entryA.date, entryB.date)) return false;

  // Amount must match exactly (within ±0.01 for rounding)
  const amountA = Math.abs(getComparableAmount(entryA, config.polarityMode));
  const amountB = Math.abs(getComparableAmount(entryB, config.polarityMode));

  if (!amountsExactMatch(amountA, amountB)) return false;

  // If both have reference numbers, they must match
  if (entryA.refNumber && entryB.refNumber) {
    if (!refsMatch(entryA.refNumber, entryB.refNumber, config.caseSensitiveRef)) {
      return false;
    }
  }

  return true;
}