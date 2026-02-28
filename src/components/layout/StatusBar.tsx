/**
 * StatusBar — Bottom bar showing system status
 * 
 * Displays:
 * - Current processing status (idle, OCR, matching)
 * - Memory usage estimate
 * - Entry counts
 * - Quick action buttons
 */

import React from 'react';
import {
  Activity,
  Database,
  Cpu,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useMatchStore } from '@/stores/matchStore';
import { cn } from '@/lib/cn';

export function StatusBar() {
  const entriesA = useLedgerStore((s) => s.entriesA);
  const entriesB = useLedgerStore((s) => s.entriesB);
  const ocrProgressA = useLedgerStore((s) => s.ocrProgressA);
  const ocrProgressB = useLedgerStore((s) => s.ocrProgressB);
  const isMatching = useMatchStore((s) => s.isMatching);
  const progress = useMatchStore((s) => s.progress);
  const summary = useMatchStore((s) => s.summary);

  // Determine status
  const isOcrRunning =
    (ocrProgressA !== null && ocrProgressA.stage !== 'complete') ||
    (ocrProgressB !== null && ocrProgressB.stage !== 'complete');

  let statusText = 'Ready';
  let statusColor = 'text-matched';
  let statusIcon = Activity;

  if (isOcrRunning) {
    statusText = 'OCR Processing...';
    statusColor = 'text-blue-500';
    statusIcon = Cpu;
  } else if (isMatching) {
    statusText = progress?.message ?? 'Matching...';
    statusColor = 'text-blue-500';
    statusIcon = Cpu;
  } else if (summary) {
    statusText = `${summary.matchedCount} matched · ${summary.unmatchedACount + summary.unmatchedBCount} unmatched`;
    statusColor = 'text-matched';
  }

  const StatusIcon = statusIcon;

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t bg-card px-3 text-2xs text-muted-foreground">
      {/* Left: Status */}
      <div className="flex items-center gap-2">
        <StatusIcon className={cn('h-3 w-3', statusColor)} />
        <span className="truncate max-w-[200px]">{statusText}</span>
      </div>

      {/* Right: Metrics */}
      <div className="flex items-center gap-3">
        {/* Entry counts */}
        <div className="flex items-center gap-1">
          <Database className="h-3 w-3" />
          <span>
            A:{entriesA.length} B:{entriesB.length}
          </span>
        </div>

        {/* Mode indicator */}
        <div className="flex items-center gap-1">
          <WifiOff className="h-3 w-3" />
          <span>Local</span>
        </div>
      </div>
    </footer>
  );
}