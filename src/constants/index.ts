/**
 * Application-wide constants
 */

// ─── File handling ────────────────────────────────────────────
export const SUPPORTED_FILE_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/tiff': ['.tiff', '.tif'],
  'image/webp': ['.webp'],
  'image/bmp': ['.bmp'],
  'text/csv': ['.csv'],
};

export const SUPPORTED_EXTENSIONS = [
  '.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif',
  '.webp', '.bmp', '.csv',
];

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_PAGES_PER_FILE = 200;

// ─── OCR ──────────────────────────────────────────────────────
export const OCR_CONFIDENCE_HIGH = 90;
export const OCR_CONFIDENCE_MEDIUM = 70;
export const OCR_CONFIDENCE_LOW = 50;
export const OCR_MIN_USABLE_CONFIDENCE = 40;

export const TESSERACT_LANGUAGE = 'eng';
export const TESSERACT_DPI = 300;

// ─── Matching ─────────────────────────────────────────────────
export const MATCH_CONFIDENCE_EXACT = 100;
export const MATCH_CONFIDENCE_AMOUNT_DATE_HIGH = 95;
export const MATCH_CONFIDENCE_AMOUNT_DATE_LOW = 70;
export const MATCH_CONFIDENCE_FUZZY_HIGH = 90;
export const MATCH_CONFIDENCE_FUZZY_LOW = 65;
export const MATCH_CONFIDENCE_SPLIT = 80;

export const DEFAULT_DATE_TOLERANCE_DAYS = 3;
export const DEFAULT_AMOUNT_TOLERANCE_PERCENT = 0.001;
export const DEFAULT_AMOUNT_TOLERANCE_FIXED = 0.05;
export const DEFAULT_DESCRIPTION_THRESHOLD = 0.82;
export const DEFAULT_SPLIT_MAX_N = 5;
export const DEFAULT_SPLIT_TIME_LIMIT_MS = 200;

export const MAX_DATE_TOLERANCE_DAYS = 30;
export const MAX_AMOUNT_TOLERANCE_PERCENT = 0.05;
export const MAX_DESCRIPTION_THRESHOLD = 1.0;
export const MIN_DESCRIPTION_THRESHOLD = 0.50;

// ─── Parsing ──────────────────────────────────────────────────
export const DATE_FORMATS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
  'DD-MM-YYYY',
  'DD/MM/YY',
  'MM/DD/YY',
  'DD-MMM-YYYY',    // 15-Jan-2024
  'MMM DD, YYYY',   // Jan 15, 2024
  'DD MMM YYYY',    // 15 Jan 2024
  'YYYY/MM/DD',
] as const;

export type DateFormatType = (typeof DATE_FORMATS)[number];

export const CURRENCY_SYMBOLS = ['$', '£', '€', '₹', '¥', '₩', 'R'] as const;

export const HEADER_KEYWORDS = {
  date: ['date', 'day', 'txn date', 'transaction date', 'value date', 'posting date'],
  description: ['description', 'narration', 'particulars', 'details', 'memo', 'narrative', 'remarks'],
  debit: ['debit', 'dr', 'dr.', 'withdrawal', 'withdrawals', 'money out', 'paid out', 'charges'],
  credit: ['credit', 'cr', 'cr.', 'deposit', 'deposits', 'money in', 'paid in', 'receipts'],
  amount: ['amount', 'sum', 'value'],
  balance: ['balance', 'running balance', 'closing balance', 'available balance'],
  reference: ['ref', 'reference', 'ref no', 'ref.', 'chq no', 'cheque no', 'check no', 'txn id', 'transaction id'],
} as const;

export const SKIP_ROW_PATTERNS = [
  /^\s*$/,                                         // empty
  /^page\s+\d+\s+(of|\/)\s+\d+/i,                // page numbers
  /continued\s+(on|from)/i,                        // continuation markers
  /\b(sub\s?total|total|balance\s+(c\/f|b\/f|carried|brought))\b/i,
  /^-{3,}$/,                                       // horizontal rules
  /^={3,}$/,
  /^\*{3,}$/,
  /opening\s+balance/i,
  /closing\s+balance/i,
  /statement\s+(period|date|ending)/i,
  /account\s+(number|no|holder|name)/i,
  /branch\s*(name|code)?/i,
  /ifsc|swift|sort\s*code|routing/i,
] as const;

// ─── UI ───────────────────────────────────────────────────────
export const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: 'Exact Match',
  amount_date: 'Amount + Date',
  fuzzy: 'Fuzzy Match',
  split: 'Split Transaction',
  unmatched_a: 'Only in Ledger A',
  unmatched_b: 'Only in Ledger B',
  duplicate: 'Duplicate',
};

export const MATCH_TYPE_COLORS: Record<string, string> = {
  exact: 'bg-matched-light border-matched text-matched',
  amount_date: 'bg-matched-light border-matched text-matched',
  fuzzy: 'bg-partial-light border-partial text-partial',
  split: 'bg-split-light border-split text-split',
  unmatched_a: 'bg-onlya-light border-onlya text-onlya',
  unmatched_b: 'bg-onlyb-light border-onlyb text-onlyb',
  duplicate: 'bg-duplicate-light border-duplicate text-duplicate',
};

export const MATCH_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  resolved: 'Resolved',
  disputed: 'Disputed',
  ignored: 'Ignored',
};

export const MATCH_STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  disputed: 'bg-red-100 text-red-800',
  ignored: 'bg-gray-100 text-gray-600',
};

// ─── Keyboard shortcuts ──────────────────────────────────────
export const KEYBOARD_SHORTCUTS = {
  NAVIGATE_UP: 'ArrowUp',
  NAVIGATE_DOWN: 'ArrowDown',
  OPEN_DETAIL: 'Enter',
  CLOSE_DETAIL: 'Escape',
  MARK_RESOLVED: 'r',
  MARK_DISPUTED: 'd',
  MARK_IGNORED: 'i',
  SEARCH: 'f',            // with Ctrl/Cmd
  EXPORT: 'e',            // with Ctrl/Cmd
  SWITCH_TAB: 'Tab',
  SHOW_SHORTCUTS: '?',
  TOGGLE_FILTER: '/',
} as const;

// ─── Application views/steps ──────────────────────────────────
export type AppStep =
  | 'upload'
  | 'ocr_review'
  | 'configure'
  | 'matching'
  | 'results'
  | 'export';

export const APP_STEPS: { key: AppStep; label: string; description: string }[] = [
  { key: 'upload', label: 'Upload', description: 'Upload ledger files' },
  { key: 'ocr_review', label: 'Review OCR', description: 'Verify parsed data' },
  { key: 'configure', label: 'Configure', description: 'Set matching rules' },
  { key: 'matching', label: 'Match', description: 'Run matching engine' },
  { key: 'results', label: 'Results', description: 'Review matches' },
  { key: 'export', label: 'Export', description: 'Export results' },
];