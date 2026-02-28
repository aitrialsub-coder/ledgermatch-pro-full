/**
 * Pass 2 — Amount + Date Window Match
 * 
 * For entries not caught by exact hash:
 * - Amount within configurable tolerance (percent or fixed)
 * - Date within configurable window (±N days)
 * 
 * Optimized with sorted amount index + binary search → O(n log n)
 * 
 * If exactly one candidate → auto-match
 * If multiple candidates → marked AMBIGUOUS for user resolution
 */

import type {
  LedgerEntry,
  MatchGroup,
  MatchingConfig,
  AmbiguousMatch,
  AmbiguousCandidate,
} from '@/types';
import {
  getComparableAmount,
  amountsMatch,
  datesMatch,
  refsMatch,
  computeConfidence,
  generateMatchReason,
} from './scoringUtils';
import { dayDifference } from '../parsers/dateParser';

export interface Pass2Result {
  matchGroups: MatchGroup[];
  ambiguousMatches: AmbiguousMatch[];
  unmatchedA: Set<string>;
  unmatchedB: Set<string>;
  timeMs: number;
  matchCount: number;
}

/**
 * Pass 2: Amount tolerance + date window matching
 */
export function pass2AmountDateMatch(
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  unmatchedAIds: Set<string>,
  unmatchedBIds: Set<string>,
  config: MatchingConfig
): Pass2Result {
  const startTime = performance.now();
  const matchGroups: MatchGroup[] = [];
  const ambiguousMatches: AmbiguousMatch[] = [];

  // Filter to only unmatched entries
  const unmatchedA = entriesA.filter((e) => unmatchedAIds.has(e.id));
  const unmatchedB = entriesB.filter((e) => unmatchedBIds.has(e.id));

  // Build sorted amount index for B (for binary search)
  const sortedB = buildSortedAmountIndex(unmatchedB, config);

  // Track which B entries are consumed
  const consumedB = new Set<string>();

  // Remaining unmatched
  const stillUnmatchedA = new Set(unmatchedAIds);
  const stillUnmatchedB = new Set(unmatchedBIds);

  for (const entryA of unmatchedA) {
    if (!stillUnmatchedA.has(entryA.id)) continue;

    const amountA = Math.abs(getComparableAmount(entryA, config.polarityMode));

    // Find candidates via binary search on sorted amounts
    const candidates = findAmountCandidates(
      amountA,
      sortedB,
      config,
      consumedB
    );

    // Further filter by date window
    const dateFilteredCandidates = candidates.filter((c) => {
      const dateResult = datesMatch(
        entryA.date,
        c.entry.date,
        config.dateToleranceDays
      );
      return dateResult.matches;
    });

    if (dateFilteredCandidates.length === 0) {
      continue; // no match found — pass to next pass
    }

    if (dateFilteredCandidates.length === 1) {
      // Single candidate → auto-match
      const matched = dateFilteredCandidates[0];
      const dateDiff = entryA.date && matched.entry.date
        ? dayDifference(entryA.date, matched.entry.date)
        : -1;

      const factors = {
        dateMatch: dateDiff <= config.dateToleranceDays,
        dateDiff,
        amountExact: matched.amountDiff < 0.01,
        amountDiff: matched.amountDiff,
        amountBase: Math.max(amountA, Math.abs(matched.comparableAmount)),
        refMatch: refsMatch(
          entryA.refNumber,
          matched.entry.refNumber,
          config.caseSensitiveRef
        ),
        descriptionSimilarity: 0,
        matchType: 'amount_date' as const,
      };

      const matchGroup: MatchGroup = {
        id: crypto.randomUUID(),
        matchType: 'amount_date',
        confidence: computeConfidence(factors),
        matchReason: generateMatchReason('amount_date', factors, config),
        status: 'open',
        entriesA: [entryA.id],
        entriesB: [matched.entry.id],
        amountDifference: matched.amountDiff,
        dateDifference: dateDiff,
        descriptionSimilarity: 0,
        passNumber: 2,
        createdAt: Date.now(),
        comments: [],
      };

      matchGroups.push(matchGroup);
      consumedB.add(matched.entry.id);
      stillUnmatchedA.delete(entryA.id);
      stillUnmatchedB.delete(matched.entry.id);
    } else {
      // Multiple candidates → AMBIGUOUS — user must resolve
      const ambiguous: AmbiguousMatch = {
        entryId: entryA.id,
        party: 'A',
        candidates: dateFilteredCandidates.map((c) => {
          const dateDiff = entryA.date && c.entry.date
            ? dayDifference(entryA.date, c.entry.date)
            : -1;

          const factors = {
            dateMatch: true,
            dateDiff,
            amountExact: c.amountDiff < 0.01,
            amountDiff: c.amountDiff,
            amountBase: Math.max(amountA, Math.abs(c.comparableAmount)),
            refMatch: refsMatch(
              entryA.refNumber,
              c.entry.refNumber,
              config.caseSensitiveRef
            ),
            descriptionSimilarity: 0,
            matchType: 'amount_date' as const,
          };

          return {
            entryId: c.entry.id,
            confidence: computeConfidence(factors),
            matchReason: generateMatchReason('amount_date', factors, config),
            amountDifference: c.amountDiff,
            dateDifference: dateDiff,
            descriptionSimilarity: 0,
          } satisfies AmbiguousCandidate;
        }),
      };

      ambiguousMatches.push(ambiguous);
    }
  }

  return {
    matchGroups,
    ambiguousMatches,
    unmatchedA: stillUnmatchedA,
    unmatchedB: stillUnmatchedB,
    timeMs: performance.now() - startTime,
    matchCount: matchGroups.length,
  };
}

// ─── Sorted amount index ─────────────────────────────────────

interface IndexedEntry {
  entry: LedgerEntry;
  comparableAmount: number;   // absolute, polarity-adjusted
  amountDiff: number;         // populated during search
}

function buildSortedAmountIndex(
  entries: LedgerEntry[],
  config: MatchingConfig
): IndexedEntry[] {
  return entries
    .map((entry) => ({
      entry,
      comparableAmount: Math.abs(
        getComparableAmount(entry, config.polarityMode)
      ),
      amountDiff: 0,
    }))
    .sort((a, b) => a.comparableAmount - b.comparableAmount);
}

/**
 * Binary search for amount candidates within tolerance
 */
function findAmountCandidates(
  targetAmount: number,
  sortedEntries: IndexedEntry[],
  config: MatchingConfig,
  consumed: Set<string>
): IndexedEntry[] {
  if (sortedEntries.length === 0) return [];

  // Calculate tolerance bounds
  const percentTol = targetAmount * config.amountTolerancePercent;
  const fixedTol = config.amountToleranceFixed;
  const maxTolerance = Math.max(percentTol, fixedTol);

  const lowerBound = targetAmount - maxTolerance;
  const upperBound = targetAmount + maxTolerance;

  // Binary search for lower bound position
  let lo = 0;
  let hi = sortedEntries.length - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedEntries[mid].comparableAmount < lowerBound) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Collect all entries in range
  const candidates: IndexedEntry[] = [];

  for (let i = lo; i < sortedEntries.length; i++) {
    const indexed = sortedEntries[i];

    if (indexed.comparableAmount > upperBound) break;

    if (consumed.has(indexed.entry.id)) continue;

    // Verify amount tolerance
    const amountCheck = amountsMatch(
      targetAmount,
      indexed.comparableAmount,
      config
    );

    if (amountCheck.matches) {
      candidates.push({
        ...indexed,
        amountDiff: amountCheck.difference,
      });
    }
  }

  return candidates;
}