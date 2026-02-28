/**
 * Pass 4 — Split Transaction Detection
 * 
 * Detects one-to-many matches:
 *   One entry on side A with amount X matches N entries on side B
 *   where sum(B entries) ≈ X (within tolerance)
 * 
 * Algorithm: Subset-sum with aggressive pruning
 * - Pre-filter candidates by amount (must be <= target)
 * - Sort candidates largest-first for faster convergence
 * - Cap at N=5 entries and 200ms time limit per search
 * - Cap candidate pool at 20 entries
 * 
 * Also runs in reverse: one B matches many A's
 */

import type {
  LedgerEntry,
  MatchGroup,
  MatchingConfig,
} from '@/types';
import {
  getComparableAmount,
  computeConfidence,
  generateMatchReason,
  datesMatch,
} from './scoringUtils';

export interface Pass4Result {
  matchGroups: MatchGroup[];
  unmatchedA: Set<string>;
  unmatchedB: Set<string>;
  timeMs: number;
  matchCount: number;
}

/**
 * Pass 4: Split transaction detection
 */
export function pass4SplitMatch(
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  unmatchedAIds: Set<string>,
  unmatchedBIds: Set<string>,
  config: MatchingConfig
): Pass4Result {
  const startTime = performance.now();
  const matchGroups: MatchGroup[] = [];

  const stillUnmatchedA = new Set(unmatchedAIds);
  const stillUnmatchedB = new Set(unmatchedBIds);

  const unmatchedA = entriesA.filter((e) => unmatchedAIds.has(e.id));
  const unmatchedB = entriesB.filter((e) => unmatchedBIds.has(e.id));

  // ── Direction 1: One A → Many B's ──
  const aToB = findSplitMatches(
    unmatchedA,
    unmatchedB,
    config,
    'A',
    stillUnmatchedA,
    stillUnmatchedB
  );
  matchGroups.push(...aToB);

  // ── Direction 2: One B → Many A's ──
  // Re-filter after direction 1 consumed some entries
  const remainingA = entriesA.filter((e) => stillUnmatchedA.has(e.id));
  const remainingB = entriesB.filter((e) => stillUnmatchedB.has(e.id));

  const bToA = findSplitMatches(
    remainingB,
    remainingA,
    config,
    'B',
    stillUnmatchedB,
    stillUnmatchedA
  );
  matchGroups.push(...bToA);

  return {
    matchGroups,
    unmatchedA: stillUnmatchedA,
    unmatchedB: stillUnmatchedB,
    timeMs: performance.now() - startTime,
    matchCount: matchGroups.length,
  };
}

// ─── Find split matches in one direction ─────────────────────

function findSplitMatches(
  singleEntries: LedgerEntry[],
  multiEntries: LedgerEntry[],
  config: MatchingConfig,
  singleSide: 'A' | 'B',
  unmatchedSingle: Set<string>,
  unmatchedMulti: Set<string>
): MatchGroup[] {
  const matchGroups: MatchGroup[] = [];

  for (const single of singleEntries) {
    if (!unmatchedSingle.has(single.id)) continue;

    const targetAmount = Math.abs(
      getComparableAmount(single, config.polarityMode)
    );

    // Skip very small amounts (not worth splitting)
    if (targetAmount < 1.0) continue;

    // Find viable candidates from multi side
    const candidates = multiEntries
      .filter((e) => {
        if (!unmatchedMulti.has(e.id)) return false;

        const entryAmount = Math.abs(
          getComparableAmount(e, config.polarityMode)
        );

        // Candidate must be smaller than target
        if (entryAmount > targetAmount + config.amountToleranceFixed) return false;

        // Candidate must be within date window
        const dateCheck = datesMatch(
          single.date,
          e.date,
          config.dateToleranceDays
        );
        return dateCheck.matches;
      })
      .map((e) => ({
        entry: e,
        amount: Math.abs(getComparableAmount(e, config.polarityMode)),
      }))
      .sort((a, b) => b.amount - a.amount); // largest first

    // Cap candidate pool
    const cappedCandidates = candidates.slice(0, 20);

    if (cappedCandidates.length < 2) continue; // need at least 2 for a split

    // Calculate tolerance for sum matching
    const tolerance = Math.max(
      config.amountToleranceFixed,
      targetAmount * config.amountTolerancePercent
    );

    // Run subset-sum search
    const result = subsetSumSearch(
      targetAmount,
      cappedCandidates,
      tolerance,
      config.splitMaxEntries,
      config.splitTimeLimitMs
    );

    if (!result) continue;

    // Found a split match!
    const matchedIds = result.map((r) => r.entry.id);
    const totalMatched = result.reduce((sum, r) => sum + r.amount, 0);

    const factors = {
      dateMatch: true,
      dateDiff: 0,
      amountExact: Math.abs(targetAmount - totalMatched) < 0.01,
      amountDiff: Math.abs(targetAmount - totalMatched),
      amountBase: targetAmount,
      refMatch: false,
      descriptionSimilarity: 0,
      matchType: 'split' as const,
    };

    const matchGroup: MatchGroup = {
      id: crypto.randomUUID(),
      matchType: 'split',
      confidence: computeConfidence(factors),
      matchReason: generateMatchReason('split', factors, config, {
        splitCount: result.length,
        splitTotal: totalMatched,
      }),
      status: 'open',
      entriesA: singleSide === 'A' ? [single.id] : matchedIds,
      entriesB: singleSide === 'B' ? [single.id] : matchedIds,
      amountDifference: Math.abs(targetAmount - totalMatched),
      dateDifference: 0,
      descriptionSimilarity: 0,
      passNumber: 4,
      createdAt: Date.now(),
      comments: [],
    };

    matchGroups.push(matchGroup);

    // Consume all matched entries
    unmatchedSingle.delete(single.id);
    for (const id of matchedIds) {
      unmatchedMulti.delete(id);
    }
  }

  return matchGroups;
}

// ─── Subset-sum search with pruning and time limit ───────────

interface CandidateWithAmount {
  entry: LedgerEntry;
  amount: number;
}

function subsetSumSearch(
  target: number,
  candidates: CandidateWithAmount[],
  tolerance: number,
  maxEntries: number,
  timeLimitMs: number
): CandidateWithAmount[] | null {
  const startTime = performance.now();
  let bestResult: CandidateWithAmount[] | null = null;
  let bestDiff = Infinity;

  function search(
    index: number,
    remaining: number,
    selected: CandidateWithAmount[],
    depth: number
  ): boolean {
    // Time limit check
    if (performance.now() - startTime > timeLimitMs) return true; // stop

    // Found a match within tolerance
    if (Math.abs(remaining) <= tolerance && selected.length >= 2) {
      const diff = Math.abs(remaining);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestResult = [...selected];
      }
      return false;
    }

    // Depth limit
    if (depth >= maxEntries) return false;

    // Exhausted candidates
    if (index >= candidates.length) return false;

    // Pruning: if remaining < 0, we've overshot
    if (remaining < -tolerance) return false;

    // Pruning: if remaining amount is less than smallest possible
    // candidate, skip (candidates are sorted largest-first)
    // No easy lower bound, so skip this optimization

    // Include current candidate
    const current = candidates[index];

    if (current.amount <= remaining + tolerance) {
      const timeExpired = search(
        index + 1,
        remaining - current.amount,
        [...selected, current],
        depth + 1
      );
      if (timeExpired) return true;

      // Early exit if we found an exact match
      if (bestResult && bestDiff < 0.01) return false;
    }

    // Skip current candidate
    const timeExpired = search(index + 1, remaining, selected, depth);
    return timeExpired;
  }

  search(0, target, [], 0);

  return bestResult;
}