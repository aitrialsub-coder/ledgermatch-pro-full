/**
 * Levenshtein Edit Distance — O(n*m) dynamic programming
 * 
 * Computes minimum number of single-character edits (insertions,
 * deletions, substitutions) to transform string A into string B.
 * 
 * Returns both raw distance and normalized similarity (0-1).
 * 
 * ~30 lines of core logic. No dependencies.
 */

/**
 * Raw Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;

  // Edge cases
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;
  if (a === b) return 0;

  // Use two rows instead of full matrix — O(min(n,m)) space
  // Always iterate over the shorter string for columns
  const [short, long] =
    lenA <= lenB ? [a, b] : [b, a];
  const shortLen = short.length;
  const longLen = long.length;

  // Previous and current row
  let prevRow = new Array(shortLen + 1);
  let currRow = new Array(shortLen + 1);

  // Initialize first row
  for (let j = 0; j <= shortLen; j++) {
    prevRow[j] = j;
  }

  // Fill matrix row by row
  for (let i = 1; i <= longLen; i++) {
    currRow[0] = i;

    for (let j = 1; j <= shortLen; j++) {
      const cost = long[i - 1] === short[j - 1] ? 0 : 1;

      currRow[j] = Math.min(
        prevRow[j] + 1,        // deletion
        currRow[j - 1] + 1,    // insertion
        prevRow[j - 1] + cost  // substitution
      );
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[shortLen];
}

/**
 * Normalized Levenshtein similarity (0.0 to 1.0)
 * 1.0 = identical, 0.0 = completely different
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(a, b);
  return 1.0 - distance / maxLen;
}

/**
 * Case-insensitive Levenshtein similarity
 */
export function levenshteinSimilarityCI(a: string, b: string): number {
  return levenshteinSimilarity(a.toLowerCase(), b.toLowerCase());
}

/**
 * Early exit optimization — returns -1 if distance exceeds maxDistance
 * Useful when you only care about "close enough" matches
 */
export function levenshteinDistanceBounded(
  a: string,
  b: string,
  maxDistance: number
): number {
  const lenA = a.length;
  const lenB = b.length;

  // Quick length check
  if (Math.abs(lenA - lenB) > maxDistance) return -1;

  if (lenA === 0) return lenB <= maxDistance ? lenB : -1;
  if (lenB === 0) return lenA <= maxDistance ? lenA : -1;
  if (a === b) return 0;

  const [short, long] =
    lenA <= lenB ? [a, b] : [b, a];
  const shortLen = short.length;
  const longLen = long.length;

  let prevRow = new Array(shortLen + 1);
  let currRow = new Array(shortLen + 1);

  for (let j = 0; j <= shortLen; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= longLen; i++) {
    currRow[0] = i;
    let rowMin = currRow[0];

    for (let j = 1; j <= shortLen; j++) {
      const cost = long[i - 1] === short[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      );
      rowMin = Math.min(rowMin, currRow[j]);
    }

    // Early exit: if entire row exceeds max, no point continuing
    if (rowMin > maxDistance) return -1;

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[shortLen] <= maxDistance ? prevRow[shortLen] : -1;
}