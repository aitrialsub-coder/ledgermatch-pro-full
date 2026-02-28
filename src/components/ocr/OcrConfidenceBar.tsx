/**
 * OcrConfidenceBar — Visual bar showing OCR confidence distribution
 */

import React from 'react';
import type { LedgerEntry } from '@/types';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

interface OcrConfidenceBarProps {
  entries: LedgerEntry[];
  className?: string;
}

export function OcrConfidenceBar({
  entries,
  className,
}: OcrConfidenceBarProps) {
  if (entries.length === 0) return null;

  const high = entries.filter((e) => e.ocrConfidence >= 90).length;
  const medium = entries.filter(
    (e) => e.ocrConfidence >= 70 && e.ocrConfidence < 90
  ).length;
  const low = entries.filter((e) => e.ocrConfidence < 70).length;
  const total = entries.length;

  const highPct = (high / total) * 100;
  const medPct = (medium / total) * 100;
  const lowPct = (low / total) * 100;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex h-2 w-full overflow-hidden rounded-full',
            className
          )}
        >
          {highPct > 0 && (
            <div
              className="bg-matched transition-all"
              style={{ width: `${highPct}%` }}
            />
          )}
          {medPct > 0 && (
            <div
              className="bg-partial transition-all"
              style={{ width: `${medPct}%` }}
            />
          )}
          {lowPct > 0 && (
            <div
              className="bg-onlya transition-all"
              style={{ width: `${lowPct}%` }}
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-matched" />
            <span>High (≥90%): {high} rows</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-partial" />
            <span>Medium (70-89%): {medium} rows</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-onlya" />
            <span>Low (&lt;70%): {low} rows</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}