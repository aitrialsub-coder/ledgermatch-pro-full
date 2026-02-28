/**
 * Matching Engine Web Worker
 * 
 * Runs the 5-pass matching engine off the main thread so the UI
 * stays responsive during heavy computation.
 * 
 * Communication via postMessage / onmessage.
 * Supports progress reporting and cancellation.
 */

import type {
  LedgerEntry,
  MatchingConfig,
  MatchResult,
  MatchingProgress,
  AmbiguousMatch,
} from '@/types';
import { runMatchingEngine, CancellationToken } from './matchingEngine';

// ─── Message types ───────────────────────────────────────────

export type WorkerInMessage =
  | {
      type: 'START_MATCHING';
      payload: {
        entriesA: LedgerEntry[];
        entriesB: LedgerEntry[];
        config: MatchingConfig;
      };
    }
  | { type: 'CANCEL' };

export type WorkerOutMessage =
  | {
      type: 'PROGRESS';
      payload: MatchingProgress;
    }
  | {
      type: 'RESULT';
      payload: {
        result: MatchResult;
        ambiguousMatches: AmbiguousMatch[];
      };
    }
  | {
      type: 'ERROR';
      payload: { message: string };
    }
  | {
      type: 'CANCELLED';
    };

// ─── Worker context ──────────────────────────────────────────

let cancellationToken: CancellationToken | null = null;

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'START_MATCHING': {
      const { entriesA, entriesB, config } = message.payload;

      cancellationToken = new CancellationToken();

      const onProgress = (progress: MatchingProgress) => {
        const outMsg: WorkerOutMessage = {
          type: 'PROGRESS',
          payload: progress,
        };
        self.postMessage(outMsg);
      };

      try {
        const { result, ambiguousMatches } = await runMatchingEngine(
          entriesA,
          entriesB,
          config,
          onProgress,
          cancellationToken
        );

        const outMsg: WorkerOutMessage = {
          type: 'RESULT',
          payload: { result, ambiguousMatches },
        };
        self.postMessage(outMsg);
      } catch (err) {
        if (
          err instanceof Error &&
          err.name === 'MatchingCancelledError'
        ) {
          const outMsg: WorkerOutMessage = { type: 'CANCELLED' };
          self.postMessage(outMsg);
        } else {
          const outMsg: WorkerOutMessage = {
            type: 'ERROR',
            payload: {
              message:
                err instanceof Error
                  ? err.message
                  : 'Unknown matching error',
            },
          };
          self.postMessage(outMsg);
        }
      } finally {
        cancellationToken = null;
      }
      break;
    }

    case 'CANCEL': {
      if (cancellationToken) {
        cancellationToken.cancel();
      }
      break;
    }
  }
};

// Required for TypeScript module worker
export {};