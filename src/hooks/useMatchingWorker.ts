/**
 * React hook that uses the Web Worker bridge for matching
 * 
 * Provides the same API as useMatching but delegates heavy
 * computation to a Web Worker so the UI thread stays responsive.
 * Falls back to main-thread execution if Workers are unavailable.
 */

import { useCallback, useRef, useState } from 'react';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useMatchStore } from '@/stores/matchStore';
import { useAppStore } from '@/stores/appStore';
import {
  runMatchingInWorker,
  cancelMatchingWorker,
  terminateMatchingWorker,
} from '@/core/matching/matchingWorkerBridge';
import { runMatchingEngine, CancellationToken } from '@/core/matching/matchingEngine';
import type { MatchingProgress } from '@/types';

export function useMatchingWorker() {
  const entriesA = useLedgerStore((s) => s.entriesA);
  const entriesB = useLedgerStore((s) => s.entriesB);

  const config = useMatchStore((s) => s.config);
  const setResult = useMatchStore((s) => s.setResult);
  const setProgress = useMatchStore((s) => s.setProgress);
  const setIsMatching = useMatchStore((s) => s.setIsMatching);
  const setAmbiguousMatches = useMatchStore((s) => s.setAmbiguousMatches);
  const addRunToHistory = useMatchStore((s) => s.addRunToHistory);

  const addNotification = useAppStore((s) => s.addNotification);
  const setStep = useAppStore((s) => s.setStep);
  const markStepComplete = useAppStore((s) => s.markStepComplete);

  const fileA = useLedgerStore((s) => s.fileA);
  const fileB = useLedgerStore((s) => s.fileB);

  const [error, setError] = useState<string | null>(null);
  const fallbackCancellation = useRef<CancellationToken | null>(null);

  const supportsWorker = typeof Worker !== 'undefined';

  const startMatching = useCallback(async () => {
    if (entriesA.length === 0 || entriesB.length === 0) {
      addNotification({
        type: 'error',
        title: 'Cannot match',
        message: 'Both ledgers must be parsed before matching.',
      });
      return;
    }

    setError(null);
    setIsMatching(true);
    setProgress(null);

    // Keep service worker alive
    try {
      chrome.runtime.sendMessage({ type: 'START_KEEP_ALIVE' });
    } catch {
      // Not in extension context
    }

    const onProgress = (progress: MatchingProgress) => {
      setProgress(progress);
    };

    try {
      let result;
      let ambiguousMatches;

      if (supportsWorker) {
        // ── Web Worker path (preferred) ──
        const workerResult = await runMatchingInWorker(
          entriesA,
          entriesB,
          config,
          onProgress
        );
        result = workerResult.result;
        ambiguousMatches = workerResult.ambiguousMatches;
      } else {
        // ── Main thread fallback ──
        const cancellation = new CancellationToken();
        fallbackCancellation.current = cancellation;

        const mainResult = await runMatchingEngine(
          entriesA,
          entriesB,
          config,
          onProgress,
          cancellation
        );
        result = mainResult.result;
        ambiguousMatches = mainResult.ambiguousMatches;
        fallbackCancellation.current = null;
      }

      // Update stores
      setResult(result);
      setAmbiguousMatches(ambiguousMatches);

      addRunToHistory({
        id: result.sessionId,
        config: result.config,
        summary: result.summary,
        completedAt: result.completedAt,
        fileNameA: fileA?.name ?? 'Ledger A',
        fileNameB: fileB?.name ?? 'Ledger B',
      });

      markStepComplete('matching');
      setStep('results');

      addNotification({
        type: 'success',
        title: 'Matching complete',
        message: `${result.summary.matchedCount} matched, ${result.summary.unmatchedACount + result.summary.unmatchedBCount} unmatched in ${(result.processingTimeMs / 1000).toFixed(1)}s`,
      });

      if (ambiguousMatches.length > 0) {
        addNotification({
          type: 'warning',
          title: 'Ambiguous matches',
          message: `${ambiguousMatches.length} entries need manual review.`,
          duration: 0,
        });
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.name === 'MatchingCancelledError'
      ) {
        addNotification({ type: 'info', title: 'Matching cancelled' });
      } else {
        const message =
          err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        addNotification({
          type: 'error',
          title: 'Matching failed',
          message,
        });
      }
    } finally {
      setIsMatching(false);
      setProgress(null);

      try {
        chrome.runtime.sendMessage({ type: 'STOP_KEEP_ALIVE' });
      } catch {
        // Not in extension context
      }
    }
  }, [
    entriesA, entriesB, config, setResult, setProgress, setIsMatching,
    setAmbiguousMatches, addRunToHistory, addNotification, setStep,
    markStepComplete, fileA, fileB, supportsWorker,
  ]);

  const cancelMatching = useCallback(() => {
    if (supportsWorker) {
      cancelMatchingWorker();
    } else if (fallbackCancellation.current) {
      fallbackCancellation.current.cancel();
    }
  }, [supportsWorker]);

  const isReady = entriesA.length > 0 && entriesB.length > 0;

  return {
    startMatching,
    cancelMatching,
    isReady,
    error,
    usesWorker: supportsWorker,
  };
}