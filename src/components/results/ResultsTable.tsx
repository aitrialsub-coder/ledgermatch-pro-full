/**
 * ResultsTable — Main results view with virtual scrolling
 * 
 * Orchestrates:
 * - SummaryCards (top stats)
 * - FilterBar (filter/sort/search)
 * - Virtualized DiffView rows (handles 10,000+ entries)
 * - MatchDetailDrawer (slide-out on row click)
 * - Keyboard navigation
 * - Matching progress overlay
 */

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SummaryCards } from './SummaryCards';
import { FilterBar } from './FilterBar';
import { DiffViewRow } from './DiffView';
import { MatchDetailDrawer } from './MatchDetailDrawer';
import { useMatchStore } from '@/stores/matchStore';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useAppStore } from '@/stores/appStore';
import { useMatching } from '@/hooks/useMatching';
import { useKeyboard } from '@/hooks/useKeyboard';
import type { LedgerEntry, MatchGroup } from '@/types';
import { cn } from '@/lib/cn';

const ROW_HEIGHT = 48; // px per row

export function ResultsTable() {
  const matchGroups = useMatchStore((s) => s.matchGroups);
  const getFilteredGroups = useMatchStore((s) => s.getFilteredGroups);
  const selectedRowIndex = useMatchStore((s) => s.selectedRowIndex);
  const setSelectedRowIndex = useMatchStore((s) => s.setSelectedRowIndex);
  const isMatching = useMatchStore((s) => s.isMatching);
  const progress = useMatchStore((s) => s.progress);
  const result = useMatchStore((s) => s.result);

  const entriesA = useLedgerStore((s) => s.entriesA);
  const entriesB = useLedgerStore((s) => s.entriesB);

  const setDetailDrawer = useAppStore((s) => s.setDetailDrawer);
  const isDetailDrawerOpen = useAppStore((s) => s.isDetailDrawerOpen);
  const selectedMatchGroupId = useAppStore((s) => s.selectedMatchGroupId);
  const setStep = useAppStore((s) => s.setStep);

  const { startMatching, cancelMatching, isReady } = useMatching();

  // Entry lookup maps
  const entryMapA = useMemo(
    () => new Map(entriesA.map((e) => [e.id, e])),
    [entriesA]
  );
  const entryMapB = useMemo(
    () => new Map(entriesB.map((e) => [e.id, e])),
    [entriesB]
  );

  // Filtered and sorted groups
  const filteredGroups = useMemo(() => getFilteredGroups(), [getFilteredGroups]);

  // Virtual list container ref
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtual list
  const virtualizer = useVirtualizer({
    count: filteredGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // Scroll to selected row
  useEffect(() => {
    if (selectedRowIndex >= 0 && selectedRowIndex < filteredGroups.length) {
      virtualizer.scrollToIndex(selectedRowIndex, { align: 'auto' });
    }
  }, [selectedRowIndex, filteredGroups.length, virtualizer]);

  // Row click handler
  const handleRowClick = useCallback(
    (group: MatchGroup, index: number) => {
      setSelectedRowIndex(index);
      setDetailDrawer(true, group.id);
    },
    [setSelectedRowIndex, setDetailDrawer]
  );

  // Keyboard navigation
  useKeyboard({
    enabled: !isMatching,
    onExport: () => setStep('export'),
    onSearch: () => {
      // Focus search input — handled by FilterBar
    },
  });

  // ── Matching in progress ──
  if (isMatching && progress) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-primary" />
            <h2 className="text-lg font-semibold">Matching in Progress</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {progress.message}
            </p>
          </div>

          <Progress
            value={progress.overallProgress * 100}
            showLabel
            label={`Pass ${progress.passNumber} of ${progress.totalPasses}`}
            className="h-3"
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress.matchesFoundSoFar} matches found so far
            </span>
            <span>
              {(progress.timeElapsedMs / 1000).toFixed(1)}s elapsed
            </span>
          </div>

          <div className="text-center">
            <Button variant="outline" size="sm" onClick={cancelMatching}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── No results yet ──
  if (!result || matchGroups.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Play className="mb-3 h-12 w-12 text-muted-foreground/30" />
        <h2 className="text-lg font-semibold">No Results Yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your matching rules and run the engine.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => setStep('configure')}>
            Configure
          </Button>
          <Button onClick={startMatching} disabled={!isReady}>
            <Play className="mr-1 h-4 w-4" />
            Run Matching
          </Button>
        </div>
      </div>
    );
  }

  // ── Results view ──
  return (
    <div className="flex h-full flex-col">
      {/* Summary cards */}
      <SummaryCards />

      {/* Filter bar */}
      <div className="mt-3 mb-2">
        <FilterBar />
      </div>

      {/* Table header */}
      <div className="flex items-stretch border-b bg-muted/50 text-2xs font-medium text-muted-foreground">
        <div className="flex flex-1 items-center gap-2 px-2 py-1.5">
          <span className="w-16 shrink-0">Date</span>
          <span className="flex-1">Ledger A</span>
          <span className="shrink-0">Amount</span>
        </div>
        <div className="flex w-24 items-center justify-center">
          Match
        </div>
        <div className="flex flex-1 items-center gap-2 px-2 py-1.5">
          <span className="w-16 shrink-0">Date</span>
          <span className="flex-1">Ledger B</span>
          <span className="shrink-0">Amount</span>
        </div>
        <div className="w-6" />
      </div>

      {/* Virtual scrolling table body */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const group = filteredGroups[virtualRow.index];
            if (!group) return null;

            const entryA =
              group.entriesA.length > 0
                ? entryMapA.get(group.entriesA[0]) ?? null
                : null;
            const entryB =
              group.entriesB.length > 0
                ? entryMapB.get(group.entriesB[0]) ?? null
                : null;

            return (
              <div
                key={group.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <DiffViewRow
                  matchGroup={group}
                  entryA={entryA}
                  entryB={entryB}
                  isSelected={selectedRowIndex === virtualRow.index}
                  onClick={() => handleRowClick(group, virtualRow.index)}
                  rowIndex={virtualRow.index}
                />
              </div>
            );
          })}
        </div>

        {/* Empty filtered state */}
        {filteredGroups.length === 0 && (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No entries match the current filter.
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between border-t bg-card px-3 py-1.5 text-2xs text-muted-foreground">
        <span>
          {filteredGroups.length} of {matchGroups.length} entries shown
        </span>
        <div className="flex items-center gap-3">
          <span>
            Use <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> to navigate,{' '}
            <kbd className="kbd">Enter</kbd> for details
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-2xs"
            onClick={() => setStep('export')}
          >
            Export Results
          </Button>
        </div>
      </div>

      {/* Detail drawer */}
      <MatchDetailDrawer
        open={isDetailDrawerOpen}
        matchGroupId={selectedMatchGroupId}
        entryMapA={entryMapA}
        entryMapB={entryMapB}
        onClose={() => setDetailDrawer(false)}
      />
    </div>
  );
}