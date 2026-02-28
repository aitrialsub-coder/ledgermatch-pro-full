import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  MatchingConfig,
  MatchGroup,
  MatchResult,
  MatchSummary,
  MatchingProgress,
  MatchStatus,
  MatchComment,
  ResultFilter,
  ResultSort,
  AmbiguousMatch,
} from '@/types';
import { DEFAULT_MATCHING_CONFIG } from '@/types/matching';

// ─── Match results state ──────────────────────────────────────

interface MatchState {
  // Configuration
  config: MatchingConfig;
  setConfig: (config: Partial<MatchingConfig>) => void;
  resetConfig: () => void;

  // Progress (during matching)
  progress: MatchingProgress | null;
  setProgress: (progress: MatchingProgress | null) => void;
  isMatching: boolean;
  setIsMatching: (v: boolean) => void;

  // Results
  result: MatchResult | null;
  setResult: (result: MatchResult | null) => void;
  matchGroups: MatchGroup[];
  summary: MatchSummary | null;

  // Ambiguous matches needing user resolution
  ambiguousMatches: AmbiguousMatch[];
  setAmbiguousMatches: (matches: AmbiguousMatch[]) => void;
  resolveAmbiguous: (entryId: string, selectedCandidateId: string) => void;

  // Match group operations
  updateMatchStatus: (matchGroupId: string, status: MatchStatus) => void;
  addComment: (matchGroupId: string, comment: Omit<MatchComment, 'id' | 'createdAt'>) => void;

  // Filtering & sorting
  activeFilter: ResultFilter;
  activeSort: ResultSort;
  searchQuery: string;
  setFilter: (filter: ResultFilter) => void;
  setSort: (sort: ResultSort) => void;
  setSearchQuery: (query: string) => void;
  getFilteredGroups: () => MatchGroup[];

  // Selected row for detail view
  selectedRowIndex: number;
  setSelectedRowIndex: (index: number) => void;
  moveSelection: (direction: 'up' | 'down') => void;

  // History of past runs
  runHistory: MatchRunRecord[];
  addRunToHistory: (run: MatchRunRecord) => void;

  // Reset
  resetResults: () => void;
  resetAll: () => void;
}

export interface MatchRunRecord {
  id: string;
  config: MatchingConfig;
  summary: MatchSummary;
  completedAt: number;
  fileNameA: string;
  fileNameB: string;
}

export const useMatchStore = create<MatchState>()(
  devtools(
    (set, get) => ({
      // ─── Configuration ───────────────
      config: { ...DEFAULT_MATCHING_CONFIG },

      setConfig: (partial) => {
        set((state) => ({
          config: { ...state.config, ...partial },
        }));
      },

      resetConfig: () => {
        set({ config: { ...DEFAULT_MATCHING_CONFIG } });
      },

      // ─── Progress ────────────────────
      progress: null,
      setProgress: (progress) => set({ progress }),
      isMatching: false,
      setIsMatching: (v) => set({ isMatching: v }),

      // ─── Results ─────────────────────
      result: null,

      setResult: (result) => {
        set({
          result,
          matchGroups: result?.matchGroups ?? [],
          summary: result?.summary ?? null,
        });
      },

      matchGroups: [],
      summary: null,

      // ─── Ambiguous ───────────────────
      ambiguousMatches: [],
      setAmbiguousMatches: (matches) => set({ ambiguousMatches: matches }),

      resolveAmbiguous: (entryId, selectedCandidateId) => {
        set((state) => ({
          ambiguousMatches: state.ambiguousMatches.filter(
            (am) => am.entryId !== entryId
          ),
        }));
        // The actual match creation is handled by the matching engine
        // This just removes the ambiguous marker from UI
      },

      // ─── Match group operations ──────
      updateMatchStatus: (matchGroupId, status) => {
        set((state) => ({
          matchGroups: state.matchGroups.map((mg) =>
            mg.id === matchGroupId ? { ...mg, status } : mg
          ),
        }));
      },

      addComment: (matchGroupId, comment) => {
        const fullComment: MatchComment = {
          ...comment,
          id: crypto.randomUUID(),
          matchGroupId,
          createdAt: Date.now(),
        };
        set((state) => ({
          matchGroups: state.matchGroups.map((mg) =>
            mg.id === matchGroupId
              ? { ...mg, comments: [...mg.comments, fullComment] }
              : mg
          ),
        }));
      },

      // ─── Filtering & Sorting ─────────
      activeFilter: 'all',
      activeSort: 'date_asc',
      searchQuery: '',

      setFilter: (filter) => set({ activeFilter: filter }),
      setSort: (sort) => set({ activeSort: sort }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      getFilteredGroups: () => {
        const { matchGroups, activeFilter, activeSort, searchQuery } = get();
        let filtered = [...matchGroups];

        // Apply filter
        switch (activeFilter) {
          case 'matched':
            filtered = filtered.filter((mg) =>
              ['exact', 'amount_date', 'fuzzy'].includes(mg.matchType)
            );
            break;
          case 'unmatched':
            filtered = filtered.filter((mg) =>
              ['unmatched_a', 'unmatched_b'].includes(mg.matchType)
            );
            break;
          case 'unmatched_a':
            filtered = filtered.filter((mg) => mg.matchType === 'unmatched_a');
            break;
          case 'unmatched_b':
            filtered = filtered.filter((mg) => mg.matchType === 'unmatched_b');
            break;
          case 'partial':
            filtered = filtered.filter((mg) => mg.matchType === 'fuzzy');
            break;
          case 'split':
            filtered = filtered.filter((mg) => mg.matchType === 'split');
            break;
          case 'duplicate':
            filtered = filtered.filter((mg) => mg.matchType === 'duplicate');
            break;
          case 'disputed':
            filtered = filtered.filter((mg) => mg.status === 'disputed');
            break;
          case 'low_confidence':
            filtered = filtered.filter((mg) => mg.confidence < 70);
            break;
          case 'all':
          default:
            break;
        }

        // Apply search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          filtered = filtered.filter(
            (mg) =>
              mg.matchReason.toLowerCase().includes(q) ||
              mg.id.toLowerCase().includes(q)
          );
        }

        // Apply sort
        filtered.sort((a, b) => {
          switch (activeSort) {
            case 'confidence_asc':
              return a.confidence - b.confidence;
            case 'confidence_desc':
              return b.confidence - a.confidence;
            case 'amount_asc':
              return a.amountDifference - b.amountDifference;
            case 'amount_desc':
              return b.amountDifference - a.amountDifference;
            case 'date_desc':
              return b.createdAt - a.createdAt;
            case 'status':
              return a.status.localeCompare(b.status);
            case 'date_asc':
            default:
              return a.createdAt - b.createdAt;
          }
        });

        return filtered;
      },

      // ─── Selection ───────────────────
      selectedRowIndex: -1,
      setSelectedRowIndex: (index) => set({ selectedRowIndex: index }),

      moveSelection: (direction) => {
        const filtered = get().getFilteredGroups();
        const current = get().selectedRowIndex;
        const maxIndex = filtered.length - 1;

        if (direction === 'up') {
          set({ selectedRowIndex: Math.max(0, current - 1) });
        } else {
          set({ selectedRowIndex: Math.min(maxIndex, current + 1) });
        }
      },

      // ─── History ─────────────────────
      runHistory: [],

      addRunToHistory: (run) => {
        set((state) => ({
          runHistory: [run, ...state.runHistory].slice(0, 50), // keep last 50
        }));
      },

      // ─── Reset ───────────────────────
      resetResults: () => {
        set({
          result: null,
          matchGroups: [],
          summary: null,
          progress: null,
          isMatching: false,
          ambiguousMatches: [],
          activeFilter: 'all',
          activeSort: 'date_asc',
          searchQuery: '',
          selectedRowIndex: -1,
        });
      },

      resetAll: () => {
        get().resetResults();
        get().resetConfig();
        set({ runHistory: [] });
      },
    }),
    { name: 'match-store' }
  )
);