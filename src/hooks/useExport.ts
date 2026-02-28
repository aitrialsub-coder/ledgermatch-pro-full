/**
 * React hook for exporting match results
 * 
 * Provides convenient methods for all export formats
 * with progress tracking and notifications.
 */

import { useCallback, useState } from 'react';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useMatchStore } from '@/stores/matchStore';
import { useAppStore } from '@/stores/appStore';
import {
  exportMatchReportCsv,
  exportUnmatchedCsv,
  exportSummaryCsv,
  exportAuditTrailCsv,
  exportLedgerEntriesCsv,
  downloadCsv,
  type CsvExportOptions,
  DEFAULT_CSV_OPTIONS,
} from '@/core/export/csvExporter';
import {
  exportMatchReportPdf,
  downloadPdf,
  type PdfExportOptions,
  DEFAULT_PDF_OPTIONS,
} from '@/core/export/pdfExporter';
import {
  exportMatchResultJson,
  downloadJson,
  type JsonExportOptions,
  DEFAULT_JSON_OPTIONS,
} from '@/core/export/jsonExporter';

export type ExportFormat = 'csv' | 'csv_unmatched' | 'csv_summary' | 'csv_audit' | 'csv_ledger_a' | 'csv_ledger_b' | 'pdf' | 'json';

export function useExport() {
  const result = useMatchStore((s) => s.result);
  const entriesA = useLedgerStore((s) => s.entriesA);
  const entriesB = useLedgerStore((s) => s.entriesB);
  const summaryA = useLedgerStore((s) => s.summaryA);
  const summaryB = useLedgerStore((s) => s.summaryB);
  const fileA = useLedgerStore((s) => s.fileA);
  const fileB = useLedgerStore((s) => s.fileB);
  const addNotification = useAppStore((s) => s.addNotification);

  const [isExporting, setIsExporting] = useState(false);

  // ─── Generate timestamp-based filename ──────────────────
  const getFilename = useCallback(
    (format: string, suffix?: string): string => {
      const date = new Date().toISOString().split('T')[0];
      const nameA = fileA?.name.replace(/\.[^/.]+$/, '') ?? 'ledgerA';
      const nameB = fileB?.name.replace(/\.[^/.]+$/, '') ?? 'ledgerB';
      const base = `reconciliation_${nameA}_vs_${nameB}_${date}`;

      if (suffix) {
        return `${base}_${suffix}.${format}`;
      }
      return `${base}.${format}`;
    },
    [fileA, fileB]
  );

  // ─── CSV exports ────────────────────────────────────────
  const exportCsv = useCallback(
    (
      type: 'full' | 'unmatched' | 'summary' | 'audit' | 'ledger_a' | 'ledger_b' = 'full',
      options: Partial<CsvExportOptions> = {}
    ) => {
      if (!result && type !== 'ledger_a' && type !== 'ledger_b') {
        addNotification({
          type: 'error',
          title: 'No results to export',
          message: 'Run matching first before exporting.',
        });
        return;
      }

      setIsExporting(true);

      try {
        const opts = { ...DEFAULT_CSV_OPTIONS, ...options };
        let content: string;
        let filename: string;

        switch (type) {
          case 'unmatched':
            content = exportUnmatchedCsv(result!, entriesA, entriesB, opts);
            filename = getFilename('csv', 'unmatched');
            break;

          case 'summary':
            content = exportSummaryCsv(result!, opts);
            filename = getFilename('csv', 'summary');
            break;

          case 'audit':
            content = exportAuditTrailCsv(result!, entriesA, entriesB, opts);
            filename = getFilename('csv', 'audit_trail');
            break;

          case 'ledger_a':
            content = exportLedgerEntriesCsv(entriesA, 'A', opts);
            filename = getFilename('csv', 'ledger_A');
            break;

          case 'ledger_b':
            content = exportLedgerEntriesCsv(entriesB, 'B', opts);
            filename = getFilename('csv', 'ledger_B');
            break;

          case 'full':
          default:
            content = exportMatchReportCsv(result!, entriesA, entriesB, opts);
            filename = getFilename('csv', 'full_report');
            break;
        }

        downloadCsv(content, filename);

        addNotification({
          type: 'success',
          title: 'CSV exported',
          message: `Downloaded ${filename}`,
        });
      } catch (err) {
        addNotification({
          type: 'error',
          title: 'Export failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setIsExporting(false);
      }
    },
    [result, entriesA, entriesB, addNotification, getFilename]
  );

  // ─── PDF export ─────────────────────────────────────────
  const exportPdf = useCallback(
    (options: Partial<PdfExportOptions> = {}) => {
      if (!result) {
        addNotification({
          type: 'error',
          title: 'No results to export',
          message: 'Run matching first before exporting.',
        });
        return;
      }

      setIsExporting(true);

      try {
        const opts = { ...DEFAULT_PDF_OPTIONS, ...options };
        const doc = exportMatchReportPdf(result, entriesA, entriesB, opts);
        const filename = getFilename('pdf', 'report');
        downloadPdf(doc, filename);

        addNotification({
          type: 'success',
          title: 'PDF exported',
          message: `Downloaded ${filename}`,
        });
      } catch (err) {
        addNotification({
          type: 'error',
          title: 'PDF export failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setIsExporting(false);
      }
    },
    [result, entriesA, entriesB, addNotification, getFilename]
  );

  // ─── JSON export ────────────────────────────────────────
  const exportJson = useCallback(
    (options: Partial<JsonExportOptions> = {}) => {
      if (!result) {
        addNotification({
          type: 'error',
          title: 'No results to export',
          message: 'Run matching first before exporting.',
        });
        return;
      }

      setIsExporting(true);

      try {
        const opts = { ...DEFAULT_JSON_OPTIONS, ...options };
        const content = exportMatchResultJson(
          result,
          entriesA,
          entriesB,
          summaryA,
          summaryB,
          opts
        );
        const filename = getFilename('json', 'data');
        downloadJson(content, filename);

        addNotification({
          type: 'success',
          title: 'JSON exported',
          message: `Downloaded ${filename}`,
        });
      } catch (err) {
        addNotification({
          type: 'error',
          title: 'JSON export failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setIsExporting(false);
      }
    },
    [result, entriesA, entriesB, summaryA, summaryB, addNotification, getFilename]
  );

  // ─── Quick export (all formats) ─────────────────────────
  const exportAll = useCallback(() => {
    exportCsv('full');
    exportCsv('summary');
    exportPdf();
    exportJson();
  }, [exportCsv, exportPdf, exportJson]);

  return {
    exportCsv,
    exportPdf,
    exportJson,
    exportAll,
    isExporting,
    hasResults: result !== null,
  };
}