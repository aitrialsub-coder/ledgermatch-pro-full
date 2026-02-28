/**
 * MatchDetailDrawer — Slide-out panel showing full match details
 * 
 * Shows:
 * - Match type, confidence, and reason
 * - Side-by-side entry comparison with field diffs
 * - Raw OCR text for both entries
 * - Status management (Resolved/Disputed/Ignored)
 * - Comment thread
 * - Split match breakdown (all sub-entries)
 */

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Send,
  Eye,
  ArrowRight,
  Copy,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useMatchStore } from '@/stores/matchStore';
import type { MatchGroup, LedgerEntry, MatchStatus } from '@/types';
import {
  MATCH_TYPE_LABELS,
  MATCH_STATUS_LABELS,
  MATCH_STATUS_COLORS,
} from '@/constants';
import { cn } from '@/lib/cn';

interface MatchDetailDrawerProps {
  open: boolean;
  matchGroupId: string | null;
  entryMapA: Map<string, LedgerEntry>;
  entryMapB: Map<string, LedgerEntry>;
  onClose: () => void;
}

export function MatchDetailDrawer({
  open,
  matchGroupId,
  entryMapA,
  entryMapB,
  onClose,
}: MatchDetailDrawerProps) {
  const matchGroups = useMatchStore((s) => s.matchGroups);
  const updateMatchStatus = useMatchStore((s) => s.updateMatchStatus);
  const addComment = useMatchStore((s) => s.addComment);

  const [commentText, setCommentText] = useState('');

  const matchGroup = useMemo(
    () => matchGroups.find((mg) => mg.id === matchGroupId) ?? null,
    [matchGroups, matchGroupId]
  );

  if (!matchGroup) {
    return (
      <Sheet open={open} onOpenChange={() => onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>No match selected</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const entriesA = matchGroup.entriesA
    .map((id) => entryMapA.get(id))
    .filter(Boolean) as LedgerEntry[];
  const entriesB = matchGroup.entriesB
    .map((id) => entryMapB.get(id))
    .filter(Boolean) as LedgerEntry[];

  const handleStatusChange = (status: MatchStatus) => {
    updateMatchStatus(matchGroup.id, status);
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    addComment(matchGroup.id, {
      matchGroupId: matchGroup.id,
      text: commentText.trim(),
      createdBy: 'local',
    });
    setCommentText('');
  };

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
        {/* Header */}
        <div className="border-b p-4">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <SheetTitle className="text-base">
                {MATCH_TYPE_LABELS[matchGroup.matchType]}
              </SheetTitle>
              <Badge
                className={cn(
                  'text-xs',
                  MATCH_STATUS_COLORS[matchGroup.status]
                )}
              >
                {MATCH_STATUS_LABELS[matchGroup.status]}
              </Badge>
            </div>
            <SheetDescription className="text-xs">
              Pass {matchGroup.passNumber} · Confidence: {matchGroup.confidence}%
              · ID: {matchGroup.id.substring(0, 8)}
            </SheetDescription>
          </SheetHeader>

          {/* Match reason */}
          <div className="mt-3 rounded-md bg-muted p-2.5 text-xs">
            <p className="font-medium text-foreground">Match Reason</p>
            <p className="mt-0.5 text-muted-foreground">
              {matchGroup.matchReason}
            </p>
          </div>

          {/* Status buttons */}
          <div className="mt-3 flex gap-1.5">
            {(['open', 'resolved', 'disputed', 'ignored'] as MatchStatus[]).map(
              (status) => (
                <Button
                  key={status}
                  variant={
                    matchGroup.status === status ? 'default' : 'outline'
                  }
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => handleStatusChange(status)}
                >
                  {status === 'resolved' && (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  )}
                  {status === 'disputed' && (
                    <XCircle className="mr-1 h-3 w-3" />
                  )}
                  {MATCH_STATUS_LABELS[status]}
                </Button>
              )
            )}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            <Tabs defaultValue="comparison">
              <TabsList className="w-full">
                <TabsTrigger value="comparison" className="flex-1 text-xs">
                  Comparison
                </TabsTrigger>
                <TabsTrigger value="raw" className="flex-1 text-xs">
                  Raw Data
                </TabsTrigger>
                <TabsTrigger value="comments" className="flex-1 text-xs">
                  Comments
                  {matchGroup.comments.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-2xs">
                      {matchGroup.comments.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Comparison tab */}
              <TabsContent value="comparison" className="mt-3 space-y-4">
                {/* Side by side fields */}
                <ComparisonTable entriesA={entriesA} entriesB={entriesB} />

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MetricBox
                    label="Amount Diff"
                    value={`$${matchGroup.amountDifference.toFixed(2)}`}
                    highlight={matchGroup.amountDifference > 0}
                  />
                  <MetricBox
                    label="Date Diff"
                    value={
                      matchGroup.dateDifference >= 0
                        ? `${matchGroup.dateDifference}d`
                        : 'N/A'
                    }
                    highlight={matchGroup.dateDifference > 0}
                  />
                  <MetricBox
                    label="Desc. Sim."
                    value={
                      matchGroup.descriptionSimilarity > 0
                        ? `${(matchGroup.descriptionSimilarity * 100).toFixed(0)}%`
                        : 'N/A'
                    }
                  />
                </div>
              </TabsContent>

              {/* Raw data tab */}
              <TabsContent value="raw" className="mt-3 space-y-4">
                {entriesA.map((entry, i) => (
                  <RawDataBlock
                    key={entry.id}
                    label={`Ledger A ${entriesA.length > 1 ? `#${i + 1}` : ''}`}
                    entry={entry}
                  />
                ))}
                {entriesB.map((entry, i) => (
                  <RawDataBlock
                    key={entry.id}
                    label={`Ledger B ${entriesB.length > 1 ? `#${i + 1}` : ''}`}
                    entry={entry}
                  />
                ))}
              </TabsContent>

              {/* Comments tab */}
              <TabsContent value="comments" className="mt-3">
                <div className="space-y-3">
                  {matchGroup.comments.length === 0 && (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      No comments yet
                    </p>
                  )}

                  {matchGroup.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-md border p-2.5"
                    >
                      <div className="flex items-center justify-between text-2xs text-muted-foreground">
                        <span>{comment.createdBy}</span>
                        <span>
                          {new Date(comment.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-xs">{comment.text}</p>
                    </div>
                  ))}

                  {/* Add comment */}
                  <div className="flex gap-2">
                    <Input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add a comment..."
                      className="text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComment();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={handleAddComment}
                      disabled={!commentText.trim()}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Comparison Table ────────────────────────────────────────

function ComparisonTable({
  entriesA,
  entriesB,
}: {
  entriesA: LedgerEntry[];
  entriesB: LedgerEntry[];
}) {
  const entryA = entriesA[0] ?? null;
  const entryB = entriesB[0] ?? null;

  const fields: Array<{
    label: string;
    valueA: string;
    valueB: string;
    isDifferent: boolean;
  }> = [
    {
      label: 'Date',
      valueA: entryA?.date ?? '—',
      valueB: entryB?.date ?? '—',
      isDifferent: entryA?.date !== entryB?.date,
    },
    {
      label: 'Description',
      valueA: entryA?.description ?? '—',
      valueB: entryB?.description ?? '—',
      isDifferent: entryA?.description !== entryB?.description,
    },
    {
      label: 'Debit',
      valueA: entryA?.debit != null ? `$${entryA.debit.toFixed(2)}` : '—',
      valueB: entryB?.debit != null ? `$${entryB.debit.toFixed(2)}` : '—',
      isDifferent: entryA?.debit !== entryB?.debit,
    },
    {
      label: 'Credit',
      valueA: entryA?.credit != null ? `$${entryA.credit.toFixed(2)}` : '—',
      valueB: entryB?.credit != null ? `$${entryB.credit.toFixed(2)}` : '—',
      isDifferent: entryA?.credit !== entryB?.credit,
    },
    {
      label: 'Balance',
      valueA: entryA?.balance != null ? `$${entryA.balance.toFixed(2)}` : '—',
      valueB: entryB?.balance != null ? `$${entryB.balance.toFixed(2)}` : '—',
      isDifferent: entryA?.balance !== entryB?.balance,
    },
    {
      label: 'Reference',
      valueA: entryA?.refNumber ?? '—',
      valueB: entryB?.refNumber ?? '—',
      isDifferent: entryA?.refNumber !== entryB?.refNumber,
    },
    {
      label: 'Net Amount',
      valueA: entryA ? `$${entryA.amount.toFixed(2)}` : '—',
      valueB: entryB ? `$${entryB.amount.toFixed(2)}` : '—',
      isDifferent: entryA?.amountCents !== entryB?.amountCents,
    },
    {
      label: 'OCR Confidence',
      valueA: entryA ? `${Math.round(entryA.ocrConfidence)}%` : '—',
      valueB: entryB ? `${Math.round(entryB.ocrConfidence)}%` : '—',
      isDifferent: false,
    },
  ];

  // If split match, show all sub-entries
  const showSplitEntries =
    (entriesA.length > 1 || entriesB.length > 1);

  return (
    <div className="space-y-3">
      {/* Field comparison */}
      <div className="rounded-md border">
        <div className="grid grid-cols-3 gap-0 border-b bg-muted/50 px-3 py-1.5 text-2xs font-medium text-muted-foreground">
          <span>Field</span>
          <span>Ledger A</span>
          <span>Ledger B</span>
        </div>
        {fields.map((field) => (
          <div
            key={field.label}
            className={cn(
              'grid grid-cols-3 gap-0 border-b px-3 py-1.5 text-xs last:border-0',
              field.isDifferent && 'bg-yellow-50/50'
            )}
          >
            <span className="text-2xs font-medium text-muted-foreground">
              {field.label}
            </span>
            <span className="truncate pr-2">{field.valueA}</span>
            <span className="truncate">
              {field.valueB}
              {field.isDifferent && field.valueA !== '—' && field.valueB !== '—' && (
                <AlertTriangle className="ml-1 inline h-3 w-3 text-partial" />
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Split entries detail */}
      {showSplitEntries && (
        <div className="space-y-2">
          <p className="text-xs font-medium">
            Split Transaction ({entriesA.length} A × {entriesB.length} B)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-2xs font-medium text-muted-foreground">
                Ledger A Entries
              </p>
              {entriesA.map((entry, i) => (
                <SplitEntryCard key={entry.id} entry={entry} index={i} />
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-2xs font-medium text-muted-foreground">
                Ledger B Entries
              </p>
              {entriesB.map((entry, i) => (
                <SplitEntryCard key={entry.id} entry={entry} index={i} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SplitEntryCard({
  entry,
  index,
}: {
  entry: LedgerEntry;
  index: number;
}) {
  return (
    <div className="rounded border p-1.5 text-2xs">
      <div className="flex justify-between">
        <span className="text-muted-foreground">#{index + 1}</span>
        <span className="font-mono font-medium">
          ${entry.amountAbs.toFixed(2)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-muted-foreground">
        {entry.date} · {entry.description}
      </p>
    </div>
  );
}

// ─── Raw Data Block ──────────────────────────────────────────

function RawDataBlock({
  label,
  entry,
}: {
  label: string;
  entry: LedgerEntry;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
        <span className="text-xs font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <Badge
            variant={entry.ocrConfidence >= 70 ? 'success' : 'warning'}
            className="text-2xs"
          >
            OCR: {Math.round(entry.ocrConfidence)}%
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-2xs"
            onClick={() => setShowRaw(!showRaw)}
          >
            <Eye className="mr-1 h-3 w-3" />
            {showRaw ? 'Parsed' : 'Raw'}
          </Button>
        </div>
      </div>

      <div className="p-3">
        {showRaw ? (
          <pre className="whitespace-pre-wrap break-all font-mono text-2xs text-muted-foreground">
            {entry.rawText}
          </pre>
        ) : (
          <div className="space-y-1 text-xs">
            <DetailRow label="Date" value={entry.date ?? '—'} />
            <DetailRow label="Description" value={entry.description} />
            <DetailRow
              label="Debit"
              value={entry.debit != null ? `$${entry.debit.toFixed(2)}` : '—'}
            />
            <DetailRow
              label="Credit"
              value={
                entry.credit != null ? `$${entry.credit.toFixed(2)}` : '—'
              }
            />
            <DetailRow
              label="Balance"
              value={
                entry.balance != null ? `$${entry.balance.toFixed(2)}` : '—'
              }
            />
            <DetailRow label="Reference" value={entry.refNumber ?? '—'} />
            <DetailRow
              label="Row / Page"
              value={`Row ${entry.rowIndex + 1}, Page ${entry.pageNumber}`}
            />
            {entry.manualOverrides && (
              <DetailRow
                label="Edited fields"
                value={entry.manualOverrides.overriddenFields?.join(', ') ?? ''}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-2xs text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 break-words text-xs">{value}</span>
    </div>
  );
}

// ─── Metric Box ──────────────────────────────────────────────

function MetricBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-sm font-bold',
          highlight ? 'text-partial' : 'text-foreground'
        )}
      >
        {value}
      </p>
    </div>
  );
}