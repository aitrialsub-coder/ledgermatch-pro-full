/**
 * FilePreview — Shows parsed file summary after OCR
 * 
 * Displays:
 * - File metadata
 * - Entry count + date range
 * - Debit/Credit totals
 * - OCR confidence indicator
 * - Low confidence warning
 * - Quick sample of parsed entries
 */

import React, { useState } from 'react';
import {
  FileText,
  Calendar,
  Hash,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Eye,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { UploadedFile, LedgerSummary } from '@/types';
import { useLedgerStore } from '@/stores/ledgerStore';
import { formatFileSize } from '@/lib/utils';
import { cn } from '@/lib/cn';

interface FilePreviewProps {
  file: UploadedFile;
  summary: LedgerSummary;
}

export function FilePreview({ file, summary }: FilePreviewProps) {
  const [showSample, setShowSample] = useState(false);
  const entries = useLedgerStore((s) =>
    file.party === 'A' ? s.entriesA : s.entriesB
  );

  const confidenceLevel =
    summary.ocrAverageConfidence >= 90
      ? 'high'
      : summary.ocrAverageConfidence >= 70
        ? 'medium'
        : 'low';

  return (
    <div className="space-y-3">
      {/* File info */}
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.size)} · {file.type.toUpperCase()}
          </p>
        </div>
      </div>

      <Separator />

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatItem
          icon={Hash}
          label="Entries"
          value={summary.totalRows.toString()}
        />
        <StatItem
          icon={Calendar}
          label="Date range"
          value={
            summary.dateRange.earliest && summary.dateRange.latest
              ? `${formatShortDate(summary.dateRange.earliest)} → ${formatShortDate(summary.dateRange.latest)}`
              : 'N/A'
          }
          small
        />
        <StatItem
          icon={TrendingDown}
          label="Total debit"
          value={`$${summary.totalDebit.toFixed(2)}`}
          color="text-onlya"
        />
        <StatItem
          icon={TrendingUp}
          label="Total credit"
          value={`$${summary.totalCredit.toFixed(2)}`}
          color="text-matched"
        />
      </div>

      {/* OCR Confidence */}
      <div className="rounded-md border p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">OCR Confidence</span>
          <Badge
            variant={
              confidenceLevel === 'high'
                ? 'success'
                : confidenceLevel === 'medium'
                  ? 'warning'
                  : 'error'
            }
          >
            {Math.round(summary.ocrAverageConfidence)}%
          </Badge>
        </div>

        {/* Confidence bar */}
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              confidenceLevel === 'high' && 'bg-matched',
              confidenceLevel === 'medium' && 'bg-partial',
              confidenceLevel === 'low' && 'bg-onlya'
            )}
            style={{ width: `${summary.ocrAverageConfidence}%` }}
          />
        </div>

        {summary.lowConfidenceRows > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-2xs text-partial">
            <AlertTriangle className="h-3 w-3" />
            {summary.lowConfidenceRows} rows with low confidence — review recommended
          </div>
        )}

        {summary.skippedRows > 0 && (
          <div className="mt-1 text-2xs text-muted-foreground">
            {summary.skippedRows} rows skipped (headers, totals, blanks)
          </div>
        )}
      </div>

      {/* Sample entries toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between"
        onClick={() => setShowSample(!showSample)}
      >
        <span className="flex items-center gap-1.5 text-xs">
          <Eye className="h-3 w-3" />
          Preview entries
        </span>
        {showSample ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* Sample entries */}
      {showSample && (
        <ScrollArea className="h-40">
          <div className="space-y-1">
            {entries.slice(0, 10).map((entry, i) => (
              <div
                key={entry.id}
                className={cn(
                  'flex items-center gap-2 rounded px-2 py-1 text-2xs',
                  entry.ocrConfidence < 70 && 'bg-yellow-50'
                )}
              >
                <span className="w-16 shrink-0 text-muted-foreground">
                  {entry.date ?? '—'}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {entry.description || '(no description)'}
                </span>
                <span
                  className={cn(
                    'shrink-0 font-mono',
                    entry.amount >= 0 ? 'text-matched' : 'text-onlya'
                  )}
                >
                  {entry.amount >= 0 ? '+' : ''}
                  {entry.amount.toFixed(2)}
                </span>
                {entry.ocrConfidence < 70 && (
                  <AlertTriangle className="h-3 w-3 shrink-0 text-partial" />
                )}
              </div>
            ))}
            {entries.length > 10 && (
              <p className="px-2 py-1 text-center text-2xs text-muted-foreground">
                ...and {entries.length - 10} more entries
              </p>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Status */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-matched">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Ready for matching
      </div>
    </div>
  );
}

// ─── Stat item ───────────────────────────────────────────────

function StatItem({
  icon: Icon,
  label,
  value,
  color,
  small,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p
        className={cn(
          'mt-0.5 font-medium',
          small ? 'text-2xs' : 'text-xs',
          color ?? 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Date formatting ─────────────────────────────────────────

function formatShortDate(iso: string): string {
  try {
    const date = new Date(iso + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}