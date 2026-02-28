/**
 * React hook for OCR processing
 * 
 * Manages file processing lifecycle:
 * - Accept uploaded file
 * - Route to correct processor (CSV, digital PDF, scanned PDF, image)
 * - Track progress
 * - Update ledger store with results
 */

import { useCallback, useState } from 'react';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAppStore } from '@/stores/appStore';
import { processFile } from '@/core/ocr/ocrManager';
import type { Party, UploadedFile, OcrProgress } from '@/types';

export function useOcr() {
  const setFile = useLedgerStore((s) => s.setFile);
  const setEntries = useLedgerStore((s) => s.setEntries);
  const setColumnMap = useLedgerStore((s) => s.setColumnMap);
  const setNumberFormat = useLedgerStore((s) => s.setNumberFormat);
  const setSummary = useLedgerStore((s) => s.setSummary);
  const setOcrProgress = useLedgerStore((s) => s.setOcrProgress);

  const preprocessingConfig = useSettingsStore((s) => s.preprocessingConfig);
  const addNotification = useAppStore((s) => s.addNotification);
  const markStepComplete = useAppStore((s) => s.markStepComplete);

  const areBothParsed = useLedgerStore((s) => s.areBothLedgersParsed);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processUploadedFile = useCallback(
    async (file: UploadedFile) => {
      setError(null);
      setIsProcessing(true);
      setFile(file.party, file);

      try {
        // Keep service worker alive
        try {
          chrome.runtime.sendMessage({ type: 'START_KEEP_ALIVE' });
        } catch {
          // Not in extension context
        }

        const onProgress = (progress: OcrProgress) => {
          setOcrProgress(file.party, progress);
        };

        const result = await processFile(
          file,
          preprocessingConfig,
          onProgress
        );

        // Update store
        setEntries(file.party, result.entries);
        setColumnMap(file.party, result.columnMap);
        setNumberFormat(file.party, result.numberFormat);
        setSummary(file.party, result.summary);

        // Show warnings
        for (const warning of result.warnings) {
          addNotification({
            type: 'warning',
            title: `${file.party === 'A' ? 'Ledger A' : 'Ledger B'} warning`,
            message: warning,
            duration: 8000,
          });
        }

        addNotification({
          type: 'success',
          title: `${file.party === 'A' ? 'Ledger A' : 'Ledger B'} processed`,
          message: `${result.entries.length} entries extracted in ${(result.totalProcessingTimeMs / 1000).toFixed(1)}s`,
        });

        // Check if both sides are done
        markStepComplete('upload');
        if (areBothParsed()) {
          markStepComplete('ocr_review');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Processing failed';
        setError(message);
        addNotification({
          type: 'error',
          title: `Failed to process ${file.name}`,
          message,
        });
      } finally {
        setIsProcessing(false);
        setOcrProgress(file.party, null);

        try {
          chrome.runtime.sendMessage({ type: 'STOP_KEEP_ALIVE' });
        } catch {
          // Not in extension context
        }
      }
    },
    [
      setFile, setEntries, setColumnMap, setNumberFormat, setSummary,
      setOcrProgress, preprocessingConfig, addNotification, markStepComplete,
      areBothParsed,
    ]
  );

  return {
    processUploadedFile,
    isProcessing,
    error,
  };
}