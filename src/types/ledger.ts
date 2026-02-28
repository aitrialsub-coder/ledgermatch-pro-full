/**
 * Ledger entry types — the core data model
 */

// ─── Party Identification ──────────────────────────────────────
export type Party = 'A' | 'B';

// ─── Raw file metadata ────────────────────────────────────────
export type SupportedFileType =
  | 'pdf'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'tiff'
  | 'webp'
  | 'bmp'
  | 'csv';

export interface UploadedFile {
  id: string;
  party: Party;
  name: string;
  type: SupportedFileType;
  size: number;
  mimeType: string;
  data: ArrayBuffer;
  uploadedAt: number; // timestamp ms
  pageCount?: number;
}

// ─── Parsed ledger entry ──────────────────────────────────────
export interface LedgerEntry {
  id: string;
  party: Party;
  rowIndex: number;         // original row position in document
  pageNumber: number;       // source page (1-indexed)

  // Parsed values
  date: string | null;       // ISO 8601: "2024-01-15"
  description: string;
  debit: number | null;      // always positive number or null
  credit: number | null;     // always positive number or null
  balance: number | null;
  refNumber: string | null;

  // Computed
  amount: number;           // signed: positive=credit, negative=debit
  amountAbs: number;        // |amount|
  amountCents: number;      // amount * 100, rounded to integer

  // Raw OCR data for review
  rawText: string;
  ocrConfidence: number;    // 0-100
  boundingBox?: BoundingBox;

  // Manual overrides
  manualOverrides?: ManualOverrides;

  // Metadata
  createdAt: number;
}

export interface ManualOverrides {
  date?: string;
  description?: string;
  debit?: number;
  credit?: number;
  balance?: number;
  refNumber?: string;
  overriddenAt?: number;
  overriddenFields: string[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
}

// ─── Column mapping ───────────────────────────────────────────
export type ColumnType =
  | 'date'
  | 'description'
  | 'debit'
  | 'credit'
  | 'amount'          // single column with signed amounts
  | 'balance'
  | 'reference'
  | 'ignore'
  | 'unknown';

export interface ColumnMapping {
  index: number;
  type: ColumnType;
  headerText: string;
  xStart: number;      // pixel position for OCR column alignment
  xEnd: number;
  confidence: number;  // how confident the auto-detection is (0-1)
}

export interface ColumnMap {
  columns: ColumnMapping[];
  dateColumnIndex: number;
  descriptionColumnIndex: number;
  debitColumnIndex: number;
  creditColumnIndex: number;
  amountColumnIndex: number;       // -1 if separate debit/credit
  balanceColumnIndex: number;
  referenceColumnIndex: number;
  amountStyle: AmountStyle;
}

export type AmountStyle =
  | 'separate_debit_credit'      // two columns: Debit | Credit
  | 'single_signed'             // one column: positive=credit, negative=debit
  | 'single_abs_with_indicator' // one column + DR/CR indicator
  | 'parenthetical_negative';   // (5000.00) = debit, 5000.00 = credit

// ─── Number format ────────────────────────────────────────────
export type NumberFormat = 'US' | 'EU' | 'IN' | 'AMBIGUOUS';

export interface NumberFormatConfig {
  format: NumberFormat;
  thousandSeparator: string;   // ',' for US, '.' for EU
  decimalSeparator: string;    // '.' for US, ',' for EU
  currencySymbol: string;      // '$', '£', '€', '₹'
  currencyPosition: 'prefix' | 'suffix';
}

// ─── Ledger template ──────────────────────────────────────────
export interface LedgerTemplate {
  id: string;
  name: string;                     // "Chase Checking Statement"
  bankName?: string;
  headerPatterns: string[];         // regex strings to identify this template
  columnMap: Partial<ColumnMap>;
  skipPatterns: string[];           // regex for rows to skip (headers, totals)
  amountStyle: AmountStyle;
  numberFormat: NumberFormat;
  dateFormat: string;               // "DD/MM/YYYY", "MM/DD/YYYY", etc.
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Parsed page ──────────────────────────────────────────────
export interface ParsedPage {
  pageNumber: number;
  rows: ParsedRow[];
  headerRow: ParsedRow | null;
  columnMap: ColumnMap | null;
  ocrConfidence: number;
  rawText: string;
}

export interface ParsedRow {
  rowIndex: number;
  pageNumber: number;
  cells: ParsedCell[];
  rawText: string;
  isHeader: boolean;
  isFooter: boolean;
  isSubtotal: boolean;
  isEmpty: boolean;
  confidence: number;
}

export interface ParsedCell {
  text: string;
  columnIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

// ─── Ledger summary stats ─────────────────────────────────────
export interface LedgerSummary {
  party: Party;
  fileName: string;
  totalRows: number;
  validRows: number;
  skippedRows: number;
  lowConfidenceRows: number;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
  ocrAverageConfidence: number;
}