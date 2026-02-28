/**
 * Matching engine types — all 5 passes + configuration
 */

// ─── Match types ──────────────────────────────────────────────
export type MatchType =
  | 'exact'           // Pass 1: hash match
  | 'amount_date'     // Pass 2: amount + date window
  | 'fuzzy'           // Pass 3: description similarity
  | 'split'           // Pass 4: one-to-many amount sum
  | 'unmatched_a'     // Pass 5: only in ledger A
  | 'unmatched_b'     // Pass 5: only in ledger B
  | 'duplicate';      // Pass 5: duplicate on same side

export type MatchStatus =
  | 'open'
  | 'resolved'
  | 'disputed'
  | 'ignored';

export type PolarityMode =
  | 'same_sign'        // both ledgers use same sign convention
  | 'opposite_sign'    // bank vs company books (most common)
  | 'absolute'         // ignore sign, match on |amount|
  | 'auto_detect';     // infer from first N entries

// ─── Matching configuration ───────────────────────────────────
export interface MatchingConfig {
  // Date tolerance
  dateToleranceDays: number;            // default: 3

  // Amount tolerance
  amountToleranceMode: 'percent' | 'fixed' | 'both';
  amountTolerancePercent: number;       // default: 0.001 (0.1%)
  amountToleranceFixed: number;         // default: 0.05

  // Description matching
  descriptionThreshold: number;         // default: 0.82 (Jaro-Winkler + token sort)
  descriptionWeight: {
    jaroWinkler: number;                // default: 0.4
    tokenSort: number;                  // default: 0.3
    tokenContainment: number;           // default: 0.3
  };

  // Polarity
  polarityMode: PolarityMode;          // default: 'opposite_sign'

  // Pass control
  enabledPasses: number[];             // default: [1, 2, 3, 4, 5]

  // Split match
  splitMaxEntries: number;              // default: 5
  splitTimeLimitMs: number;             // default: 200

  // Currency
  currency: string;                     // default: 'USD'
  fxRate?: number;                      // manual FX rate for cross-currency

  // Advanced
  ignoreDescriptionInExact: boolean;    // default: false
  caseSensitiveRef: boolean;            // default: false
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  dateToleranceDays: 3,
  amountToleranceMode: 'both',
  amountTolerancePercent: 0.001,
  amountToleranceFixed: 0.05,
  descriptionThreshold: 0.82,
  descriptionWeight: {
    jaroWinkler: 0.4,
    tokenSort: 0.3,
    tokenContainment: 0.3,
  },
  polarityMode: 'opposite_sign',
  enabledPasses: [1, 2, 3, 4, 5],
  splitMaxEntries: 5,
  splitTimeLimitMs: 200,
  currency: 'USD',
  ignoreDescriptionInExact: false,
  caseSensitiveRef: false,
};

// ─── Match result ─────────────────────────────────────────────
export interface MatchGroup {
  id: string;
  matchType: MatchType;
  confidence: number;         // 0-100
  matchReason: string;        // human-readable explanation
  status: MatchStatus;
  entriesA: string[];         // entry IDs from ledger A
  entriesB: string[];         // entry IDs from ledger B
  amountDifference: number;   // |sum_A - sum_B| — 0 for exact
  dateDifference: number;     // days between dates (avg if split)
  descriptionSimilarity: number; // 0-1 for passes that check description
  passNumber: number;          // which pass created this match
  createdAt: number;

  // Annotations
  comments: MatchComment[];
}

export interface MatchComment {
  id: string;
  matchGroupId: string;
  text: string;
  createdBy: string;          // user ID or 'local'
  createdAt: number;
}

// ─── Match result aggregates ──────────────────────────────────
export interface MatchResult {
  sessionId: string;
  config: MatchingConfig;
  matchGroups: MatchGroup[];
  summary: MatchSummary;
  processingTimeMs: number;
  completedAt: number;
}

export interface MatchSummary {
  totalEntriesA: number;
  totalEntriesB: number;
  matchedCount: number;
  unmatchedACount: number;
  unmatchedBCount: number;
  partialCount: number;
  splitCount: number;
  duplicateCount: number;

  matchRate: number;              // 0-1

  totalAmountA: number;
  totalAmountB: number;
  totalDiscrepancy: number;       // |A - B|
  matchedAmount: number;
  unmatchedAmountA: number;
  unmatchedAmountB: number;

  byPass: PassSummary[];
  averageConfidence: number;
  processingTimeMs: number;
}

export interface PassSummary {
  passNumber: number;
  passName: string;
  matchCount: number;
  averageConfidence: number;
  timeMs: number;
}

// ─── UI filter/sort ───────────────────────────────────────────
export type ResultFilter =
  | 'all'
  | 'matched'
  | 'unmatched'
  | 'unmatched_a'
  | 'unmatched_b'
  | 'partial'
  | 'split'
  | 'duplicate'
  | 'disputed'
  | 'low_confidence';

export type ResultSort =
  | 'date_asc'
  | 'date_desc'
  | 'amount_asc'
  | 'amount_desc'
  | 'confidence_asc'
  | 'confidence_desc'
  | 'status';

// ─── Matching engine events (for progress tracking) ───────────
export type MatchingPhase =
  | 'idle'
  | 'pass1_exact'
  | 'pass2_amount_date'
  | 'pass3_fuzzy'
  | 'pass4_split'
  | 'pass5_residue'
  | 'complete'
  | 'error';

export interface MatchingProgress {
  phase: MatchingPhase;
  passNumber: number;
  totalPasses: number;
  currentPassProgress: number;     // 0-1
  overallProgress: number;         // 0-1
  matchesFoundSoFar: number;
  timeElapsedMs: number;
  estimatedTimeRemainingMs: number;
  message: string;
}

// ─── Ambiguous match (needs user decision) ────────────────────
export interface AmbiguousMatch {
  entryId: string;
  party: 'A' | 'B';
  candidates: AmbiguousCandidate[];
}

export interface AmbiguousCandidate {
  entryId: string;
  confidence: number;
  matchReason: string;
  amountDifference: number;
  dateDifference: number;
  descriptionSimilarity: number;
}