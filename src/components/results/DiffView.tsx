/**
 * DiffView — Single row in the results table showing side-by-side comparison
 * 
 * Shows:
 * - Entry A data | Match indicator | Entry B data
 * - Color-coded by match type
 * - Confidence badge
 * - Status badge
 * - Click to open detail drawer
 */

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SplitSquareHorizontal,
  Copy,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import type { MatchGroup, LedgerEntry, MatchType } from '@/types';
import {
  MATCH_TYPE_LABELS,
  MATCH_TYPE_COLORS,
  MATCH_STATUS_LABELS,
  MATCH_STATUS_COLORS,
} from '@/constants';
import { cn } from '@/lib/cn';

interface DiffViewRowProps {
  matchGroup: MatchGroup;
  entryA: LedgerEntry | null;
  entryB: LedgerEntry | null;
  isSelected: boolean;
  onClick: () => void;
  rowIndex: number;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  exact: CheckCircle2,
  amount_date: CheckCircle2,
  fuzzy: AlertTriangle,
  split: SplitSquareHorizontal,
  unmatched_a: XCircle,
  unmatched_b: XCircle,
  duplicate: Copy,
};

export function DiffViewRow({
  matchGroup,
  entryA,
  entryB,
  isSelected,
  onClick,
  rowIndex,
}: DiffViewRowProps) {
  const TypeIcon = TYPE_ICONS[matchGroup.matchType] ?? AlertTriangle;
  const hasComments = matchGroup.comments.length > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-stretch border-b text-left transition-colors hover:bg-accent/50',
        isSelected && 'bg-accent ring-1 ring-primary/20',
        getRowBgClass(matchGroup.matchType)
      )}
      data-row-index={rowIndex}
    >
      {/* Left side — Entry A */}
      <div className="flex min-w-0 flex-1 items-center gap-2 border-r px-2 py-1.5">
        {entryA ? (
          <>
            <span className="w-16 shrink-0 text-2xs text-muted-foreground">
              {entryA.date ?? '—'}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">
              {entryA.description || '(no description)'}
            </span>
            <AmountCell
              debit={entryA.debit}
              credit={entryA.credit}
              amount={entryA.amount}
            />
          </>
        ) : (
          <span className="flex-1 text-center text-2xs italic text-muted-foreground/50">
            {matchGroup.matchType === 'unmatched_b'
              ? '— no matching entry —'
              : ''}
          </span>
        )}
      </div>

      {/* Center — Match indicator */}
      <div className="flex w-24 shrink-0 flex-col items-center justify-center gap-0.5 px-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <TypeIcon
                className={cn(
                  'h-3 w-3',
                  getTypeIconColor(matchGroup.matchType)
                )}
              />
              <span className="text-2xs font-medium">
                {matchGroup.confidence > 0
                  ? `${matchGroup.confidence}%`
                  : ''}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px]">
            <p className="text-xs font-medium">
              {MATCH_TYPE_LABELS[matchGroup.matchType]}
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {matchGroup.matchReason}
            </p>
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-0.5">
          <Badge
            className={cn(
              'px-1 py-0 text-2xs',
              MATCH_STATUS_COLORS[matchGroup.status]
            )}
          >
            {MATCH_STATUS_LABELS[matchGroup.status]?.[0] ?? 'O'}
          </Badge>
          {hasComments && (
            <MessageSquare className="h-2.5 w-2.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Right side — Entry B */}
      <div className="flex min-w-0 flex-1 items-center gap-2 border-l px-2 py-1.5">
        {entryB ? (
          <>
            <span className="w-16 shrink-0 text-2xs text-muted-foreground">
              {entryB.date ?? '—'}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">
              {entryB.description || '(no description)'}
            </span>
            <AmountCell
              debit={entryB.debit}
              credit={entryB.credit}
              amount={entryB.amount}
            />
          </>
        ) : (
          <span className="flex-1 text-center text-2xs italic text-muted-foreground/50">
            {matchGroup.matchType === 'unmatched_a'
              ? '— no matching entry —'
              : ''}
          </span>
        )}
      </div>

      {/* Arrow */}
      <div className="flex w-6 items-center justify-center">
        <ChevronRight className="h-3 w-3 text-muted-foreground/30 transition-colors group-hover:text-foreground" />
      </div>
    </button>
  );
}

// ─── Amount cell ─────────────────────────────────────────────

function AmountCell({
  debit,
  credit,
  amount,
}: {
  debit: number | null;
  credit: number | null;
  amount: number;
}) {
  if (debit != null && debit > 0) {
    return (
      <span className="shrink-0 font-mono text-2xs text-onlya">
        -{debit.toFixed(2)}
      </span>
    );
  }
  if (credit != null && credit > 0) {
    return (
      <span className="shrink-0 font-mono text-2xs text-matched">
        +{credit.toFixed(2)}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'shrink-0 font-mono text-2xs',
        amount >= 0 ? 'text-matched' : 'text-onlya'
      )}
    >
      {amount >= 0 ? '+' : ''}
      {amount.toFixed(2)}
    </span>
  );
}

// ─── Row background class ────────────────────────────────────

function getRowBgClass(matchType: MatchType): string {
  switch (matchType) {
    case 'exact':
    case 'amount_date':
      return 'border-l-2 border-l-matched';
    case 'fuzzy':
      return 'border-l-2 border-l-partial';
    case 'split':
      return 'border-l-2 border-l-split';
    case 'unmatched_a':
      return 'border-l-2 border-l-onlya bg-onlya-light/30';
    case 'unmatched_b':
      return 'border-l-2 border-l-onlyb bg-onlyb-light/30';
    case 'duplicate':
      return 'border-l-2 border-l-duplicate bg-duplicate-light/30';
    default:
      return '';
  }
}

function getTypeIconColor(matchType: MatchType): string {
  switch (matchType) {
    case 'exact':
    case 'amount_date':
      return 'text-matched';
    case 'fuzzy':
      return 'text-partial';
    case 'split':
      return 'text-split';
    case 'unmatched_a':
      return 'text-onlya';
    case 'unmatched_b':
      return 'text-onlyb';
    case 'duplicate':
      return 'text-duplicate';
    default:
      return 'text-muted-foreground';
  }
}