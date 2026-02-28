/**
 * Token-based String Similarity
 * 
 * Handles reordered words:
 *   "Widget Supply Co Invoice 1042" vs "Invoice 1042 - Widget Supply"
 * 
 * Three algorithms:
 * 1. Token Sort Ratio — sort tokens alphabetically, then Levenshtein
 * 2. Token Set Ratio — Jaccard similarity on token sets
 * 3. Token Containment — what fraction of query tokens appear in target
 * 
 * No dependencies.
 */

import { levenshteinSimilarity } from './levenshtein';

// ─── Text normalization for token comparison ─────────────────
function normalizeForTokens(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
}

function tokenize(s: string): string[] {
  return normalizeForTokens(s)
    .split(' ')
    .filter((t) => t.length > 0);
}

// ─── Token Sort Ratio ────────────────────────────────────────
/**
 * Sort both strings' tokens alphabetically, rejoin, then compute
 * Levenshtein similarity on the sorted versions.
 * 
 * Handles word reordering:
 *   "Acme Widget Supply" vs "Widget Supply Acme" → same sorted string
 */
export function tokenSortRatio(a: string, b: string): number {
  const tokensA = tokenize(a).sort();
  const tokensB = tokenize(b).sort();

  if (tokensA.length === 0 && tokensB.length === 0) return 1.0;
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  const sortedA = tokensA.join(' ');
  const sortedB = tokensB.join(' ');

  return levenshteinSimilarity(sortedA, sortedB);
}

// ─── Token Set Ratio (Jaccard Similarity) ────────────────────
/**
 * Jaccard similarity: |intersection| / |union| of token sets
 * 
 * Ignores word order and duplicate words entirely.
 * Good for catching partial matches where some words are missing.
 */
export function tokenSetRatio(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersectionSize = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;

  return unionSize > 0 ? intersectionSize / unionSize : 0;
}

// ─── Token Containment ──────────────────────────────────────
/**
 * What fraction of query tokens appear somewhere in the target text?
 * 
 * Handles bank truncation:
 *   query:  "Payment to Acme Widget Supply Co Invoice 1042"
 *   target: "ACH DEBIT ACME WIDGET SUP 1042"
 *   → "acme" ✓, "widget" ✓, "1042" ✓ = 3/7 tokens found
 * 
 * Also checks substring containment (not just exact token match):
 *   "supply" partially matches "sup" via substring
 */
export function tokenContainment(
  query: string,
  target: string,
  minTokenLength: number = 2
): number {
  const queryTokens = tokenize(query).filter((t) => t.length >= minTokenLength);
  const targetText = normalizeForTokens(target);
  const targetTokens = new Set(tokenize(target));

  if (queryTokens.length === 0) return 0;

  let found = 0;

  for (const token of queryTokens) {
    // Exact token match
    if (targetTokens.has(token)) {
      found += 1.0;
      continue;
    }

    // Substring match (handles truncation)
    if (targetText.includes(token)) {
      found += 0.8;
      continue;
    }

    // Check if any target token starts with query token or vice versa
    let partialMatch = false;
    for (const tToken of targetTokens) {
      if (tToken.startsWith(token) || token.startsWith(tToken)) {
        found += 0.6;
        partialMatch = true;
        break;
      }
    }

    if (!partialMatch) {
      // Check if any target token has high similarity
      for (const tToken of targetTokens) {
        if (tToken.length >= 3 && token.length >= 3) {
          const sim = levenshteinSimilarity(token, tToken);
          if (sim >= 0.75) {
            found += sim * 0.5;
            break;
          }
        }
      }
    }
  }

  return Math.min(1.0, found / queryTokens.length);
}

// ─── Combined Description Similarity ─────────────────────────
/**
 * Weighted combination of all token-based metrics.
 * This is the main function used by the matching engine.
 */
export interface DescriptionSimilarityResult {
  combined: number;          // weighted final score (0-1)
  jaroWinkler: number;       // raw Jaro-Winkler score
  tokenSort: number;         // token sort ratio
  tokenSet: number;          // Jaccard similarity
  tokenContainment: number;  // containment score
  method: string;            // which method contributed most
}

export function computeDescriptionSimilarity(
  a: string,
  b: string,
  weights: {
    jaroWinkler: number;
    tokenSort: number;
    tokenContainment: number;
  } = { jaroWinkler: 0.4, tokenSort: 0.3, tokenContainment: 0.3 }
): DescriptionSimilarityResult {
  // Import inline to avoid circular dependency at module level
  const { jaroWinklerSimilarityCI } = require('./jaroWinkler');

  const jw: number = jaroWinklerSimilarityCI(a, b);
  const ts = tokenSortRatio(a, b);
  const tset = tokenSetRatio(a, b);
  const tc = tokenContainment(a, b);

  // Weighted combination
  const combined =
    jw * weights.jaroWinkler +
    ts * weights.tokenSort +
    tc * weights.tokenContainment;

  // Determine which method contributed most
  const scores = [
    { name: 'jaroWinkler', value: jw },
    { name: 'tokenSort', value: ts },
    { name: 'tokenContainment', value: tc },
  ];
  scores.sort((a, b) => b.value - a.value);

  return {
    combined: Math.min(1.0, combined),
    jaroWinkler: jw,
    tokenSort: ts,
    tokenSet: tset,
    tokenContainment: tc,
    method: scores[0].name,
  };
}

// ─── Standalone combined similarity (no circular import) ─────
/**
 * Self-contained version that inlines Jaro-Winkler
 * Used by the matching engine to avoid import issues
 */
export function descriptionSimilarity(
  a: string,
  b: string,
  weights: {
    jaroWinkler: number;
    tokenSort: number;
    tokenContainment: number;
  }
): number {
  // Inline Jaro-Winkler to avoid circular dependency
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  const jw = inlineJaroWinkler(aLower, bLower);
  const ts = tokenSortRatio(a, b);
  const tc = tokenContainment(a, b);

  return (
    jw * weights.jaroWinkler +
    ts * weights.tokenSort +
    tc * weights.tokenContainment
  );
}

function inlineJaroWinkler(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const matchWindow = Math.max(
    Math.floor(Math.max(a.length, b.length) / 2) - 1, 0
  );

  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let bMatchIdx = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[bMatchIdx]) bMatchIdx++;
    if (a[i] !== b[bMatchIdx]) transpositions++;
    bMatchIdx++;
  }

  const jaro =
    (matches / a.length +
      matches / b.length +
      (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  const limit = Math.min(a.length, b.length, 4);
  for (let i = 0; i < limit; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}