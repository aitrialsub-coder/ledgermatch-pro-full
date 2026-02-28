/**
 * OpenCV.js Image Preprocessor
 * 
 * Prepares scanned images for Tesseract OCR:
 * 1. Grayscale conversion
 * 2. Deskew (straighten rotated scans)
 * 3. Adaptive thresholding (handles uneven lighting)
 * 4. Noise removal (median blur)
 * 5. Border detection and crop
 * 6. DPI upscaling
 * 
 * Uses OpenCV.js WASM — loaded on demand.
 */

import type { PreprocessingConfig } from '@/types';
import { DEFAULT_PREPROCESSING_CONFIG } from '@/types/ocr';

// OpenCV.js global reference (loaded dynamically)
declare const cv: typeof import('opencv-js');

let opencvLoaded = false;
let opencvLoadPromise: Promise<void> | null = null;

// ─── Load OpenCV.js ──────────────────────────────────────────

async function ensureOpenCv(): Promise<void> {
  if (opencvLoaded) return;

  if (opencvLoadPromise) {
    await opencvLoadPromise;
    return;
  }

  opencvLoadPromise = new Promise<void>((resolve, reject) => {
    // OpenCV.js loaded via script tag or dynamic import
    if (typeof cv !== 'undefined' && cv.Mat) {
      opencvLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('opencv.js');
    script.async = true;

    script.onload = () => {
      // OpenCV.js has an async init via Module.onRuntimeInitialized
      const checkReady = () => {
        if (typeof cv !== 'undefined' && cv.Mat) {
          opencvLoaded = true;
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    };

    script.onerror = () => {
      reject(new Error('Failed to load OpenCV.js'));
    };

    document.head.appendChild(script);
  });

  await opencvLoadPromise;
}

// ─── Main preprocessing pipeline ─────────────────────────────

export interface PreprocessingResult {
  imageData: ImageData;
  width: number;
  height: number;
  skewAngle: number;
  processingTimeMs: number;
  stepsApplied: string[];
}

/**
 * Full preprocessing pipeline for a single image/page
 */
export async function preprocessImage(
  inputImageData: ImageData,
  config: PreprocessingConfig = DEFAULT_PREPROCESSING_CONFIG
): Promise<PreprocessingResult> {
  await ensureOpenCv();

  const startTime = performance.now();
  const stepsApplied: string[] = [];
  let skewAngle = 0;

  // Load ImageData into OpenCV Mat
  let src = cv.matFromImageData(inputImageData);

  try {
    // Step 1: Grayscale
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    src.delete();
    src = gray;
    stepsApplied.push('grayscale');

    // Step 2: Deskew
    if (config.enableDeskew) {
      const deskewResult = deskew(src, config.maxSkewAngle);
      src = deskewResult.mat;
      skewAngle = deskewResult.angle;
      if (Math.abs(skewAngle) > 0.1) {
        stepsApplied.push(`deskew (${skewAngle.toFixed(1)}°)`);
      }
    }

    // Step 3: Adaptive thresholding
    if (config.enableThreshold) {
      let binary = new cv.Mat();
      cv.adaptiveThreshold(
        src,
        binary,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        config.thresholdBlockSize,
        config.thresholdC
      );
      src.delete();
      src = binary;
      stepsApplied.push('adaptive_threshold');
    }

    // Step 4: Noise removal
    if (config.enableDenoise) {
      let cleaned = new cv.Mat();
      cv.medianBlur(src, cleaned, config.medianBlurKernel);
      src.delete();
      src = cleaned;
      stepsApplied.push('denoise');
    }

    // Step 5: Border crop
    if (config.enableCrop) {
      const cropped = cropToContent(src);
      if (cropped) {
        src.delete();
        src = cropped;
        stepsApplied.push('crop');
      }
    }

    // Step 6: Upscale to target DPI
    if (config.enableUpscale) {
      const upscaled = upscaleIfNeeded(src, config.targetDpi);
      if (upscaled) {
        src.delete();
        src = upscaled;
        stepsApplied.push('upscale');
      }
    }

    // Convert back to ImageData
    // If still grayscale, convert to RGBA for ImageData compatibility
    let rgba = new cv.Mat();
    if (src.channels() === 1) {
      cv.cvtColor(src, rgba, cv.COLOR_GRAY2RGBA);
    } else {
      src.copyTo(rgba);
    }

    const outputImageData = new ImageData(
      new Uint8ClampedArray(rgba.data),
      rgba.cols,
      rgba.rows
    );

    rgba.delete();

    return {
      imageData: outputImageData,
      width: outputImageData.width,
      height: outputImageData.height,
      skewAngle,
      processingTimeMs: performance.now() - startTime,
      stepsApplied,
    };
  } finally {
    // Always clean up the final src Mat
    if (src && !src.isDeleted()) {
      src.delete();
    }
  }
}

// ─── Deskew (straighten rotated scans) ───────────────────────

interface DeskewResult {
  mat: cv.Mat;
  angle: number;
}

function deskew(src: cv.Mat, maxAngle: number): DeskewResult {
  // Edge detection
  let edges = new cv.Mat();
  cv.Canny(src, edges, 50, 150, 3);

  // Hough line transform to find dominant lines
  let lines = new cv.Mat();
  cv.HoughLinesP(
    edges,
    lines,
    1,                    // rho resolution (pixels)
    Math.PI / 180,       // theta resolution (radians)
    100,                  // accumulator threshold
    100,                  // minimum line length
    10                    // maximum line gap
  );

  edges.delete();

  // Calculate dominant angle from detected lines
  const angles: number[] = [];

  for (let i = 0; i < lines.rows; i++) {
    const x1 = lines.data32S[i * 4];
    const y1 = lines.data32S[i * 4 + 1];
    const x2 = lines.data32S[i * 4 + 2];
    const y2 = lines.data32S[i * 4 + 3];

    const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

    // Only consider near-horizontal lines (±maxAngle from 0° or 180°)
    if (Math.abs(angle) <= maxAngle) {
      angles.push(angle);
    } else if (Math.abs(angle - 180) <= maxAngle) {
      angles.push(angle - 180);
    } else if (Math.abs(angle + 180) <= maxAngle) {
      angles.push(angle + 180);
    }
  }

  lines.delete();

  if (angles.length === 0) {
    // No rotation detected
    let result = new cv.Mat();
    src.copyTo(result);
    return { mat: result, angle: 0 };
  }

  // Use median angle (robust to outliers)
  angles.sort((a, b) => a - b);
  const medianAngle = angles[Math.floor(angles.length / 2)];

  // Only correct if skew is significant
  if (Math.abs(medianAngle) < 0.1) {
    let result = new cv.Mat();
    src.copyTo(result);
    return { mat: result, angle: 0 };
  }

  // Rotate image to correct skew
  const center = new cv.Point(src.cols / 2, src.rows / 2);
  const rotationMatrix = cv.getRotationMatrix2D(center, medianAngle, 1.0);

  let rotated = new cv.Mat();
  cv.warpAffine(
    src,
    rotated,
    rotationMatrix,
    new cv.Size(src.cols, src.rows),
    cv.INTER_LINEAR,
    cv.BORDER_REPLICATE
  );

  rotationMatrix.delete();

  return { mat: rotated, angle: medianAngle };
}

// ─── Crop to content ─────────────────────────────────────────

function cropToContent(src: cv.Mat): cv.Mat | null {
  // Invert for contour detection (text = white on black)
  let inverted = new cv.Mat();
  cv.bitwise_not(src, inverted);

  // Find contours
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(
    inverted,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  inverted.delete();

  if (contours.size() === 0) {
    contours.delete();
    hierarchy.delete();
    return null;
  }

  // Find bounding rectangle of all contours
  let minX = src.cols;
  let minY = src.rows;
  let maxX = 0;
  let maxY = 0;

  for (let i = 0; i < contours.size(); i++) {
    const rect = cv.boundingRect(contours.get(i));
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  contours.delete();
  hierarchy.delete();

  // Add small padding (2% of dimensions)
  const padX = Math.round(src.cols * 0.02);
  const padY = Math.round(src.rows * 0.02);

  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(src.cols, maxX + padX);
  maxY = Math.min(src.rows, maxY + padY);

  const cropWidth = maxX - minX;
  const cropHeight = maxY - minY;

  // Only crop if we're removing significant border (> 5% of image)
  const areaRatio = (cropWidth * cropHeight) / (src.cols * src.rows);
  if (areaRatio > 0.95) {
    return null; // not worth cropping
  }

  // Crop
  let roi = src.roi(new cv.Rect(minX, minY, cropWidth, cropHeight));
  let cropped = new cv.Mat();
  roi.copyTo(cropped);
  roi.delete();

  return cropped;
}

// ─── Upscale for optimal OCR DPI ─────────────────────────────

function upscaleIfNeeded(src: cv.Mat, targetDpi: number): cv.Mat | null {
  // Estimate current DPI from image dimensions
  // Assume A4 page (8.27 × 11.69 inches)
  const estimatedDpiX = src.cols / 8.27;
  const estimatedDpiY = src.rows / 11.69;
  const estimatedDpi = Math.min(estimatedDpiX, estimatedDpiY);

  if (estimatedDpi >= targetDpi * 0.9) {
    return null; // already sufficient resolution
  }

  const scaleFactor = targetDpi / estimatedDpi;

  // Cap scale factor to prevent excessive memory usage
  const clampedScale = Math.min(scaleFactor, 3.0);

  if (clampedScale <= 1.1) {
    return null; // too small to bother
  }

  let upscaled = new cv.Mat();
  cv.resize(
    src,
    upscaled,
    new cv.Size(0, 0),
    clampedScale,
    clampedScale,
    cv.INTER_LINEAR
  );

  return upscaled;
}

// ─── Lightweight preprocessing (no OpenCV) ───────────────────
/**
 * Fallback preprocessing using Canvas API only
 * Used when OpenCV.js fails to load
 */
export function preprocessImageFallback(
  imageData: ImageData
): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;

  // Grayscale + simple threshold
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    );

    // Simple Otsu-like threshold (fixed at 128 for simplicity)
    const binary = gray > 128 ? 255 : 0;

    data[i] = binary;     // R
    data[i + 1] = binary; // G
    data[i + 2] = binary; // B
    // Alpha stays the same
  }

  return new ImageData(data, width, height);
}

// ─── Check if OpenCV is available ────────────────────────────
export function isOpenCvAvailable(): boolean {
  return opencvLoaded;
}