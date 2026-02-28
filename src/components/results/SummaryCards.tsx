/**
 * SummaryCards — Top-level stats bar above results table
 * 
 * Shows key metrics at a glance:
 * - Total matched / unmatched
 * - Match rate
 * - Total discrepancy
 * - Processing time
 * - Average confidence
 */

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SplitSquareHorizontal,
  Clock,
  TrendingDown,
  Copy,
  Percent,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { useMatchStore } from '@/stores/matchStore';
import { cn } from '@/lib/cn';

export function SummaryCards() {
  const summary = useMatchStore((s) => s.summary);

  if (!summary) return null;

  const cards = [
    {
      icon: CheckCircle2,
      label: 'Matched',
      value: summary.matchedCount.toString(),
      subValue: `${(summary.matchRate * 100).toFixed(1)}%`,
      color: 'text-matched',
      bgColor: 'bg-matched/10',
      tooltip: `${summary.matchedCount} entries successfully matched across both ledgers`,
    },
    {
      icon: XCircle,
      label: 'Unmatched A',
      value: summary.unmatchedACount.toString(),
      subValue: `$${summary.unmatchedAmountA.toFixed(0)}`,
      color: 'text-onlya',
      bgColor: 'bg-onlya/10',
      tooltip: `${summary.unmatchedACount} entries in Ledger A with no match in Ledger B`,
    },
    {
      icon: AlertTriangle,
      label: 'Unmatched B',
      value: summary.unmatchedBCount.toString(),
      subValue: `$${summary.unmatchedAmountB.toFixed(0)}`,
      color: 'text-onlyb',
      bgColor: 'bg-onlyb/10',
      tooltip: `${summary.unmatchedBCount} entries in Ledger B with no match in Ledger A`,
    },
    {
      icon: SplitSquareHorizontal,
      label: 'Split',
      value: summary.splitCount.toString(),
      color: 'text-split',
      bgColor: 'bg-split/10',
      tooltip: `${summary.splitCount} split transactions detected (one-to-many)`,
    },
    {
      icon: Copy,
      label: 'Duplicates',
      value: summary.duplicateCount.toString(),
      color: 'text-duplicate',
      bgColor: 'bg-duplicate/10',
      tooltip: `${summary.duplicateCount} duplicate entries detected within same ledger`,
    },
    {
      icon: TrendingDown,
      label: 'Discrepancy',
      value: `$${summary.totalDiscrepancy.toFixed(2)}`,
      color: summary.totalDiscrepancy > 0 ? 'text-onlya' : 'text-matched',
      bgColor: summary.totalDiscrepancy > 0 ? 'bg-onlya/10' : 'bg-matched/10',
      tooltip: `Absolute difference between total amounts: |A - B|`,
    },
    {
      icon: Percent,
      label: 'Confidence',
      value: `${summary.averageConfidence}%`,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      tooltip: 'Average confidence score across all matched entries',
    },
    {
      icon: Clock,
      label: 'Time',
      value: `${(summary.processingTimeMs / 1000).toFixed(1)}s`,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      tooltip: 'Total matching engine processing time',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 lg:grid-cols-8">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Tooltip key={card.label}>
            <TooltipTrigger asChild>
              <Card className="cursor-default transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col items-center p-2 text-center">
                  <div
                    className={cn(
                      'mb-1 flex h-6 w-6 items-center justify-center rounded-full',
                      card.bgColor
                    )}
                  >
                    <Icon className={cn('h-3 w-3', card.color)} />
                  </div>
                  <p className={cn('text-sm font-bold leading-tight', card.color)}>
                    {card.value}
                  </p>
                  <p className="text-2xs text-muted-foreground">{card.label}</p>
                  {card.subValue && (
                    <p className="text-2xs text-muted-foreground/70">
                      {card.subValue}
                    </p>
                  )}
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{card.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}