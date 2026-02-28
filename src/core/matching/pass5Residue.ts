/**
 * Pass 5 — Residue Classification
 * 
 * Everything remaining after passes 1-4:
 * - Entries only in A → UNMATCHED_A
 * - Entries only in B → UNMATCHED_B
 * - Duplicate entries on same side → DUPLICATE
 * 
 * Also detects potential duplicates within each ledger
 * (entries that appear multiple times with same date+amount).
 */

import type {
  LedgerEntry,
  MatchGroup,
  MatchingConfig,
} from '@/types';
import {
  generateMatchReason,
  entryContentHash,
} from './scoringUtils';

export interface Pass5Result {
  matchGroups: MatchGroup[];
  timeMs: number;
  unmatchedACount: number;
  unmatchedBCount: number;
  duplicateCount: number;
}

/**
 * Pass 5: Classify all remaining entries
 */
export function pass5Residue(
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  unmatchedAIds: Set<string>,
  unmatchedBIds: Set<string>,
  config: MatchingConfig
): Pass5Result {
  const startTime = performance.now();
  const matchGroups: MatchGroup[] = [];

  // ── Detect duplicates within each side ──
  const duplicatesA = detectDuplicates(entriesA, unmatchedAIds);
  const duplicatesB = detectDuplicates(entriesB, unmatchedBIds);

  // Create match groups for duplicates
  for (const dupGroup of [...duplicatesA, ...duplicatesB]) {
    const isA = entriesA.some((e) => e.id === dupGroup[0]);
    const party = isA ? 'A' : 'B';

    const factors = {
      dateMatch: false,
      dateDiff: -1,
      amountExact: false,
      amountDiff: 0,
      amountBase: 0,
      refMatch: false,
      descriptionSimilarity: 0,
      matchType: 'duplicate' as const,
    };

    const matchGroup: MatchGroup = {
      id: crypto.randomUUID(),
      matchType: 'duplicate',
      confidence: 0,
      matchReason: generateMatchReason('duplicate', factors, config, {
        duplicateCount: dupGroup.length,
      }),
      status: 'open',
      entriesA: party === 'A' ? dupGroup : [],
      entriesB: party === 'B' ? dupGroup : [],
      amountDifference: 0,
      dateDifference: 0,
      descriptionSimilarity: 1,
      passNumber: 5,
      createdAt: Date.now(),
      comments: [],
    };

    matchGroups.push(matchGroup);

    // Remove duplicates from unmatched pool (they're now classified)
    for (const id of dupGroup) {
      if (isA) unmatchedAIds.delete(id);
      else unmatchedBIds.delete(id);
    }
  }

  // ── Create unmatched entries for remaining A ──
  for (const entryId of unmatchedAIds) {
    const entry = entriesA.find((e) => e.id === entryId);
    if (!entry) continue;

    const factors = {
      dateMatch: false,
      dateDiff: -1,
      amountExact: false,
      amountDiff: 0,
      amountBase: entry.amountAbs,
      refMatch: false,
      descriptionSimilarity: 0,
      matchType: 'unmatched_a' as const,
    };

    const matchGroup: MatchGroup = {
      id: crypto.randomUUID(),
      matchType: 'unmatched_a',
      confidence: 0,
      matchReason: generateMatchReason('unmatched_a', factors, config),
      status: 'open',
      entriesA: [entryId],
      entriesB: [],
      amountDifference: entry.amountAbs,
      dateDifference: 0,
      descriptionSimilarity: 0,
      passNumber: 5,
      createdAt: Date.now(),
      comments: [],
    };

    matchGroups.push(matchGroup);
  }

  // ── Create unmatched entries for remaining B ──
  for (const entryId of unmatchedBIds) {
    const entry = entriesB.find((e) => e.id === entryId);
    if (!entry) continue;

    const factors = {
      dateMatch: false,
      dateDiff: -1,
      amountExact: false,
      amountDiff: 0,
      amountBase: entry.amountAbs,
      refMatch: false,
      descriptionSimilarity: 0,
      matchType: 'unmatched_b' as const,
    };

    const matchGroup: MatchGroup = {
      id: crypto.randomUUID(),
      matchType: 'unmatched_b',
      confidence: 0,
      matchReason: generateMatchReason('unmatched_b', factors, config),
      status: 'open',
      entriesA: [],
      entriesB: [entryId],
      amountDifference: entry.amountAbs,
      dateDifference: 0,
      descriptionSimilarity: 0,
      passNumber: 5,
      createdAt: Date.now(),
      comments: [],
    };

    matchGroups.push(matchGroup);
  }

  return {
    matchGroups,
    timeMs: performance.now() - startTime,
    unmatchedACount: unmatchedAIds.size,
    unmatchedBCount: unmatchedBIds.size,
    duplicateCount: duplicatesA.length + duplicatesB.length,
  };
}

// ─── Duplicate detection within one side ─────────────────────

function detectDuplicates(
  entries: LedgerEntry[],
  unmatchedIds: Set<string>
): string[][] {
  const hashMap = new Map<string, string[]>();

  for (const entry of entries) {
    if (!unmatchedIds.has(entry.id)) continue;

    const hash = entryContentHash(entry);

    if (!hashMap.has(hash)) {
      hashMap.set(hash, []);
    }
    hashMap.get(hash)!.push(entry.id);
  }

  // Return groups where count > 1
  const duplicateGroups: string[][] = [];

  for (const [_hash, ids] of hashMap) {
    if (ids.length > 1) {
      duplicateGroups.push(ids);
    }
  }

  return duplicateGroups;
}