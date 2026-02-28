/**
 * React hook for file upload handling
 * 
 * Manages:
 * - File validation (type, size)
 * - File reading into ArrayBuffer
 * - Detecting file type
 * - Triggering OCR processing
 */

import { useCallback, useState } from 'react';
import { useOcr } from './useOcr';
import { useAppStore } from '@/stores/appStore';
import type { Party, UploadedFile, SupportedFileType } from '@/types';
import {
  SUPPORTED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
} from '@/constants';
import { formatFileSize } from '@/lib/utils';

export interface UploadError {
  file: string;
  message: string;
}

export function useFileUpload() {
  const { processUploadedFile, isProcessing } = useOcr();
  const addNotification = useAppStore((s) => s.addNotification);

  const [errors, setErrors] = useState<UploadError[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // ─── File type detection ────────────────────────────────
  const detectFileType = useCallback(
    (file: File): SupportedFileType | null => {
      const extension = file.name.toLowerCase().split('.').pop();
      const mimeType = file.type.toLowerCase();

      // Check by extension
      const extensionMap: Record<string, SupportedFileType> = {
        pdf: 'pdf',
        png: 'png',
        jpg: 'jpg',
        jpeg: 'jpeg',
        tiff: 'tiff',
        tif: 'tiff',
        webp: 'webp',
        bmp: 'bmp',
        csv: 'csv',
      };

      if (extension && extensionMap[extension]) {
        return extensionMap[extension];
      }

      // Check by MIME type
      const mimeMap: Record<string, SupportedFileType> = {
        'application/pdf': 'pdf',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/tiff': 'tiff',
        'image/webp': 'webp',
        'image/bmp': 'bmp',
        'text/csv': 'csv',
        'application/vnd.ms-excel': 'csv',
      };

      if (mimeMap[mimeType]) {
        return mimeMap[mimeType];
      }

      return null;
    },
    []
  );

  // ─── File validation ────────────────────────────────────
  const validateFile = useCallback(
    (file: File): string | null => {
      // Size check
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return `File too large (${formatFileSize(file.size)}). Maximum is ${MAX_FILE_SIZE_MB}MB.`;
      }

      if (file.size === 0) {
        return 'File is empty.';
      }

      // Type check
      const fileType = detectFileType(file);
      if (!fileType) {
        return `Unsupported file type. Accepted: PDF, PNG, JPG, TIFF, WEBP, BMP, CSV.`;
      }

      return null; // valid
    },
    [detectFileType]
  );

  // ─── Read file into ArrayBuffer ─────────────────────────
  const readFileAsArrayBuffer = useCallback(
    (file: File): Promise<ArrayBuffer> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to read file as ArrayBuffer'));
          }
        };

        reader.onerror = () => {
          reject(new Error(`Failed to read file: ${reader.error?.message}`));
        };

        reader.readAsArrayBuffer(file);
      });
    },
    []
  );

  // ─── Process single file ────────────────────────────────
  const uploadFile = useCallback(
    async (file: File, party: Party) => {
      setErrors([]);

      // Validate
      const validationError = validateFile(file);
      if (validationError) {
        const error: UploadError = {
          file: file.name,
          message: validationError,
        };
        setErrors([error]);
        addNotification({
          type: 'error',
          title: 'Invalid file',
          message: `${file.name}: ${validationError}`,
        });
        return;
      }

      try {
        // Read file
        const data = await readFileAsArrayBuffer(file);
        const fileType = detectFileType(file)!;

        // Create UploadedFile object
        const uploadedFile: UploadedFile = {
          id: crypto.randomUUID(),
          party,
          name: file.name,
          type: fileType,
          size: file.size,
          mimeType: file.type || getMimeType(fileType),
          data,
          uploadedAt: Date.now(),
        };

        // Process (OCR + parse)
        await processUploadedFile(uploadedFile);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setErrors([{ file: file.name, message }]);
        addNotification({
          type: 'error',
          title: 'Upload failed',
          message: `${file.name}: ${message}`,
        });
      }
    },
    [
      validateFile,
      readFileAsArrayBuffer,
      detectFileType,
      processUploadedFile,
      addNotification,
    ]
  );

  // ─── Handle drop event ──────────────────────────────────
  const handleDrop = useCallback(
    async (files: File[], party: Party) => {
      setIsDragging(false);

      if (files.length === 0) return;

      if (files.length > 1) {
        addNotification({
          type: 'warning',
          title: 'Multiple files',
          message: 'Only the first file will be processed.',
        });
      }

      await uploadFile(files[0], party);
    },
    [uploadFile, addNotification]
  );

  // ─── Drag state handlers ───────────────────────────────
  const handleDragEnter = useCallback(() => setIsDragging(true), []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  return {
    uploadFile,
    handleDrop,
    handleDragEnter,
    handleDragLeave,
    isDragging,
    isProcessing,
    errors,
    clearErrors: () => setErrors([]),
  };
}

// ─── Helper: MIME type from file type ────────────────────────

function getMimeType(fileType: SupportedFileType): string {
  const mimeTypes: Record<SupportedFileType, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    tiff: 'image/tiff',
    webp: 'image/webp',
    bmp: 'image/bmp',
    csv: 'text/csv',
  };
  return mimeTypes[fileType] ?? 'application/octet-stream';
}