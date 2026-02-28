/**
 * Matching Engine — Top-level orchestrator
 * 
 * Runs all 5 passes in sequence, collecting results.
 * Reports progress between passes.
 * Produces final MatchResult with summary statistics.
 * 
 * Designed to run in a Web Worker (non-blocking).
 * Can be cancelled mid-run.
 */

import type {
  LedgerEntry,
  MatchGroup,
  MatchResult,
  MatchSummary,
  MatchingConfig,
  MatchingProgress,
  MatchingPhase,
  PassSummary,
  AmbiguousMatch,
} from '@/types';
import { DEFAULT_MATCHING_CONFIG } from '@/types/matching';
import { autoDetectPolarity } from './scoringUtils';
import { pass1ExactMatch } from './pass1Exact';
import { pass2AmountDateMatch } from './pass2AmountDate';
import { pass3FuzzyMatch } from './pass3Fuzzy';
import { pass4SplitMatch } from './pass4Split';
import { pass5Residue } from './pass5Residue';

// ─── Progress callback ──────────────────────────────────────
export type MatchingProgressCallback = (progress: MatchingProgress) => void;

// ─── Cancellation token ──────────────────────────────────────
export class CancellationToken {
  private _cancelled = false;

  cancel(): void {
    this._cancelled = true;
  }

  get isCancelled(): boolean {
    return this._cancelled;
  }

  throwIfCancelled(): void {
    if (this._cancelled) {
      throw new MatchingCancelledError();
    }
  }
}

export class MatchingCancelledError extends Error {
  constructor() {
    super('Matching was cancelled');
    this.name = 'MatchingCancelledError';
  }
}

// ─── Main engine function ────────────────────────────────────

/**
 * Run the full 5-pass matching engine
 */
export async function runMatchingEngine(
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
  onProgress?: MatchingProgressCallback,
  cancellation?: CancellationToken
): Promise<{
  result: MatchResult;
  ambiguousMatches: AmbiguousMatch[];
}> {
  const startTime = performance.now();
  const allMatchGroups: MatchGroup[] = [];
  const passSummaries: PassSummary[] = [];
  let allAmbiguous: AmbiguousMatch[] = [];

  // ── Pre-processing: Auto-detect polarity if configured ──
  let effectiveConfig = { ...config };

  if (config.polarityMode === 'auto_detect') {
    const detectedPolarity = autoDetectPolarity(entriesA, entriesB);
    effectiveConfig.polarityMode = detectedPolarity;
  }

  // ── Initialize unmatched sets ──
  let unmatchedA = new Set(entriesA.map((e) => e.id));
  let unmatchedB = new Set(entriesB.map((e) => e.id));

  const enabledPasses = new Set(effectiveConfig.enabledPasses);
  const totalPasses = effectiveConfig.enabledPasses.length;
  let passIndex = 0;

  // ════════════════════════════════════════════════════════════
  // PASS 1: Exact Hash Match
  // ════════════════════════════════════════════════════════════
  if (enabledPasses.has(1)) {
    cancellation?.throwIfCancelled();

    reportProgress(onProgress, {
      phase: 'pass1_exact',
      passNumber: 1,
      totalPasses,
      currentPassProgress: 0,
      overallProgress: passIndex / totalPasses,
      matchesFoundSoFar: 0,
      timeElapsedMs: performance.now() - startTime,
      estimatedTimeRemainingMs: 0,
      message: 'Pass 1: Exact hash matching...',
    });

    const pass1Result = pass1ExactMatch(
      entriesA,
      entriesB,
      effectiveConfig
    );

    allMatchGroups.push(...pass1Result.matchGroups);
    unmatchedA = pass1Result.unmatchedA;
    unmatchedB = pass1Result.unmatchedB;

    passSummaries.push({
      passNumber: 1,
      passName: 'Exact Hash Match',
      matchCount: pass1Result.matchCount,
      averageConfidence: avgConfidence(pass1Result.matchGroups),
      timeMs: pass1Result.timeMs,
    });

    passIndex++;

    // Yield to event loop
    await yieldToEventLoop();
  }

  // ════════════════════════════════════════════════════════════
  // PASS 2: Amount + Date Window
  // ════════════════════════════════════════════════════════════
  if (enabledPasses.has(2)) {
    cancellation?.throwIfCancelled();

    reportProgress(onProgress, {
      phase: 'pass2_amount_date',
      passNumber: 2,
      totalPasses,
      currentPassProgress: 0,
      overallProgress: passIndex / totalPasses,
      matchesFoundSoFar: allMatchGroups.length,
      timeElapsedMs: performance.now() - startTime,
      estimatedTimeRemainingMs: 0,
      message: 'Pass 2: Amount + date window matching...',
    });

    const pass2Result = pass2AmountDateMatch(
      entriesA,
      entriesB,
      unmatchedA,
      unmatchedB,
      effectiveConfig
    );

    allMatchGroups.push(...pass2Result.matchGroups);
    allAmbiguous.push(...pass2Result.ambiguousMatches);
    unmatchedA = pass2Result.unmatchedA;
    unmatchedB = pass2Result.unmatchedB;

    passSummaries.push({
      passNumber: 2,
      passName: 'Amount + Date Window',
      matchCount: pass2Result.matchCount,
      averageConfidence: avgConfidence(pass2Result.matchGroups),
      timeMs: pass2Result.timeMs,
    });

    passIndex++;
    await yieldToEventLoop();
  }

  // ════════════════════════════════════════════════════════════
  // PASS 3: Fuzzy Description Match
  // ════════════════════════════════════════════════════════════
  if (enabledPasses.has(3)) {
    cancellation?.throwIfCancelled();

    reportProgress(onProgress, {
      phase: 'pass3_fuzzy',
      passNumber: 3,
      totalPasses,
      currentPassProgress: 0,
      overallProgress: passIndex / totalPasses,
      matchesFoundSoFar: allMatchGroups.length,
      timeElapsedMs: performance.now() - startTime,
      estimatedTimeRemainingMs: 0,
      message: 'Pass 3: Fuzzy description matching...',
    });

    const pass3Result = pass3FuzzyMatch(
      entriesA,
      entriesB,
      unmatchedA,
      unmatchedB,
      effectiveConfig
    );

    allMatchGroups.push(...pass3Result.matchGroups);
    unmatchedA = pass3Result.unmatchedA;
    unmatchedB = pass3Result.unmatchedB;

    passSummaries.push({
      passNumber: 3,
      passName: 'Fuzzy Description Match',
      matchCount: pass3Result.matchCount,
      averageConfidence: avgConfidence(pass3Result.matchGroups),
      timeMs: pass3Result.timeMs,
    });

    passIndex++;
    await yieldToEventLoop();
  }

  // ════════════════════════════════════════════════════════════
  // PASS 4: Split Transaction Detection
  // ════════════════════════════════════════════════════════════
  if (enabledPasses.has(4)) {
    cancellation?.throwIfCancelled();

    reportProgress(onProgress, {
      phase: 'pass4_split',
      passNumber: 4,
      totalPasses,
      currentPassProgress: 0,
      overallProgress: passIndex / totalPasses,
      matchesFoundSoFar: allMatchGroups.length,
      timeElapsedMs: performance.now() - startTime,
      estimatedTimeRemainingMs: 0,
      message: 'Pass 4: Split transaction detection...',
    });

    const pass4Result = pass4SplitMatch(
      entriesA,
      entriesB,
      unmatchedA,
      unmatchedB,
      effectiveConfig
    );

    allMatchGroups.push(...pass4Result.matchGroups);
    unmatchedA = pass4Result.unmatchedA;
    unmatchedB = pass4Result.unmatchedB;

    passSummaries.push({
      passNumber: 4,
      passName: 'Split Transaction Detection',
      matchCount: pass4Result.matchCount,
      averageConfidence: avgConfidence(pass4Result.matchGroups),
      timeMs: pass4Result.timeMs,
    });

    passIndex++;
    await yieldToEventLoop();
  }

  // ════════════════════════════════════════════════════════════
  // PASS 5: Residue Classification
  // ════════════════════════════════════════════════════════════
  if (enabledPasses.has(5)) {
    cancellation?.throwIfCancelled();

    reportProgress(onProgress, {
      phase: 'pass5_residue',
      passNumber: 5,
      totalPasses,
      currentPassProgress: 0,
      overallProgress: passIndex / totalPasses,
      matchesFoundSoFar: allMatchGroups.length,
      timeElapsedMs: performance.now() - startTime,
      estimatedTimeRemainingMs: 0,
      message: 'Pass 5: Classifying remaining entries...',
    });

    const pass5Result = pass5Residue(
      entriesA,
      entriesB,
      unmatchedA,
      unmatchedB,
      effectiveConfig
    );

    allMatchGroups.push(...pass5Result.matchGroups);

    passSummaries.push({
      passNumber: 5,
      passName: 'Residue Classification',
      matchCount: pass5Result.unmatchedACount + pass5Result.unmatchedBCount + pass5Result.duplicateCount,
      averageConfidence: 0,
      timeMs: pass5Result.timeMs,
    });
  }

  // ════════════════════════════════════════════════════════════
  // COMPILE RESULTS
  // ════════════════════════════════════════════════════════════
  const totalTimeMs = performance.now() - startTime;

  const summary = buildSummary(
    entriesA,
    entriesB,
    allMatchGroups,
    passSummaries,
    totalTimeMs
  );

  const result: MatchResult = {
    sessionId: crypto.randomUUID(),
    config: effectiveConfig,
    matchGroups: allMatchGroups,
    summary,
    processingTimeMs: totalTimeMs,
    completedAt: Date.now(),
  };

  // Report completion
  reportProgress(onProgress, {
    phase: 'complete',
    passNumber: totalPasses,
    totalPasses,
    currentPassProgress: 1,
    overallProgress: 1,
    matchesFoundSoFar: allMatchGroups.length,
    timeElapsedMs: totalTimeMs,
    estimatedTimeRemainingMs: 0,
    message: `Complete: ${summary.matchedCount} matched, ${summary.unmatchedACount + summary.unmatchedBCount} unmatched`,
  });

  return {
    result,
    ambiguousMatches: allAmbiguous,
  };
}

// ─── Summary builder ─────────────────────────────────────────

function buildSummary(
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  matchGroups: MatchGroup[],
  passSummaries: PassSummary[],
  totalTimeMs: number
): MatchSummary {
  const matchedGroups = matchGroups.filter((mg) =>
    ['exact', 'amount_date', 'fuzzy'].includes(mg.matchType)
  );
  const splitGroups = matchGroups.filter((mg) => mg.matchType === 'split');
  const unmatchedAGroups = matchGroups.filter((mg) => mg.matchType === 'unmatched_a');
  const unmatchedBGroups = matchGroups.filter((mg) => mg.matchType === 'unmatched_b');
  const duplicateGroups = matchGroups.filter((mg) => mg.matchType === 'duplicate');

  const matchedCount = matchedGroups.length + splitGroups.length;
  const totalEntries = entriesA.length + entriesB.length;

  // Calculate amounts
  const totalAmountA = entriesA.reduce((sum, e) => sum + e.amountAbs, 0);
  const totalAmountB = entriesB.reduce((sum, e) => sum + e.amountAbs, 0);

  // Matched amount: sum of amounts in matched groups
  const matchedAmount = matchedGroups.reduce(
    (sum, mg) => sum + getGroupAmountA(mg, entriesA),
    0
  );

  // Unmatched amounts
  const unmatchedAmountA = unmatchedAGroups.reduce(
    (sum, mg) => sum + getGroupAmountA(mg, entriesA),
    0
  );
  const unmatchedAmountB = unmatchedBGroups.reduce(
    (sum, mg) => sum + getGroupAmountB(mg, entriesB),
    0
  );

  // Average confidence
  const matchedConfidences = [...matchedGroups, ...splitGroups]
    .map((mg) => mg.confidence)
    .filter((c) => c > 0);
  const avgConf =
    matchedConfidences.length > 0
      ? matchedConfidences.reduce((a, b) => a + b, 0) / matchedConfidences.length
      : 0;

  // Match rate = matched entries / total entries that COULD match
  const maxPossibleMatches = Math.min(entriesA.length, entriesB.length);
  const matchRate =
    maxPossibleMatches > 0 ? matchedCount / maxPossibleMatches : 0;

  return {
    totalEntriesA: entriesA.length,
    totalEntriesB: entriesB.length,
    matchedCount,
    unmatchedACount: unmatchedAGroups.length,
    unmatchedBCount: unmatchedBGroups.length,
    partialCount: matchedGroups.filter((mg) => mg.matchType === 'fuzzy').length,
    splitCount: splitGroups.length,
    duplicateCount: duplicateGroups.length,
    matchRate,
    totalAmountA,
    totalAmountB,
    totalDiscrepancy: Math.abs(totalAmountA - totalAmountB),
    matchedAmount,
    unmatchedAmountA,
    unmatchedAmountB,
    byPass: passSummaries,
    averageConfidence: Math.round(avgConf),
    processingTimeMs: totalTimeMs,
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function getGroupAmountA(
  group: MatchGroup,
  entriesA: LedgerEntry[]
): number {
  return group.entriesA.reduce((sum, id) => {
    const entry = entriesA.find((e) => e.id === id);
    return sum + (entry?.amountAbs ?? 0);
  }, 0);
}

function getGroupAmountB(
  group: MatchGroup,
  entriesB: LedgerEntry[]
): number {
  return group.entriesB.reduce((sum, id) => {
    const entry = entriesB.find((e) => e.id === id);
    return sum + (entry?.amountAbs ?? 0);
  }, 0);
}

function avgConfidence(groups: MatchGroup[]): number {
  if (groups.length === 0) return 0;
  return Math.round(
    groups.reduce((sum, g) => sum + g.confidence, 0) / groups.length
  );
}

function reportProgress(
  callback: MatchingProgressCallback | undefined,
  progress: MatchingProgress
): void {
  if (callback) {
    callback(progress);
  }
}

async function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}