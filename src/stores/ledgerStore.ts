import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  Party,
  UploadedFile,
  LedgerEntry,
  LedgerSummary,
  ColumnMap,
  NumberFormatConfig,
  ParsedPage,
  OcrProgress,
} from '@/types';

// ─── Ledger data state ────────────────────────────────────────

interface LedgerState {
  // Files
  fileA: UploadedFile | null;
  fileB: UploadedFile | null;
  setFile: (party: Party, file: UploadedFile | null) => void;
  clearFile: (party: Party) => void;

  // OCR Progress
  ocrProgressA: OcrProgress | null;
  ocrProgressB: OcrProgress | null;
  setOcrProgress: (party: Party, progress: OcrProgress | null) => void;

  // Parsed pages (intermediate — before entry extraction)
  parsedPagesA: ParsedPage[];
  parsedPagesB: ParsedPage[];
  setParsedPages: (party: Party, pages: ParsedPage[]) => void;

  // Column maps (auto-detected or user-overridden)
  columnMapA: ColumnMap | null;
  columnMapB: ColumnMap | null;
  setColumnMap: (party: Party, map: ColumnMap) => void;

  // Number format (auto-detected or user-overridden)
  numberFormatA: NumberFormatConfig | null;
  numberFormatB: NumberFormatConfig | null;
  setNumberFormat: (party: Party, config: NumberFormatConfig) => void;

  // Final parsed entries
  entriesA: LedgerEntry[];
  entriesB: LedgerEntry[];
  setEntries: (party: Party, entries: LedgerEntry[]) => void;
  updateEntry: (entryId: string, updates: Partial<LedgerEntry>) => void;

  // Summaries
  summaryA: LedgerSummary | null;
  summaryB: LedgerSummary | null;
  setSummary: (party: Party, summary: LedgerSummary) => void;

  // Status
  isFileUploaded: (party: Party) => boolean;
  isOcrComplete: (party: Party) => boolean;
  areBothLedgersParsed: () => boolean;

  // Reset
  resetParty: (party: Party) => void;
  resetAll: () => void;
}

export const useLedgerStore = create<LedgerState>()(
  devtools(
    (set, get) => ({
      // ─── Files ────────────────────────
      fileA: null,
      fileB: null,

      setFile: (party, file) => {
        if (party === 'A') set({ fileA: file });
        else set({ fileB: file });
      },

      clearFile: (party) => {
        get().resetParty(party);
      },

      // ─── OCR Progress ────────────────
      ocrProgressA: null,
      ocrProgressB: null,

      setOcrProgress: (party, progress) => {
        if (party === 'A') set({ ocrProgressA: progress });
        else set({ ocrProgressB: progress });
      },

      // ─── Parsed Pages ────────────────
      parsedPagesA: [],
      parsedPagesB: [],

      setParsedPages: (party, pages) => {
        if (party === 'A') set({ parsedPagesA: pages });
        else set({ parsedPagesB: pages });
      },

      // ─── Column Maps ─────────────────
      columnMapA: null,
      columnMapB: null,

      setColumnMap: (party, map) => {
        if (party === 'A') set({ columnMapA: map });
        else set({ columnMapB: map });
      },

      // ─── Number Format ───────────────
      numberFormatA: null,
      numberFormatB: null,

      setNumberFormat: (party, config) => {
        if (party === 'A') set({ numberFormatA: config });
        else set({ numberFormatB: config });
      },

      // ─── Entries ─────────────────────
      entriesA: [],
      entriesB: [],

      setEntries: (party, entries) => {
        if (party === 'A') set({ entriesA: entries });
        else set({ entriesB: entries });
      },

      updateEntry: (entryId, updates) => {
        set((state) => {
          const updateList = (list: LedgerEntry[]) =>
            list.map((e) => (e.id === entryId ? { ...e, ...updates } : e));
          return {
            entriesA: updateList(state.entriesA),
            entriesB: updateList(state.entriesB),
          };
        });
      },

      // ─── Summaries ───────────────────
      summaryA: null,
      summaryB: null,

      setSummary: (party, summary) => {
        if (party === 'A') set({ summaryA: summary });
        else set({ summaryB: summary });
      },

      // ─── Status ──────────────────────
      isFileUploaded: (party) => {
        return party === 'A' ? get().fileA !== null : get().fileB !== null;
      },

      isOcrComplete: (party) => {
        const entries = party === 'A' ? get().entriesA : get().entriesB;
        return entries.length > 0;
      },

      areBothLedgersParsed: () => {
        return get().entriesA.length > 0 && get().entriesB.length > 0;
      },

      // ─── Reset ───────────────────────
      resetParty: (party) => {
        if (party === 'A') {
          set({
            fileA: null,
            ocrProgressA: null,
            parsedPagesA: [],
            columnMapA: null,
            numberFormatA: null,
            entriesA: [],
            summaryA: null,
          });
        } else {
          set({
            fileB: null,
            ocrProgressB: null,
            parsedPagesB: [],
            columnMapB: null,
            numberFormatB: null,
            entriesB: [],
            summaryB: null,
          });
        }
      },

      resetAll: () => {
        set({
          fileA: null,
          fileB: null,
          ocrProgressA: null,
          ocrProgressB: null,
          parsedPagesA: [],
          parsedPagesB: [],
          columnMapA: null,
          columnMapB: null,
          numberFormatA: null,
          numberFormatB: null,
          entriesA: [],
          entriesB: [],
          summaryA: null,
          summaryB: null,
        });
      },
    }),
    { name: 'ledger-store' }
  )
);