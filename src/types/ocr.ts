/**
 * OCR pipeline types — preprocessing, recognition, parsing
 */

// ─── OCR pipeline stages ──────────────────────────────────────
export type OcrStage =
  | 'idle'
  | 'loading_file'
  | 'rendering_pdf'
  | 'preprocessing'
  | 'recognizing'
  | 'parsing'
  | 'validating'
  | 'complete'
  | 'error';

export interface OcrProgress {
  stage: OcrStage;
  party: 'A' | 'B';
  currentPage: number;
  totalPages: number;
  pageProgress: number;        // 0-1 within current page
  overallProgress: number;     // 0-1
  message: string;
  startedAt: number;
  estimatedTimeRemainingMs: number;
}

// ─── Tesseract output types ───────────────────────────────────
export interface OcrLine {
  text: string;
  confidence: number;          // 0-100
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  words: OcrWord[];
  baseline: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  isLowConfidence: boolean;
}

export interface OcrPageResult {
  pageNumber: number;
  lines: OcrLine[];
  fullText: string;
  averageConfidence: number;
  width: number;
  height: number;
  processingTimeMs: number;
}

// ─── Preprocessing config ─────────────────────────────────────
export interface PreprocessingConfig {
  enableDeskew: boolean;         // default: true
  enableDenoise: boolean;        // default: true
  enableThreshold: boolean;      // default: true
  enableCrop: boolean;           // default: true
  enableUpscale: boolean;        // default: true
  targetDpi: number;             // default: 300
  thresholdBlockSize: number;    // default: 11
  thresholdC: number;            // default: 2
  medianBlurKernel: number;      // default: 3
  maxSkewAngle: number;          // default: 15
}

export const DEFAULT_PREPROCESSING_CONFIG: PreprocessingConfig = {
  enableDeskew: true,
  enableDenoise: true,
  enableThreshold: true,
  enableCrop: true,
  enableUpscale: true,
  targetDpi: 300,
  thresholdBlockSize: 11,
  thresholdC: 2,
  medianBlurKernel: 3,
  maxSkewAngle: 15,
};

// ─── Offscreen document messages ──────────────────────────────
export type OffscreenMessageType =
  | 'OCR_INIT'
  | 'OCR_PROCESS_PAGE'
  | 'OCR_PROCESS_IMAGE'
  | 'OCR_CANCEL'
  | 'OCR_PROGRESS'
  | 'OCR_RESULT'
  | 'OCR_ERROR'
  | 'OCR_READY';

export interface OffscreenMessage {
  type: OffscreenMessageType;
  requestId: string;
  payload: unknown;
}

export interface OcrInitPayload {
  langPath: string;
  language: string;
}

export interface OcrProcessPagePayload {
  imageData: ImageData | ArrayBuffer;
  pageNumber: number;
  preprocessConfig: PreprocessingConfig;
}

export interface OcrResultPayload {
  requestId: string;
  pageResult: OcrPageResult;
}

export interface OcrErrorPayload {
  requestId: string;
  error: string;
  stage: OcrStage;
}

// ─── PDF rendering ────────────────────────────────────────────
export interface PdfPageRenderOptions {
  scale: number;              // default: 2.0 for ~300 DPI
  maxWidth: number;           // default: 4000px
  maxHeight: number;          // default: 6000px
}

export const DEFAULT_PDF_RENDER_OPTIONS: PdfPageRenderOptions = {
  scale: 2.0,
  maxWidth: 4000,
  maxHeight: 6000,
};