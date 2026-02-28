/**
 * Pass 3 — Fuzzy Description Match
 * 
 * For entries with matching amounts but no exact date/ref match:
 * Compares descriptions using weighted string similarity.
 * 
 * Algorithm blend:
 *   combined = JaroWinkler × w1 + TokenSort × w2 + TokenContainment × w3
 * 
 * Pre-filtered using N-gram index to avoid O(n²) full comparison.
 * 
 * Amount MUST still be within tolerance for fuzzy match to count.
 */

import type {
  LedgerEntry,
  MatchGroup,
  MatchingConfig,
} from '@/types';
import {
  getComparableAmount,
  amountsMatch,
  datesMatch,
  refsMatch,
  computeConfidence,
  generateMatchReason,
} from './scoringUtils';
import { NgramIndex } from '../similarity/ngramIndex';
import { jaroWinklerSimilarityCI } from '../similarity/jaroWinkler';
import { tokenSortRatio, tokenContainment } from '../similarity/tokenSort';
import { dayDifference } from '../parsers/dateParser';

export interface Pass3Result {
  matchGroups: MatchGroup[];
  unmatchedA: Set<string>;
  unmatchedB: Set<string>;
  timeMs: number;
  matchCount: number;
}

/**
 * Pass 3: Fuzzy description matching with pre-filtering
 */
export function pass3FuzzyMatch(
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  unmatchedAIds: Set<string>,
  unmatchedBIds: Set<string>,
  config: MatchingConfig
): Pass3Result {
  const startTime = performance.now();
  const matchGroups: MatchGroup[] = [];

  const unmatchedA = entriesA.filter((e) => unmatchedAIds.has(e.id));
  const unmatchedB = entriesB.filter((e) => unmatchedBIds.has(e.id));

  if (unmatchedA.length === 0 || unmatchedB.length === 0) {
    return {
      matchGroups,
      unmatchedA: unmatchedAIds,
      unmatchedB: unmatchedBIds,
      timeMs: performance.now() - startTime,
      matchCount: 0,
    };
  }

  // Build n-gram index on B descriptions for fast candidate lookup
  const ngramIndex = new NgramIndex(3);
  const entryMapB = new Map<string, LedgerEntry>();

  for (const entry of unmatchedB) {
    if (entry.description && entry.description.length > 2) {
      ngramIndex.add(entry.id, entry.description);
    }
    entryMapB.set(entry.id, entry);
  }

  // Track consumed entries
  const consumedB = new Set<string>();
  const stillUnmatchedA = new Set(unmatchedAIds);
  const stillUnmatchedB = new Set(unmatchedBIds);

  // Score all candidates and sort by best match
  const allPotentialMatches: PotentialMatch[] = [];

  for (const entryA of unmatchedA) {
    if (!entryA.description || entryA.description.length < 3) continue;

    const amountA = Math.abs(
      getComparableAmount(entryA, config.polarityMode)
    );

    // Step 1: Get n-gram candidates (fast pre-filter)
    const ngramCandidates = ngramIndex.findCandidates(
      entryA.description,
      2 // minimum 2 shared trigrams
    );

    // Step 2: For each candidate, check amount + date + compute similarity
    for (const candidate of ngramCandidates) {
      const entryB = entryMapB.get(candidate.entryId);
      if (!entryB) continue;

      const amountB = Math.abs(
        getComparableAmount(entryB, config.polarityMode)
      );

      // Amount must match (required — fuzzy match alone is not enough)
      const amountCheck = amountsMatch(amountA, amountB, config);
      if (!amountCheck.matches) continue;

      // Date check (optional but improves confidence)
      const dateCheck = datesMatch(
        entryA.date,
        entryB.date,
        config.dateToleranceDays
      );

      // Compute full description similarity
      const similarity = computeWeightedSimilarity(
        entryA.description,
        entryB.description,
        config.descriptionWeight
      );

      if (similarity < config.descriptionThreshold) continue;

      allPotentialMatches.push({
        entryAId: entryA.id,
        entryBId: entryB.id,
        similarity,
        amountDiff: amountCheck.difference,
        amountA,
        amountB,
        dateMatches: dateCheck.matches,
        dateDiff: dateCheck.daysDiff,
        refMatches: refsMatch(
          entryA.refNumber,
          entryB.refNumber,
          config.caseSensitiveRef
        ),
      });
    }
  }

  // Sort by similarity descending — match best pairs first
  allPotentialMatches.sort((a, b) => b.similarity - a.similarity);

  // Greedy assignment: take best matches first
  for (const pm of allPotentialMatches) {
    if (!stillUnmatchedA.has(pm.entryAId)) continue;
    if (consumedB.has(pm.entryBId)) continue;
    if (!stillUnmatchedB.has(pm.entryBId)) continue;

    const factors = {
      dateMatch: pm.dateMatches,
      dateDiff: pm.dateDiff,
      amountExact: pm.amountDiff < 0.01,
      amountDiff: pm.amountDiff,
      amountBase: Math.max(pm.amountA, pm.amountB),
      refMatch: pm.refMatches,
      descriptionSimilarity: pm.similarity,
      matchType: 'fuzzy' as const,
    };

    const matchGroup: MatchGroup = {
      id: crypto.randomUUID(),
      matchType: 'fuzzy',
      confidence: computeConfidence(factors),
      matchReason: generateMatchReason('fuzzy', factors, config),
      status: 'open',
      entriesA: [pm.entryAId],
      entriesB: [pm.entryBId],
      amountDifference: pm.amountDiff,
      dateDifference: pm.dateDiff,
      descriptionSimilarity: pm.similarity,
      passNumber: 3,
      createdAt: Date.now(),
      comments: [],
    };

    matchGroups.push(matchGroup);
    stillUnmatchedA.delete(pm.entryAId);
    consumedB.add(pm.entryBId);
    stillUnmatchedB.delete(pm.entryBId);
  }

  // Cleanup
  ngramIndex.clear();

  return {
    matchGroups,
    unmatchedA: stillUnmatchedA,
    unmatchedB: stillUnmatchedB,
    timeMs: performance.now() - startTime,
    matchCount: matchGroups.length,
  };
}

// ─── Weighted similarity computation ─────────────────────────

interface PotentialMatch {
  entryAId: string;
  entryBId: string;
  similarity: number;
  amountDiff: number;
  amountA: number;
  amountB: number;
  dateMatches: boolean;
  dateDiff: number;
  refMatches: boolean;
}

function computeWeightedSimilarity(
  descA: string,
  descB: string,
  weights: { jaroWinkler: number; tokenSort: number; tokenContainment: number }
): number {
  const jw = jaroWinklerSimilarityCI(descA, descB);
  const ts = tokenSortRatio(descA, descB);
  const tc = tokenContainment(descA, descB);

  const combined =
    jw * weights.jaroWinkler +
    ts * weights.tokenSort +
    tc * weights.tokenContainment;

  return Math.min(1.0, combined);
}