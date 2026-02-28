/**
 * N-Gram Index — Pre-filter for fuzzy string matching at scale
 * 
 * Instead of comparing every entry against every other entry (O(n²)),
 * build an n-gram index and only compare entries that share at least
 * K n-grams. Reduces fuzzy comparison candidates by 80-95%.
 * 
 * No dependencies.
 */

export interface NgramIndexEntry {
  entryId: string;
  text: string;
  ngrams: Set<string>;
}

export class NgramIndex {
  private readonly n: number;
  private readonly index: Map<string, Set<string>>; // ngram → set of entry IDs
  private readonly entries: Map<string, NgramIndexEntry>; // entryId → entry data
  private readonly entryNgramCount: Map<string, number>; // entryId → total ngram count

  constructor(n: number = 3) {
    this.n = n;
    this.index = new Map();
    this.entries = new Map();
    this.entryNgramCount = new Map();
  }

  /**
   * Add an entry to the index
   */
  add(entryId: string, text: string): void {
    const normalized = this.normalize(text);
    const ngrams = this.extractNgrams(normalized);

    const entry: NgramIndexEntry = {
      entryId,
      text: normalized,
      ngrams,
    };

    this.entries.set(entryId, entry);
    this.entryNgramCount.set(entryId, ngrams.size);

    for (const ngram of ngrams) {
      if (!this.index.has(ngram)) {
        this.index.set(ngram, new Set());
      }
      this.index.get(ngram)!.add(entryId);
    }
  }

  /**
   * Add multiple entries in batch
   */
  addBatch(items: Array<{ id: string; text: string }>): void {
    for (const item of items) {
      this.add(item.id, item.text);
    }
  }

  /**
   * Find candidate matches for a query string
   * Returns entry IDs that share at least minSharedNgrams n-grams
   */
  findCandidates(
    queryText: string,
    minSharedNgrams: number = 2
  ): Array<{ entryId: string; sharedCount: number; score: number }> {
    const normalized = this.normalize(queryText);
    const queryNgrams = this.extractNgrams(normalized);

    if (queryNgrams.size === 0) return [];

    // Count shared n-grams per candidate
    const candidateCounts = new Map<string, number>();

    for (const ngram of queryNgrams) {
      const matchingEntries = this.index.get(ngram);
      if (matchingEntries) {
        for (const entryId of matchingEntries) {
          candidateCounts.set(
            entryId,
            (candidateCounts.get(entryId) || 0) + 1
          );
        }
      }
    }

    // Filter by minimum shared count and compute score
    const results: Array<{ entryId: string; sharedCount: number; score: number }> = [];

    for (const [entryId, sharedCount] of candidateCounts) {
      if (sharedCount >= minSharedNgrams) {
        // Jaccard-like score: shared / union of ngrams
        const entryNgramCount = this.entryNgramCount.get(entryId) || 1;
        const unionCount = queryNgrams.size + entryNgramCount - sharedCount;
        const score = sharedCount / unionCount;

        results.push({ entryId, sharedCount, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Find candidates, excluding a specific set of IDs
   * (useful for cross-ledger matching — don't match within same ledger)
   */
  findCandidatesExcluding(
    queryText: string,
    excludeIds: Set<string>,
    minSharedNgrams: number = 2
  ): Array<{ entryId: string; sharedCount: number; score: number }> {
    return this.findCandidates(queryText, minSharedNgrams).filter(
      (c) => !excludeIds.has(c.entryId)
    );
  }

  /**
   * Get statistics about the index
   */
  stats(): {
    totalEntries: number;
    totalNgrams: number;
    avgNgramsPerEntry: number;
    indexSize: number;
  } {
    const totalEntries = this.entries.size;
    const totalNgrams = this.index.size;
    let totalNgramCount = 0;
    for (const count of this.entryNgramCount.values()) {
      totalNgramCount += count;
    }

    return {
      totalEntries,
      totalNgrams,
      avgNgramsPerEntry: totalEntries > 0 ? totalNgramCount / totalEntries : 0,
      indexSize: this.index.size,
    };
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.index.clear();
    this.entries.clear();
    this.entryNgramCount.clear();
  }

  // ─── Private helpers ──────────────────────────────────────
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractNgrams(text: string): Set<string> {
    const ngrams = new Set<string>();

    if (text.length < this.n) {
      // For very short strings, use the whole string as a single ngram
      if (text.length > 0) ngrams.add(text);
      return ngrams;
    }

    for (let i = 0; i <= text.length - this.n; i++) {
      ngrams.add(text.substring(i, i + this.n));
    }

    return ngrams;
  }
}

// ─── Standalone function version (for simple one-off use) ────

export function extractNgrams(text: string, n: number = 3): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length < n) return normalized.length > 0 ? [normalized] : [];

  const ngrams: string[] = [];
  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.push(normalized.substring(i, i + n));
  }
  return ngrams;
}

export function ngramSimilarity(a: string, b: string, n: number = 3): number {
  const ngramsA = new Set(extractNgrams(a, n));
  const ngramsB = new Set(extractNgrams(b, n));

  if (ngramsA.size === 0 && ngramsB.size === 0) return 1.0;
  if (ngramsA.size === 0 || ngramsB.size === 0) return 0.0;

  let intersection = 0;
  for (const ng of ngramsA) {
    if (ngramsB.has(ng)) intersection++;
  }

  const union = ngramsA.size + ngramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}