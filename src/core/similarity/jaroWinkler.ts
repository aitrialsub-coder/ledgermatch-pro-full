/**
 * Jaro-Winkler Distance — optimized for short strings
 * 
 * Best for reference numbers, invoice IDs, and short descriptions.
 * Gives extra weight to common prefixes (the "Winkler" bonus).
 * 
 * Returns similarity score 0.0 to 1.0
 * 
 * ~50 lines of core logic. No dependencies.
 */

/**
 * Jaro similarity (base algorithm)
 */
export function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  // Maximum distance for matching
  const matchWindow = Math.max(
    Math.floor(Math.max(a.length, b.length) / 2) - 1,
    0
  );

  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
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

  // Count transpositions
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
      (matches - transpositions / 2) / matches) /
    3;

  return jaro;
}

/**
 * Jaro-Winkler similarity (adds prefix bonus)
 * 
 * @param prefixScale - scaling factor for common prefix bonus (default: 0.1)
 *                       standard Winkler uses 0.1, max 0.25
 * @param maxPrefixLength - max prefix to consider (default: 4)
 */
export function jaroWinklerSimilarity(
  a: string,
  b: string,
  prefixScale: number = 0.1,
  maxPrefixLength: number = 4
): number {
  const jaro = jaroSimilarity(a, b);

  if (jaro === 0) return 0;
  if (jaro === 1) return 1;

  // Calculate common prefix length (up to max)
  let prefix = 0;
  const limit = Math.min(a.length, b.length, maxPrefixLength);

  for (let i = 0; i < limit; i++) {
    if (a[i] === b[i]) {
      prefix++;
    } else {
      break;
    }
  }

  // Clamp prefix scale to max 0.25 (as per Winkler's spec)
  const clampedScale = Math.min(prefixScale, 0.25);

  return jaro + prefix * clampedScale * (1 - jaro);
}

/**
 * Case-insensitive Jaro-Winkler similarity
 */
export function jaroWinklerSimilarityCI(a: string, b: string): number {
  return jaroWinklerSimilarity(a.toLowerCase(), b.toLowerCase());
}

/**
 * Batch comparison: compare one string against many candidates
 * Returns candidates sorted by similarity (descending)
 */
export function jaroWinklerBestMatches(
  query: string,
  candidates: string[],
  threshold: number = 0.7,
  maxResults: number = 10
): Array<{ index: number; text: string; similarity: number }> {
  const results: Array<{ index: number; text: string; similarity: number }> = [];

  const queryLower = query.toLowerCase();

  for (let i = 0; i < candidates.length; i++) {
    const similarity = jaroWinklerSimilarity(
      queryLower,
      candidates[i].toLowerCase()
    );

    if (similarity >= threshold) {
      results.push({ index: i, text: candidates[i], similarity });
    }
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
}