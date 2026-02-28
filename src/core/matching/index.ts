/**
 * Re-export matching engine
 */

export { runMatchingEngine, CancellationToken, MatchingCancelledError } from './matchingEngine';
export { pass1ExactMatch } from './pass1Exact';
export { pass2AmountDateMatch } from './pass2AmountDate';
export { pass3FuzzyMatch } from './pass3Fuzzy';
export { pass4SplitMatch } from './pass4Split';
export { pass5Residue } from './pass5Residue';
export * from './scoringUtils';
export { runMatchingInWorker, cancelMatchingWorker, terminateMatchingWorker } from './matchingWorkerBridge';