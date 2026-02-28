/**
 * Tesseract.js Worker Manager
 * 
 * Manages Tesseract worker lifecycle for in-browser OCR.
 * Designed to run inside the offscreen document or a Web Worker.
 * 
 * Features:
 * - Lazy initialization
 * - Progress reporting via callbacks
 * - Automatic cleanup after idle timeout
 * - Post-processing of OCR text
 */

import {
  createWorker,
  Worker as TesseractWorker,
  PSM,
  OEM,
} from 'tesseract.js';
import type { OcrPageResult, OcrLine, OcrWord } from '@/types';

// ─── Worker state ────────────────────────────────────────────
let worker: TesseractWorker | null = null;
let isInitialized = false;
let lastUsedAt = 0;
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── Progress callback type ──────────────────────────────────
export type OcrProgressCallback = (progress: {
  stage: string;
  progress: number;
  message: string;
}) => void;

// ─── Initialize worker ──────────────────────────────────────
export async function initTesseractWorker(
  onProgress?: OcrProgressCallback
): Promise<void> {
  if (isInitialized && worker) {
    lastUsedAt = Date.now();
    return;
  }

  worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerBlobURL: false,
    logger: (info) => {
      if (onProgress && info.status) {
        onProgress({
          stage: info.status,
          progress: info.progress ?? 0,
          message: `${info.status}: ${Math.round((info.progress ?? 0) * 100)}%`,
        });
      }
    },
  });

  // Configure Tesseract parameters
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
    // NO character whitelist — per review recommendation
    // Post-process instead for better accuracy
  });

  isInitialized = true;
  lastUsedAt = Date.now();
  scheduleCleanup();
}

// ─── Recognize a single image ────────────────────────────────
export async function recognizeImage(
  imageData: ImageData | ArrayBuffer | string,
  pageNumber: number = 1,
  onProgress?: OcrProgressCallback
): Promise<OcrPageResult> {
  if (!worker || !isInitialized) {
    await initTesseractWorker(onProgress);
  }

  lastUsedAt = Date.now();
  const startTime = performance.now();

  const { data } = await worker!.recognize(imageData);

  const lines: OcrLine[] = data.lines.map((line) => ({
    text: postProcessOcrText(line.text),
    confidence: line.confidence,
    bbox: {
      x0: line.bbox.x0,
      y0: line.bbox.y0,
      x1: line.bbox.x1,
      y1: line.bbox.y1,
    },
    words: line.words.map((word) => {
      const isLow = word.confidence < 70;
      return {
        text: postProcessOcrText(word.text),
        confidence: word.confidence,
        bbox: {
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1,
        },
        isLowConfidence: isLow,
      } satisfies OcrWord;
    }),
    baseline: line.baseline
      ? {
          x0: line.baseline.x0,
          y0: line.baseline.y0,
          x1: line.baseline.x1,
          y1: line.baseline.y1,
        }
      : { x0: 0, y0: 0, x1: 0, y1: 0 },
  }));

  const processingTimeMs = performance.now() - startTime;

  return {
    pageNumber,
    lines,
    fullText: data.text,
    averageConfidence: data.confidence,
    width: 0,  // will be set by caller
    height: 0,
    processingTimeMs,
  };
}

// ─── Post-processing ─────────────────────────────────────────
/**
 * Fix common OCR mistakes without character whitelist
 */
function postProcessOcrText(text: string): string {
  let result = text;

  // Normalize whitespace
  result = result.replace(/\s+/g, ' ').trim();

  // Normalize quotes and dashes
  result = result
    .replace(/[''`\u2018\u2019]/g, "'")
    .replace(/[""\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-');

  // Common OCR substitution fixes
  result = result
    // 'l' misread as '1' in amounts (only fix if surrounded by digits)
    .replace(/(\d)l(\d)/g, '$11$2')
    // 'O' misread as '0' (only in clearly numeric contexts)
    .replace(/(\d)O(\d)/g, '$10$2')
    .replace(/O(\d{2,})/g, '0$1')
    // 'S' misread as '5' or '$'
    // These are context-dependent, so be conservative
    // Remove trailing/leading artifacts
    .replace(/^[|lI]\s+/, '')
    .replace(/\s+[|lI]$/, '');

  return result;
}

// ─── Common OCR corrections for amounts ──────────────────────
export function postProcessAmount(text: string): string {
  let result = text.trim();

  // Common OCR errors in numbers
  result = result
    .replace(/l/g, '1')           // lowercase L → 1
    .replace(/O/g, '0')           // uppercase O → 0
    .replace(/o/g, '0')           // lowercase o → 0 (in numeric context)
    .replace(/I/g, '1')           // uppercase I → 1
    .replace(/\s/g, '')           // remove spaces within numbers
    .replace(/,,/g, ',')          // double comma
    .replace(/\.\./g, '.')        // double period
    .replace(/,\./g, '.')         // comma before period
    .replace(/\.,/g, ',');        // period before comma

  return result;
}

// ─── Cleanup management ──────────────────────────────────────
function scheduleCleanup(): void {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
  }

  cleanupTimer = setTimeout(() => {
    if (Date.now() - lastUsedAt >= IDLE_TIMEOUT_MS) {
      terminateWorker();
    } else {
      scheduleCleanup();
    }
  }, IDLE_TIMEOUT_MS);
}

export async function terminateWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    isInitialized = false;
  }
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}

export function isWorkerReady(): boolean {
  return isInitialized && worker !== null;
}