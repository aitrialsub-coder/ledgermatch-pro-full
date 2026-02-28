/**
 * useMatching — Updated to use Web Worker bridge
 * 
 * This replaces the original useMatching hook from Part 5.
 * It delegates to useMatchingWorker for Web Worker execution.
 */

import { useMatchingWorker } from './useMatchingWorker';

export function useMatching() {
  return useMatchingWorker();
}