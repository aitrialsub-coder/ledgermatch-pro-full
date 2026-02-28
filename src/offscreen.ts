/**
 * Offscreen Document — OCR Processing Sandbox
 *
 * This runs in a separate context with its own memory budget.
 * Heavy WASM modules (Tesseract.js, OpenCV.js) load here,
 * isolated from the side panel UI.
 *
 * Communication: chrome.runtime.onMessage ↔ sendMessage
 */

import { createWorker, Worker as TesseractWorker, PSM } from 'tesseract.js';

// ─── State ───────────────────────────────────────────────────
let tesseractWorker: TesseractWorker | null = null;
let isInitialized = false;

// ─── Tesseract Initialization ────────────────────────────────
async function initTesseract(): Promise<void> {
  if (isInitialized && tesseractWorker) return;

  console.log('[OCR Offscreen] Initializing Tesseract.js...');

  tesseractWorker = await createWorker('eng', 1, {
    workerBlobURL: false,
    logger: (info) => {
      if (info.status === 'recognizing text') {
        // Forward progress to side panel
        chrome.runtime.sendMessage({
          type: 'OCR_PROGRESS',
          payload: {
            stage: 'recognizing',
            progress: info.progress,
            message: `Recognizing text: ${Math.round(info.progress * 100)}%`,
          },
        });
      }
    },
  });

  await tesseractWorker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO_OSD,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
    // NO character whitelist — let Tesseract use full dictionary
    // Post-filter unwanted chars instead
  });

  isInitialized = true;
  console.log('[OCR Offscreen] Tesseract.js initialized');
}

// ─── OCR Processing ─────────────────────────────────────────
async function processImage(
  imageData: ArrayBuffer | ImageData,
  pageNumber: number
): Promise<{
  lines: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    words: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
  }>;
  fullText: string;
  averageConfidence: number;
  processingTimeMs: number;
}> {
  if (!tesseractWorker) {
    await initTesseract();
  }

  const startTime = performance.now();

  const { data } = await tesseractWorker!.recognize(imageData);

  const lines = data.lines.map((line) => ({
    text: postProcessText(line.text),
    confidence: line.confidence,
    bbox: line.bbox,
    words: line.words.map((word) => ({
      text: postProcessText(word.text),
      confidence: word.confidence,
      bbox: word.bbox,
    })),
  }));

  const processingTimeMs = performance.now() - startTime;

  return {
    lines,
    fullText: data.text,
    averageConfidence: data.confidence,
    processingTimeMs,
  };
}

// ─── Post-Processing (replaces character whitelist) ──────────
function postProcessText(text: string): string {
  return text
    // Fix common OCR misreads
    .replace(/[''`]/g, "'")         // normalize quotes
    .replace(/[""]/g, '"')          // normalize double quotes
    .replace(/—|–/g, '-')          // normalize dashes
    .replace(/\s+/g, ' ')          // collapse whitespace
    .trim();
}

// ─── Message Handler ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Only handle messages intended for offscreen
  if (message.source === 'background' || !message.type) return;

  switch (message.type) {
    case 'OCR_INIT':
      initTesseract()
        .then(() => {
          sendResponse({ success: true });
          chrome.runtime.sendMessage({ type: 'OCR_READY' });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
          chrome.runtime.sendMessage({
            type: 'OCR_ERROR',
            payload: { error: err.message, stage: 'initializing' },
          });
        });
      return true;

    case 'OCR_PROCESS_PAGE':
      processImage(message.payload.imageData, message.payload.pageNumber)
        .then((result) => {
          chrome.runtime.sendMessage({
            type: 'OCR_RESULT',
            payload: {
              requestId: message.payload.requestId,
              pageNumber: message.payload.pageNumber,
              ...result,
            },
          });
          sendResponse({ success: true });
        })
        .catch((err) => {
          chrome.runtime.sendMessage({
            type: 'OCR_ERROR',
            payload: {
              requestId: message.payload.requestId,
              error: err.message,
              stage: 'recognizing',
              pageNumber: message.payload.pageNumber,
            },
          });
          sendResponse({ success: false, error: err.message });
        });
      return true;

    case 'OCR_CANCEL':
      if (tesseractWorker) {
        tesseractWorker.terminate().then(() => {
          tesseractWorker = null;
          isInitialized = false;
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: true });
      }
      return true;

    default:
      break;
  }
});

console.log('[OCR Offscreen] Offscreen document loaded and listening');

export {};