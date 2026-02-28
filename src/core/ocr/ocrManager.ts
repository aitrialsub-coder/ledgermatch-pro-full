/**
 * OCR Manager — Top-level orchestrator for the OCR pipeline
 * 
 * Coordinates:
 * 1. File type detection
 * 2. PDF rendering or image loading
 * 3. OpenCV preprocessing
 * 4. Tesseract OCR (via offscreen document)
 * 5. Multi-page merging
 * 6. Column detection and entry parsing
 * 7. Summary generation
 * 
 * Reports progress at each stage.
 */

import type {
  Party,
  UploadedFile,
  LedgerEntry,
  LedgerSummary,
  ColumnMap,
  NumberFormatConfig,
  OcrProgress,
  OcrPageResult,
  PreprocessingConfig,
} from '@/types';
import { DEFAULT_PREPROCESSING_CONFIG } from '@/types/ocr';
import {
  loadPdfDocument,
  isPdfDigital,
  processPages,
  destroyPdfDocument,
} from './pdfProcessor';
import { preprocessImage, preprocessImageFallback, isOpenCvAvailable } from './opencvPreprocessor';
import { recognizeImage, initTesseractWorker, terminateWorker } from './tesseractWorker';
import { mergeMultiPageTable } from './multiPageMerger';
import { detectColumns } from '../parsers/columnDetector';
import { detectNumberFormat, detectCurrencySymbol } from '../parsers/numberFormatDetector';
import { detectDateFormat } from '../parsers/dateParser';
import {
  classifyRows,
  parseRowsToEntries,
  mergeMultiPageEntries,
  buildLedgerSummary,
} from '../parsers/rowValidator';
import { parseCsvFile } from '../parsers/csvParser';

// ─── Processing result ───────────────────────────────────────

export interface OcrProcessingResult {
  entries: LedgerEntry[];
  columnMap: ColumnMap;
  numberFormat: NumberFormatConfig;
  dateFormat: string;
  summary: LedgerSummary;
  warnings: string[];
  totalProcessingTimeMs: number;
}

// ─── Progress callback ───────────────────────────────────────

export type OcrProgressCallback = (progress: OcrProgress) => void;

// ─── Main processing function ────────────────────────────────

export async function processFile(
  file: UploadedFile,
  preprocessConfig: PreprocessingConfig = DEFAULT_PREPROCESSING_CONFIG,
  onProgress?: OcrProgressCallback
): Promise<OcrProcessingResult> {
  const startTime = performance.now();
  const warnings: string[] = [];

  // Route by file type
  if (file.type === 'csv') {
    return processCSV(file, onProgress);
  }

  if (file.type === 'pdf') {
    return processPDF(file, preprocessConfig, onProgress, warnings);
  }

  // Image files (PNG, JPG, TIFF, etc.)
  return processImage(file, preprocessConfig, onProgress, warnings);
}

// ─── CSV processing (no OCR needed) ──────────────────────────

async function processCSV(
  file: UploadedFile,
  onProgress?: OcrProgressCallback
): Promise<OcrProcessingResult> {
  const startTime = performance.now();

  reportProgress(onProgress, file.party, 'parsing', 1, 1, 0.5, 'Parsing CSV...');

  const csvText = new TextDecoder().decode(file.data);
  const result = parseCsvFile(csvText, file.party, file.name);

  reportProgress(onProgress, file.party, 'complete', 1, 1, 1.0, 'CSV parsed');

  return {
    entries: result.entries,
    columnMap: result.columnMap,
    numberFormat: result.numberFormat,
    dateFormat: result.dateFormat,
    summary: result.summary,
    warnings: result.warnings,
    totalProcessingTimeMs: performance.now() - startTime,
  };
}

// ─── PDF processing ─────────────────────────────────────────

async function processPDF(
  file: UploadedFile,
  preprocessConfig: PreprocessingConfig,
  onProgress?: OcrProgressCallback,
  warnings: string[] = []
): Promise<OcrProcessingResult> {
  const startTime = performance.now();

  // Load PDF
  reportProgress(
    onProgress, file.party, 'loading_file', 0, 1, 0.05,
    'Loading PDF...'
  );
  const { document, pageCount } = await loadPdfDocument(file.data);

  // Check if digital or scanned
  const digitalCheck = await isPdfDigital(document);

  if (digitalCheck.isDigital) {
    // Fast path: text extraction
    return processDigitalPDF(
      document, file, pageCount, onProgress, startTime, warnings
    );
  }

  // Slow path: OCR
  return processScannedPDF(
    document, file, pageCount, preprocessConfig, onProgress, startTime, warnings
  );
}

async function processDigitalPDF(
  document: import('pdfjs-dist').PDFDocumentProxy,
  file: UploadedFile,
  pageCount: number,
  onProgress?: OcrProgressCallback,
  startTime: number = performance.now(),
  warnings: string[] = []
): Promise<OcrProcessingResult> {
  const allPageResults: OcrPageResult[] = [];

  for await (const pageResult of processPages(document, undefined, (current, total) => {
    reportProgress(
      onProgress, file.party, 'recognizing',
      current, total,
      current / total * 0.7,
      `Extracting text from page ${current}/${total}...`
    );
  })) {
    allPageResults.push({
      pageNumber: pageResult.pageNumber,
      lines: pageResult.lines.map((text) => ({
        text,
        confidence: 99,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
        words: text.split(/\s+/).map((w) => ({
          text: w,
          confidence: 99,
          bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
          isLowConfidence: false,
        })),
        baseline: { x0: 0, y0: 0, x1: 0, y1: 0 },
      })),
      fullText: pageResult.lines.join('\n'),
      averageConfidence: 99,
      width: 0,
      height: 0,
      processingTimeMs: pageResult.processingTimeMs,
    });
  }

  destroyPdfDocument(document);

  return finalizeResults(
    allPageResults, file, startTime, warnings, onProgress
  );
}

async function processScannedPDF(
  document: import('pdfjs-dist').PDFDocumentProxy,
  file: UploadedFile,
  pageCount: number,
  preprocessConfig: PreprocessingConfig,
  onProgress?: OcrProgressCallback,
  startTime: number = performance.now(),
  warnings: string[] = []
): Promise<OcrProcessingResult> {
  // Ensure Tesseract is ready
  reportProgress(
    onProgress, file.party, 'preprocessing', 0, pageCount, 0.05,
    'Initializing OCR engine...'
  );
  await initTesseractWorker();

  const allPageResults: OcrPageResult[] = [];

  // Process page by page (streaming — memory safe)
  const { renderPdfPage } = await import('./pdfProcessor');

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const pageProgress = (pageNum - 1) / pageCount;

    // ── Render page to canvas ──
    reportProgress(
      onProgress, file.party, 'rendering_pdf',
      pageNum, pageCount,
      pageProgress + 0.1 / pageCount,
      `Rendering page ${pageNum}/${pageCount}...`
    );

    const rendered = await renderPdfPage(document, pageNum);

    // ── Get ImageData ──
    const ctx = rendered.canvas.getContext('2d');
    if (!ctx) {
      warnings.push(`Failed to get canvas context for page ${pageNum}`);
      rendered.canvas.width = 0;
      rendered.canvas.height = 0;
      continue;
    }

    let imageData = ctx.getImageData(
      0, 0, rendered.canvas.width, rendered.canvas.height
    );

    // Release original canvas immediately
    rendered.canvas.width = 0;
    rendered.canvas.height = 0;

    // ── Preprocess ──
    reportProgress(
      onProgress, file.party, 'preprocessing',
      pageNum, pageCount,
      pageProgress + 0.3 / pageCount,
      `Preprocessing page ${pageNum}/${pageCount}...`
    );

    try {
      if (isOpenCvAvailable()) {
        const preprocessed = await preprocessImage(imageData, preprocessConfig);
        imageData = preprocessed.imageData;
      } else {
        imageData = preprocessImageFallback(imageData);
        if (pageNum === 1) {
          warnings.push('OpenCV.js not available — using basic preprocessing.');
        }
      }
    } catch (err) {
      warnings.push(`Preprocessing failed for page ${pageNum}: ${err}`);
      // Continue with unprocessed image
    }

    // ── OCR ──
    reportProgress(
      onProgress, file.party, 'recognizing',
      pageNum, pageCount,
      pageProgress + 0.5 / pageCount,
      `OCR on page ${pageNum}/${pageCount}...`
    );

    try {
      const ocrResult = await recognizeImage(imageData, pageNum);
      ocrResult.width = imageData.width;
      ocrResult.height = imageData.height;
      allPageResults.push(ocrResult);
    } catch (err) {
      warnings.push(`OCR failed for page ${pageNum}: ${err}`);
    }

    // Yield to event loop
    await new Promise((r) => setTimeout(r, 0));
  }

  destroyPdfDocument(document);

  return finalizeResults(
    allPageResults, file, startTime, warnings, onProgress
  );
}

// ─── Image processing ────────────────────────────────────────

async function processImage(
  file: UploadedFile,
  preprocessConfig: PreprocessingConfig,
  onProgress?: OcrProgressCallback,
  warnings: string[] = []
): Promise<OcrProcessingResult> {
  const startTime = performance.now();

  // Load image into ImageData
  reportProgress(
    onProgress, file.party, 'loading_file', 1, 1, 0.1,
    'Loading image...'
  );

  const imageData = await loadImageFile(file.data, file.mimeType);

  // Preprocess
  reportProgress(
    onProgress, file.party, 'preprocessing', 1, 1, 0.3,
    'Preprocessing image...'
  );

  let processedData = imageData;
  try {
    if (isOpenCvAvailable()) {
      const preprocessed = await preprocessImage(imageData, preprocessConfig);
      processedData = preprocessed.imageData;
    } else {
      processedData = preprocessImageFallback(imageData);
      warnings.push('OpenCV.js not available — using basic preprocessing.');
    }
  } catch (err) {
    warnings.push(`Preprocessing failed: ${err}`);
  }

  // OCR
  reportProgress(
    onProgress, file.party, 'recognizing', 1, 1, 0.5,
    'Running OCR...'
  );

  await initTesseractWorker();
  const ocrResult = await recognizeImage(processedData, 1);
  ocrResult.width = processedData.width;
  ocrResult.height = processedData.height;

  return finalizeResults(
    [ocrResult], file, startTime, warnings, onProgress
  );
}

// ─── Load image file to ImageData ────────────────────────────

async function loadImageFile(
  data: ArrayBuffer,
  mimeType: string
): Promise<ImageData> {
  const blob = new Blob([data], { type: mimeType });
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Release canvas
  canvas.width = 0;
  canvas.height = 0;

  return imageData;
}

// ─── Finalize: merge pages → detect columns → parse entries ──

async function finalizeResults(
  pageResults: OcrPageResult[],
  file: UploadedFile,
  startTime: number,
  warnings: string[],
  onProgress?: OcrProgressCallback
): Promise<OcrProcessingResult> {
  reportProgress(
    onProgress, file.party, 'parsing', 1, 1, 0.8,
    'Parsing table structure...'
  );

  // Merge multi-page results
  const merged = mergeMultiPageTable(pageResults);

  if (merged.lines.length === 0) {
    warnings.push('No text lines detected after merging pages.');
    return emptyProcessingResult(file, startTime, warnings);
  }

  // Detect columns
  const pageWidth = pageResults[0]?.width ?? 2000;
  const columnDetection = detectColumns(merged.lines, pageWidth);
  warnings.push(...columnDetection.warnings);

  // Detect number format
  const amountTexts = extractAmountTextsFromLines(merged.lines, columnDetection.columnMap);
  const numberFormatResult = detectNumberFormat(amountTexts);

  // Detect date format
  const dateTexts = extractDateTextsFromLines(merged.lines, columnDetection.columnMap);
  const dateFormatResult = detectDateFormat(dateTexts);

  if (dateFormatResult.ambiguous) {
    warnings.push(
      `Date format ambiguous (DD/MM vs MM/DD). Using ${dateFormatResult.format}. Override in settings.`
    );
  }

  // Classify rows and parse into entries
  reportProgress(
    onProgress, file.party, 'validating', 1, 1, 0.9,
    'Validating entries...'
  );

  const classified = classifyRows(merged.lines, columnDetection.headerRowIndex);
  const entries = parseRowsToEntries(
    classified,
    columnDetection.columnMap,
    file.party,
    1, // page number (already merged)
    numberFormatResult.config,
    dateFormatResult.format
  );

  // Build summary
  const summary = buildLedgerSummary(entries, file.party, file.name);

  reportProgress(
    onProgress, file.party, 'complete', 1, 1, 1.0,
    `Complete: ${entries.length} entries parsed`
  );

  return {
    entries,
    columnMap: columnDetection.columnMap,
    numberFormat: numberFormatResult.config,
    dateFormat: dateFormatResult.format,
    summary,
    warnings,
    totalProcessingTimeMs: performance.now() - startTime,
  };
}

// ─── Helper: extract text samples from OCR lines ─────────────

function extractAmountTextsFromLines(
  lines: import('@/types').OcrLine[],
  columnMap: ColumnMap
): string[] {
  const samples: string[] = [];
  const sampleLimit = Math.min(lines.length, 30);

  for (let i = 0; i < sampleLimit; i++) {
    for (const word of lines[i].words) {
      if (/\d+[.,]\d+/.test(word.text)) {
        samples.push(word.text);
      }
    }
  }

  return samples;
}

function extractDateTextsFromLines(
  lines: import('@/types').OcrLine[],
  columnMap: ColumnMap
): string[] {
  const samples: string[] = [];
  const sampleLimit = Math.min(lines.length, 20);

  for (let i = 0; i < sampleLimit; i++) {
    const text = lines[i].text;
    // Extract date-like patterns
    const dateMatch = text.match(
      /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}/
    );
    if (dateMatch) {
      samples.push(dateMatch[0]);
    }
  }

  return samples;
}

// ─── Empty result ────────────────────────────────────────────

function emptyProcessingResult(
  file: UploadedFile,
  startTime: number,
  warnings: string[]
): OcrProcessingResult {
  return {
    entries: [],
    columnMap: {
      columns: [],
      dateColumnIndex: -1,
      descriptionColumnIndex: -1,
      debitColumnIndex: -1,
      creditColumnIndex: -1,
      amountColumnIndex: -1,
      balanceColumnIndex: -1,
      referenceColumnIndex: -1,
      amountStyle: 'separate_debit_credit',
    },
    numberFormat: {
      format: 'US',
      thousandSeparator: ',',
      decimalSeparator: '.',
      currencySymbol: '$',
      currencyPosition: 'prefix',
    },
    dateFormat: 'DD/MM/YYYY',
    summary: buildLedgerSummary([], file.party, file.name),
    warnings,
    totalProcessingTimeMs: performance.now() - startTime,
  };
}

// ─── Progress reporter ───────────────────────────────────────

function reportProgress(
  callback: OcrProgressCallback | undefined,
  party: Party,
  stage: import('@/types').OcrStage,
  currentPage: number,
  totalPages: number,
  overallProgress: number,
  message: string
): void {
  if (!callback) return;

  callback({
    stage,
    party,
    currentPage,
    totalPages,
    pageProgress: 0,
    overallProgress: Math.min(1, Math.max(0, overallProgress)),
    message,
    startedAt: 0,
    estimatedTimeRemainingMs: 0,
  });
}