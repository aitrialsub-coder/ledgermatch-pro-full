/**
 * PDF Processor — Renders PDF pages to canvas using pdf.js
 * 
 * Key architecture decisions:
 * - Stream page-by-page (never hold all pages in memory)
 * - Release canvas immediately after OCR
 * - Configurable render scale for DPI control
 * - Runs in main thread but yields to event loop between pages
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { PdfPageRenderOptions } from '@/types';
import { DEFAULT_PDF_RENDER_OPTIONS } from '@/types/ocr';

// Configure pdf.js worker
// In a Chrome extension, we bundle the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ─── PDF Document Loading ────────────────────────────────────

export interface PdfLoadResult {
  document: PDFDocumentProxy;
  pageCount: number;
  metadata: PdfMetadata;
}

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  pageCount: number;
  isEncrypted: boolean;
}

/**
 * Load a PDF document from ArrayBuffer
 */
export async function loadPdfDocument(
  data: ArrayBuffer
): Promise<PdfLoadResult> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/cmaps/',
    cMapPacked: true,
    useSystemFonts: true,
    disableFontFace: false,
    isEvalSupported: false, // required for Chrome extension CSP
  });

  const document = await loadingTask.promise;

  let metadata: PdfMetadata = {
    title: '',
    author: '',
    subject: '',
    pageCount: document.numPages,
    isEncrypted: false,
  };

  try {
    const meta = await document.getMetadata();
    const info = meta.info as Record<string, string>;
    metadata = {
      title: info?.Title ?? '',
      author: info?.Author ?? '',
      subject: info?.Subject ?? '',
      pageCount: document.numPages,
      isEncrypted: !!info?.IsAcroFormPresent,
    };
  } catch {
    // Metadata extraction can fail — non-critical
  }

  return {
    document,
    pageCount: document.numPages,
    metadata,
  };
}

// ─── Page Rendering ──────────────────────────────────────────

export interface RenderedPage {
  canvas: OffscreenCanvas;
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  estimatedDpi: number;
}

/**
 * Render a single PDF page to an OffscreenCanvas
 * Uses OffscreenCanvas to work in Web Workers and offscreen documents
 */
export async function renderPdfPage(
  document: PDFDocumentProxy,
  pageNumber: number,
  options: PdfPageRenderOptions = DEFAULT_PDF_RENDER_OPTIONS
): Promise<RenderedPage> {
  const page: PDFPageProxy = await document.getPage(pageNumber);
  const viewport = page.getViewport({ scale: options.scale });

  // Clamp dimensions to prevent memory issues
  let width = Math.min(viewport.width, options.maxWidth);
  let height = Math.min(viewport.height, options.maxHeight);

  // Maintain aspect ratio if clamped
  if (width < viewport.width || height < viewport.height) {
    const scaleFactor = Math.min(
      width / viewport.width,
      height / viewport.height
    );
    width = Math.round(viewport.width * scaleFactor);
    height = Math.round(viewport.height * scaleFactor);
  }

  // Create canvas
  const canvas = new OffscreenCanvas(
    Math.round(width),
    Math.round(height)
  );
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error(`Failed to get 2D context for page ${pageNumber}`);
  }

  // Render
  const adjustedViewport = page.getViewport({
    scale: (width / viewport.width) * options.scale,
  });

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport: adjustedViewport,
  }).promise;

  // Estimate DPI (standard PDF is 72 DPI, scale 2.0 → ~144 DPI)
  const estimatedDpi = Math.round(72 * options.scale);

  // Clean up page reference
  page.cleanup();

  return {
    canvas,
    pageNumber,
    width: canvas.width,
    height: canvas.height,
    scale: options.scale,
    estimatedDpi,
  };
}

// ─── Text extraction (for digital PDFs — bypass OCR) ─────────

export interface PdfTextContent {
  pageNumber: number;
  text: string;
  lines: string[];
  hasText: boolean;
  charCount: number;
}

/**
 * Try to extract text directly from a PDF page.
 * If the PDF has selectable text, we can skip OCR entirely.
 */
export async function extractPdfText(
  document: PDFDocumentProxy,
  pageNumber: number
): Promise<PdfTextContent> {
  const page = await document.getPage(pageNumber);
  const textContent = await page.getTextContent();

  const items = textContent.items as Array<{
    str: string;
    dir: string;
    transform: number[];
    width: number;
    height: number;
    hasEOL: boolean;
  }>;

  // Group text items into lines by y-position
  const lineMap = new Map<number, string[]>();

  for (const item of items) {
    if (!item.str.trim()) continue;

    // Round y to group items on same baseline
    const y = Math.round(item.transform[5]);

    if (!lineMap.has(y)) {
      lineMap.set(y, []);
    }
    lineMap.get(y)!.push(item.str);
  }

  // Sort by y-position (top to bottom) and join words
  const sortedYs = [...lineMap.keys()].sort((a, b) => b - a); // PDF y is bottom-up
  const lines = sortedYs.map((y) => lineMap.get(y)!.join(' ').trim());
  const fullText = lines.join('\n');

  page.cleanup();

  return {
    pageNumber,
    text: fullText,
    lines,
    hasText: fullText.length > 10, // more than trivial content
    charCount: fullText.length,
  };
}

/**
 * Check if a PDF has selectable text (digital vs scanned)
 * Samples first 3 pages
 */
export async function isPdfDigital(
  document: PDFDocumentProxy
): Promise<{
  isDigital: boolean;
  confidence: number;
  samplePages: number;
  avgCharsPerPage: number;
}> {
  const samplePages = Math.min(document.numPages, 3);
  let totalChars = 0;

  for (let i = 1; i <= samplePages; i++) {
    const textContent = await extractPdfText(document, i);
    totalChars += textContent.charCount;
  }

  const avgCharsPerPage = totalChars / samplePages;

  // A page with real text typically has 200+ characters
  // A scanned page might have 0-10 characters (from embedded metadata)
  const isDigital = avgCharsPerPage > 100;
  const confidence = isDigital
    ? Math.min(1.0, avgCharsPerPage / 500)
    : Math.min(1.0, 1 - avgCharsPerPage / 100);

  return {
    isDigital,
    confidence,
    samplePages,
    avgCharsPerPage,
  };
}

// ─── Streaming page processor ────────────────────────────────

export interface PageProcessingResult {
  pageNumber: number;
  method: 'text_extraction' | 'ocr';
  lines: string[];
  fullText: string;
  confidence: number;
  processingTimeMs: number;
}

/**
 * Generator that processes pages one at a time.
 * Yields results and releases memory after each page.
 * 
 * Decides per-page whether to use text extraction or OCR.
 */
export async function* processPages(
  document: PDFDocumentProxy,
  renderOptions: PdfPageRenderOptions = DEFAULT_PDF_RENDER_OPTIONS,
  onProgress?: (current: number, total: number) => void
): AsyncGenerator<PageProcessingResult> {
  const totalPages = document.numPages;

  // Check if PDF has selectable text
  const digitalCheck = await isPdfDigital(document);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const startTime = performance.now();

    if (onProgress) {
      onProgress(pageNum, totalPages);
    }

    if (digitalCheck.isDigital) {
      // ── Digital PDF: extract text directly (fast path) ──
      const textContent = await extractPdfText(document, pageNum);

      yield {
        pageNumber: pageNum,
        method: 'text_extraction',
        lines: textContent.lines,
        fullText: textContent.text,
        confidence: 99, // text extraction is near-perfect
        processingTimeMs: performance.now() - startTime,
      };
    } else {
      // ── Scanned PDF: render → preprocess → OCR ──
      // Render page to canvas
      const rendered = await renderPdfPage(document, pageNum, renderOptions);

      // Get image data for OCR
      const ctx = rendered.canvas.getContext('2d');
      if (!ctx) {
        yield {
          pageNumber: pageNum,
          method: 'ocr',
          lines: [],
          fullText: '',
          confidence: 0,
          processingTimeMs: performance.now() - startTime,
        };
        continue;
      }

      const imageData = ctx.getImageData(
        0, 0, rendered.canvas.width, rendered.canvas.height
      );

      // Send to offscreen document for OCR
      const ocrResult = await requestOcrFromOffscreen(imageData, pageNum);

      // CRITICAL: Release canvas memory immediately
      rendered.canvas.width = 0;
      rendered.canvas.height = 0;

      yield {
        pageNumber: pageNum,
        method: 'ocr',
        lines: ocrResult.lines.map((l) => l.text),
        fullText: ocrResult.lines.map((l) => l.text).join('\n'),
        confidence: ocrResult.averageConfidence,
        processingTimeMs: performance.now() - startTime,
      };
    }

    // Yield to event loop between pages
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// ─── OCR request to offscreen document ───────────────────────

async function requestOcrFromOffscreen(
  imageData: ImageData,
  pageNumber: number
): Promise<{
  lines: Array<{ text: string; confidence: number }>;
  averageConfidence: number;
}> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();

    // Listen for the result
    const handler = (message: {
      type: string;
      payload: {
        requestId: string;
        lines?: Array<{ text: string; confidence: number }>;
        averageConfidence?: number;
        error?: string;
      };
    }) => {
      if (
        message.payload?.requestId === requestId &&
        (message.type === 'OCR_RESULT' || message.type === 'OCR_ERROR')
      ) {
        chrome.runtime.onMessage.removeListener(handler);

        if (message.type === 'OCR_ERROR') {
          reject(new Error(message.payload.error || 'OCR failed'));
        } else {
          resolve({
            lines: message.payload.lines || [],
            averageConfidence: message.payload.averageConfidence || 0,
          });
        }
      }
    };

    chrome.runtime.onMessage.addListener(handler);

    // Send to offscreen via background
    chrome.runtime.sendMessage({
      type: 'FORWARD_TO_OFFSCREEN',
      payload: {
        type: 'OCR_PROCESS_PAGE',
        data: {
          requestId,
          imageData: imageData,
          pageNumber,
        },
      },
    });

    // Timeout after 60 seconds per page
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      reject(new Error(`OCR timeout for page ${pageNumber}`));
    }, 60000);
  });
}

// ─── Cleanup ─────────────────────────────────────────────────
export function destroyPdfDocument(document: PDFDocumentProxy): void {
  document.destroy().catch(() => {
    // Silent cleanup failure
  });
}