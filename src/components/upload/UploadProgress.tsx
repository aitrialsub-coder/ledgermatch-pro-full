/**
 * UploadProgress — Shows OCR processing progress
 * 
 * Displays:
 * - Current stage (loading, preprocessing, recognizing, parsing)
 * - Page progress for multi-page documents
 * - Overall progress bar
 * - Estimated time remaining
 */

import React from 'react';
import {
  FileSearch,
  ImageDown,
  ScanSearch,
  TableProperties,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { OcrProgress, OcrStage } from '@/types';
import { cn } from '@/lib/cn';

interface UploadProgressProps {
  progress: OcrProgress;
}

const STAGE_CONFIG: Record<
  OcrStage,
  {
    icon: React.ElementType;
    label: string;
    color: string;
  }
> = {
  idle: { icon: Loader2, label: 'Preparing...', color: 'text-muted-foreground' },
  loading_file: { icon: FileSearch, label: 'Loading file', color: 'text-blue-500' },
  rendering_pdf: { icon: ImageDown, label: 'Rendering PDF', color: 'text-blue-500' },
  preprocessing: { icon: ImageDown, label: 'Preprocessing', color: 'text-purple-500' },
  recognizing: { icon: ScanSearch, label: 'OCR Recognition', color: 'text-orange-500' },
  parsing: { icon: TableProperties, label: 'Parsing data', color: 'text-teal-500' },
  validating: { icon: TableProperties, label: 'Validating', color: 'text-teal-500' },
  complete: { icon: CheckCircle2, label: 'Complete', color: 'text-matched' },
  error: { icon: Loader2, label: 'Error', color: 'text-destructive' },
};

export function UploadProgress({ progress }: UploadProgressProps) {
  const config = STAGE_CONFIG[progress.stage] ?? STAGE_CONFIG.idle;
  const Icon = config.icon;
  const isComplete = progress.stage === 'complete';
  const isAnimating = !isComplete && progress.stage !== 'error';
  const overallPercent = Math.round(progress.overallProgress * 100);

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* Stage icon */}
      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full bg-muted',
          isComplete && 'bg-matched/10'
        )}
      >
        <Icon
          className={cn(
            'h-7 w-7',
            config.color,
            isAnimating && 'animate-pulse'
          )}
        />
      </div>

      {/* Stage label */}
      <div className="text-center">
        <p className="text-sm font-medium">{config.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {progress.message}
        </p>
      </div>

      {/* Page progress */}
      {progress.totalPages > 1 && (
        <div className="w-full text-center text-xs text-muted-foreground">
          Page {progress.currentPage} of {progress.totalPages}
        </div>
      )}

      {/* Overall progress bar */}
      <div className="w-full">
        <Progress
          value={overallPercent}
          showLabel
          className="h-2"
          indicatorClassName={cn(
            progress.stage === 'error' && 'bg-destructive',
            isComplete && 'bg-matched'
          )}
        />
      </div>

      {/* Stage pipeline */}
      <div className="flex w-full items-center justify-between px-2">
        {(['loading_file', 'preprocessing', 'recognizing', 'parsing'] as OcrStage[]).map(
          (stage, index) => {
            const stageConf = STAGE_CONFIG[stage];
            const StageIcon = stageConf.icon;

            const stageOrder: OcrStage[] = [
              'loading_file',
              'rendering_pdf',
              'preprocessing',
              'recognizing',
              'parsing',
              'validating',
              'complete',
            ];

            const currentIdx = stageOrder.indexOf(progress.stage);
            const thisIdx = stageOrder.indexOf(stage);

            const isPast = currentIdx > thisIdx;
            const isCurrent = progress.stage === stage;

            return (
              <div
                key={stage}
                className="flex flex-col items-center gap-1"
              >
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                    isPast && 'border-matched bg-matched/10',
                    isCurrent && 'border-primary bg-primary/10',
                    !isPast && !isCurrent && 'border-muted bg-muted'
                  )}
                >
                  {isPast ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-matched" />
                  ) : (
                    <StageIcon
                      className={cn(
                        'h-3 w-3',
                        isCurrent ? 'text-primary animate-pulse' : 'text-muted-foreground/40'
                      )}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    'text-2xs',
                    isCurrent
                      ? 'font-medium text-foreground'
                      : isPast
                        ? 'text-matched'
                        : 'text-muted-foreground/40'
                  )}
                >
                  {stageConf.label.split(' ')[0]}
                </span>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}