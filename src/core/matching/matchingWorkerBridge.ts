/**
 * Matching Worker Bridge — Main thread interface to the Web Worker
 * 
 * Provides a Promise-based API for running the matching engine
 * in a Web Worker. Handles worker lifecycle, message routing,
 * progress callbacks, and cancellation.
 */

import type {
  LedgerEntry,
  MatchingConfig,
  MatchResult,
  MatchingProgress,
  AmbiguousMatch,
} from '@/types';
import type { WorkerOutMessage } from './matchingWorker';

export interface MatchingWorkerResult {
  result: MatchResult;
  ambiguousMatches: AmbiguousMatch[];
}

let workerInstance: Worker | null = null;
let currentReject: ((reason: Error) => void) | null = null;

/**
 * Run matching engine in a Web Worker
 */
export function runMatchingInWorker(
  entriesA: LedgerEntry[],
  entriesB: LedgerEntry[],
  config: MatchingConfig,
  onProgress?: (progress: MatchingProgress) => void
): Promise<MatchingWorkerResult> {
  return new Promise((resolve, reject) => {
    // Terminate any existing worker
    if (workerInstance) {
      workerInstance.terminate();
      workerInstance = null;
    }

    // Create new worker
    workerInstance = new Worker(
      new URL('./matchingWorker.ts', import.meta.url),
      { type: 'module' }
    );

    currentReject = reject;

    // Handle messages from worker
    workerInstance.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'PROGRESS':
          onProgress?.(message.payload);
          break;

        case 'RESULT':
          resolve(message.payload);
          cleanupWorker();
          break;

        case 'ERROR':
          reject(new Error(message.payload.message));
          cleanupWorker();
          break;

        case 'CANCELLED':
          reject(new MatchingCancelledError());
          cleanupWorker();
          break;
      }
    };

    workerInstance.onerror = (event) => {
      reject(new Error(`Worker error: ${event.message}`));
      cleanupWorker();
    };

    // Start matching
    workerInstance.postMessage({
      type: 'START_MATCHING',
      payload: { entriesA, entriesB, config },
    });
  });
}

/**
 * Cancel the currently running matching operation
 */
export function cancelMatchingWorker(): void {
  if (workerInstance) {
    workerInstance.postMessage({ type: 'CANCEL' });
  }
}

/**
 * Terminate the worker immediately
 */
export function terminateMatchingWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
  if (currentReject) {
    currentReject(new MatchingCancelledError());
    currentReject = null;
  }
}

/**
 * Check if a matching operation is currently running
 */
export function isMatchingWorkerRunning(): boolean {
  return workerInstance !== null;
}

// ─── Helpers ─────────────────────────────────────────────────

function cleanupWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
  currentReject = null;
}

class MatchingCancelledError extends Error {
  constructor() {
    super('Matching was cancelled');
    this.name = 'MatchingCancelledError';
  }
}