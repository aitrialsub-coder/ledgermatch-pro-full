/**
 * FileUploadZone — Main upload view
 * 
 * Two side-by-side drop zones for Ledger A and Ledger B.
 * Supports drag & drop and click-to-browse.
 * Shows preview after upload and OCR progress.
 */

import React, { useCallback, useRef } from 'react';
import {
  Upload,
  FileText,
  Image,
  FileSpreadsheet,
  ArrowRight,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useAppStore } from '@/stores/appStore';
import { useMatchStore } from '@/stores/matchStore';
import { UploadProgress } from './UploadProgress';
import { FilePreview } from './FilePreview';
import type { Party } from '@/types';
import { cn } from '@/lib/cn';
import { formatFileSize } from '@/lib/utils';
import { SUPPORTED_EXTENSIONS } from '@/constants';

export function FileUploadZone() {
  const fileA = useLedgerStore((s) => s.fileA);
  const fileB = useLedgerStore((s) => s.fileB);
  const summaryA = useLedgerStore((s) => s.summaryA);
  const summaryB = useLedgerStore((s) => s.summaryB);
  const ocrProgressA = useLedgerStore((s) => s.ocrProgressA);
  const ocrProgressB = useLedgerStore((s) => s.ocrProgressB);
  const clearFile = useLedgerStore((s) => s.clearFile);
  const areBothParsed = useLedgerStore((s) => s.areBothLedgersParsed);

  const setStep = useAppStore((s) => s.setStep);
  const markStepComplete = useAppStore((s) => s.markStepComplete);

  const handleProceed = () => {
    markStepComplete('upload');
    if (summaryA && summaryB) {
      markStepComplete('ocr_review');
      setStep('configure');
    } else {
      setStep('ocr_review');
    }
  };

  const bothReady = areBothParsed();

  return (
    <div className="flex h-full flex-col">
      {/* Title */}
      <div className="mb-4">
        <h1 className="text-lg font-bold">Upload Ledgers</h1>
        <p className="text-sm text-muted-foreground">
          Upload two ledger files to compare. Supports PDF, images, and CSV.
        </p>
      </div>

      {/* Upload zones */}
      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <UploadPanel
          party="A"
          label="Ledger A"
          subtitle="Your records"
          file={fileA}
          summary={summaryA}
          ocrProgress={ocrProgressA}
          onClear={() => clearFile('A')}
        />

        <UploadPanel
          party="B"
          label="Ledger B"
          subtitle="Counterparty records"
          file={fileB}
          summary={summaryB}
          ocrProgress={ocrProgressB}
          onClear={() => clearFile('B')}
        />
      </div>

      {/* Proceed button */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {!fileA && !fileB && 'Upload both ledgers to begin'}
          {fileA && !fileB && 'Upload Ledger B to continue'}
          {!fileA && fileB && 'Upload Ledger A to continue'}
          {fileA && fileB && !bothReady && 'Processing files...'}
          {bothReady && (
            <span className="flex items-center gap-1 text-matched">
              <CheckCircle2 className="h-4 w-4" />
              Both ledgers ready
            </span>
          )}
        </div>

        <Button
          onClick={handleProceed}
          disabled={!bothReady}
          size="lg"
        >
          Continue
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Single Upload Panel ─────────────────────────────────────

interface UploadPanelProps {
  party: Party;
  label: string;
  subtitle: string;
  file: import('@/types').UploadedFile | null;
  summary: import('@/types').LedgerSummary | null;
  ocrProgress: import('@/types').OcrProgress | null;
  onClear: () => void;
}

function UploadPanel({
  party,
  label,
  subtitle,
  file,
  summary,
  ocrProgress,
  onClear,
}: UploadPanelProps) {
  const { uploadFile, isProcessing, errors, isDragging, handleDragEnter, handleDragLeave } =
    useFileUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  const isThisProcessing =
    ocrProgress !== null && ocrProgress.stage !== 'complete' && ocrProgress.party === party;

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        uploadFile(files[0], party);
      }
      // Reset input so same file can be re-selected
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [uploadFile, party]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleDragLeave();

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        uploadFile(files[0], party);
      }
    },
    [uploadFile, party, handleDragLeave]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Show file preview if uploaded
  if (file) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{label}</CardTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClear}
              disabled={isThisProcessing}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          {isThisProcessing && ocrProgress ? (
            <UploadProgress progress={ocrProgress} />
          ) : summary ? (
            <FilePreview file={file} summary={summary} />
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Show drop zone
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{label}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="flex-1">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex h-full min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-accent/50'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={SUPPORTED_EXTENSIONS.join(',')}
            onChange={handleFileChange}
          />

          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                isDragging ? 'bg-primary/10' : 'bg-muted'
              )}
            >
              <Upload
                className={cn(
                  'h-6 w-6',
                  isDragging ? 'text-primary' : 'text-muted-foreground'
                )}
              />
            </div>

            <div>
              <p className="text-sm font-medium">
                {isDragging ? 'Drop file here' : 'Drop file or click to browse'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, PNG, JPG, TIFF, CSV — up to 50MB
              </p>
            </div>

            {/* File type icons */}
            <div className="flex items-center gap-2 text-muted-foreground/40">
              <FileText className="h-4 w-4" />
              <Image className="h-4 w-4" />
              <FileSpreadsheet className="h-4 w-4" />
            </div>
          </div>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mt-2 space-y-1">
            {errors.map((err, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{err.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}