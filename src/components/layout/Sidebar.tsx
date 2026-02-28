/**
 * Sidebar — Contextual side navigation
 * 
 * Shows different content based on current step:
 * - Upload: file status for both parties
 * - OCR Review: confidence summary
 * - Configure: quick access to rules
 * - Results: filter controls
 * - Export: export options
 */

import React from 'react';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/stores/appStore';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useMatchStore } from '@/stores/matchStore';
import { cn } from '@/lib/cn';
import { formatFileSize } from '@/lib/utils';

export function Sidebar() {
  const isSidebarCollapsed = useAppStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const currentStep = useAppStore((s) => s.currentStep);

  return (
    <aside
      className={cn(
        'relative flex shrink-0 flex-col border-r bg-card transition-all duration-200',
        isSidebarCollapsed ? 'w-0 overflow-hidden' : 'w-52'
      )}
    >
      {/* Toggle button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
      >
        {isSidebarCollapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>

      {!isSidebarCollapsed && (
        <ScrollArea className="flex-1">
          <div className="p-3">
            <SidebarContent step={currentStep} />
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}

function SidebarContent({ step }: { step: string }) {
  switch (step) {
    case 'upload':
    case 'ocr_review':
      return <FileStatusPanel />;
    case 'configure':
    case 'matching':
      return <MatchConfigPanel />;
    case 'results':
    case 'export':
      return <ResultsSummaryPanel />;
    default:
      return <FileStatusPanel />;
  }
}

// ─── File Status Panel ───────────────────────────────────────

function FileStatusPanel() {
  const fileA = useLedgerStore((s) => s.fileA);
  const fileB = useLedgerStore((s) => s.fileB);
  const summaryA = useLedgerStore((s) => s.summaryA);
  const summaryB = useLedgerStore((s) => s.summaryB);
  const ocrProgressA = useLedgerStore((s) => s.ocrProgressA);
  const ocrProgressB = useLedgerStore((s) => s.ocrProgressB);

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Files
      </h3>

      <FileCard
        label="Ledger A"
        file={fileA}
        summary={summaryA}
        progress={ocrProgressA}
      />

      <FileCard
        label="Ledger B"
        file={fileB}
        summary={summaryB}
        progress={ocrProgressB}
      />
    </div>
  );
}

interface FileCardProps {
  label: string;
  file: import('@/types').UploadedFile | null;
  summary: import('@/types').LedgerSummary | null;
  progress: import('@/types').OcrProgress | null;
}

function FileCard({ label, file, summary, progress }: FileCardProps) {
  const isProcessing = progress !== null && progress.stage !== 'complete';

  return (
    <div className="rounded-md border p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        {!file && (
          <Badge variant="outline" className="text-2xs px-1.5 py-0">
            Empty
          </Badge>
        )}
        {file && !summary && !isProcessing && (
          <Badge variant="warning" className="text-2xs px-1.5 py-0">
            Pending
          </Badge>
        )}
        {isProcessing && (
          <Badge variant="info" className="text-2xs px-1.5 py-0">
            <Clock className="mr-1 h-2.5 w-2.5 animate-spin" />
            Processing
          </Badge>
        )}
        {summary && (
          <Badge variant="success" className="text-2xs px-1.5 py-0">
            <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
            Ready
          </Badge>
        )}
      </div>

      {file && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">{file.name}</span>
          </div>
          <div className="text-2xs text-muted-foreground">
            {formatFileSize(file.size)} · {file.type.toUpperCase()}
          </div>
        </div>
      )}

      {isProcessing && progress && (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-2xs text-muted-foreground">
            <span>{progress.message}</span>
            <span>{Math.round(progress.overallProgress * 100)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress.overallProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      {summary && (
        <div className="mt-2 space-y-0.5 text-2xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Entries</span>
            <span className="font-medium text-foreground">
              {summary.totalRows}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Valid</span>
            <span className="font-medium text-foreground">
              {summary.validRows}
            </span>
          </div>
          {summary.lowConfidenceRows > 0 && (
            <div className="flex justify-between text-partial">
              <span className="flex items-center gap-1">
                <AlertCircle className="h-2.5 w-2.5" />
                Low confidence
              </span>
              <span className="font-medium">{summary.lowConfidenceRows}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>OCR avg</span>
            <span className="font-medium text-foreground">
              {Math.round(summary.ocrAverageConfidence)}%
            </span>
          </div>
        </div>
      )}

      {!file && (
        <p className="mt-1 text-2xs text-muted-foreground/60">
          Drop a file or click to upload
        </p>
      )}
    </div>
  );
}

// ─── Match Config Panel ──────────────────────────────────────

function MatchConfigPanel() {
  const config = useMatchStore((s) => s.config);

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Active Rules
      </h3>

      <div className="space-y-2 text-xs">
        <ConfigRow
          label="Date tolerance"
          value={`±${config.dateToleranceDays} days`}
        />
        <ConfigRow
          label="Amount tolerance"
          value={`±${(config.amountTolerancePercent * 100).toFixed(1)}%`}
        />
        <ConfigRow
          label="Description threshold"
          value={`${(config.descriptionThreshold * 100).toFixed(0)}%`}
        />
        <ConfigRow label="Polarity" value={config.polarityMode} />
        <ConfigRow
          label="Passes"
          value={config.enabledPasses.join(', ')}
        />
        <ConfigRow
          label="Split max"
          value={`${config.splitMaxEntries} entries`}
        />
      </div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

// ─── Results Summary Panel ───────────────────────────────────

function ResultsSummaryPanel() {
  const summary = useMatchStore((s) => s.summary);

  if (!summary) {
    return (
      <div className="text-center text-xs text-muted-foreground">
        No results yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Results
      </h3>

      <div className="space-y-2 text-xs">
        <StatRow
          label="Match rate"
          value={`${(summary.matchRate * 100).toFixed(1)}%`}
          highlight
        />

        <Separator />

        <StatRow
          label="Matched"
          value={summary.matchedCount.toString()}
          color="text-matched"
        />
        <StatRow
          label="Unmatched A"
          value={summary.unmatchedACount.toString()}
          color="text-onlya"
        />
        <StatRow
          label="Unmatched B"
          value={summary.unmatchedBCount.toString()}
          color="text-onlyb"
        />
        <StatRow
          label="Split"
          value={summary.splitCount.toString()}
          color="text-split"
        />
        <StatRow
          label="Duplicates"
          value={summary.duplicateCount.toString()}
          color="text-duplicate"
        />

        <Separator />

        <StatRow
          label="Discrepancy"
          value={`$${summary.totalDiscrepancy.toFixed(2)}`}
          highlight
        />
        <StatRow
          label="Avg confidence"
          value={`${summary.averageConfidence}%`}
        />
        <StatRow
          label="Time"
          value={`${(summary.processingTimeMs / 1000).toFixed(1)}s`}
        />
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-medium',
          color ?? 'text-foreground',
          highlight && 'text-sm font-bold'
        )}
      >
        {value}
      </span>
    </div>
  );
}