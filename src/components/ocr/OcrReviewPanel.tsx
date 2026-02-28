/**
 * OcrReviewPanel — Review and correct OCR results before matching
 * 
 * Allows users to:
 * - See all parsed entries in a table
 * - Identify low-confidence rows
 * - Edit parsed values inline
 * - Override column mappings
 * - Confirm data is correct before matching
 */

import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Check,
  Edit3,
  ArrowRight,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { LedgerEntry, Party } from '@/types';
import { cn } from '@/lib/cn';
import { OCR_CONFIDENCE_MEDIUM } from '@/constants';

export function OcrReviewPanel() {
  const entriesA = useLedgerStore((s) => s.entriesA);
  const entriesB = useLedgerStore((s) => s.entriesB);
  const summaryA = useLedgerStore((s) => s.summaryA);
  const summaryB = useLedgerStore((s) => s.summaryB);
  const setStep = useAppStore((s) => s.setStep);
  const markStepComplete = useAppStore((s) => s.markStepComplete);
  const showConfidence = useSettingsStore((s) => s.showOcrConfidenceOverlay);
  const setShowConfidence = useSettingsStore((s) => s.setShowOcrConfidenceOverlay);

  const handleProceed = () => {
    markStepComplete('ocr_review');
    setStep('configure');
  };

  const lowConfidenceA = entriesA.filter(
    (e) => e.ocrConfidence < OCR_CONFIDENCE_MEDIUM
  ).length;
  const lowConfidenceB = entriesB.filter(
    (e) => e.ocrConfidence < OCR_CONFIDENCE_MEDIUM
  ).length;
  const totalLowConf = lowConfidenceA + lowConfidenceB;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold">Review OCR Results</h1>
          <p className="text-sm text-muted-foreground">
            Verify parsed data and correct any OCR errors before matching.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfidence(!showConfidence)}
          >
            {showConfidence ? (
              <EyeOff className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Eye className="mr-1 h-3.5 w-3.5" />
            )}
            Confidence
          </Button>
        </div>
      </div>

      {/* Warning banner */}
      {totalLowConf > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{totalLowConf}</strong> rows have low OCR confidence.
            Review highlighted rows below.
          </span>
        </div>
      )}

      {/* Tabs for Ledger A and B */}
      <Tabs defaultValue="A" className="flex flex-1 flex-col">
        <TabsList className="w-full">
          <TabsTrigger value="A" className="flex-1">
            Ledger A
            <Badge variant="secondary" className="ml-1.5">
              {entriesA.length}
            </Badge>
            {lowConfidenceA > 0 && (
              <Badge variant="warning" className="ml-1">
                {lowConfidenceA} ⚠
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="B" className="flex-1">
            Ledger B
            <Badge variant="secondary" className="ml-1.5">
              {entriesB.length}
            </Badge>
            {lowConfidenceB > 0 && (
              <Badge variant="warning" className="ml-1">
                {lowConfidenceB} ⚠
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="A" className="flex-1 overflow-hidden">
          <EntryReviewTable
            entries={entriesA}
            party="A"
            showConfidence={showConfidence}
          />
        </TabsContent>

        <TabsContent value="B" className="flex-1 overflow-hidden">
          <EntryReviewTable
            entries={entriesB}
            party="B"
            showConfidence={showConfidence}
          />
        </TabsContent>
      </Tabs>

      {/* Proceed button */}
      <div className="mt-3 flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep('upload')}>
          Back
        </Button>
        <Button onClick={handleProceed}>
          Continue to Configure
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Entry Review Table ──────────────────────────────────────

interface EntryReviewTableProps {
  entries: LedgerEntry[];
  party: Party;
  showConfidence: boolean;
}

function EntryReviewTable({
  entries,
  party,
  showConfidence,
}: EntryReviewTableProps) {
  const updateEntry = useLedgerStore((s) => s.updateEntry);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editField, setEditField] = useState<string>('');
  const [editValue, setEditValue] = useState<string>('');
  const [filterLowConf, setFilterLowConf] = useState(false);

  const displayEntries = useMemo(() => {
    if (filterLowConf) {
      return entries.filter((e) => e.ocrConfidence < OCR_CONFIDENCE_MEDIUM);
    }
    return entries;
  }, [entries, filterLowConf]);

  const startEdit = (entryId: string, field: string, currentValue: string) => {
    setEditingId(entryId);
    setEditField(field);
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (!editingId) return;

    const updates: Partial<LedgerEntry> = {};
    switch (editField) {
      case 'date':
        updates.date = editValue || null;
        break;
      case 'description':
        updates.description = editValue;
        break;
      case 'debit':
        updates.debit = editValue ? parseFloat(editValue) : null;
        break;
      case 'credit':
        updates.credit = editValue ? parseFloat(editValue) : null;
        break;
      case 'refNumber':
        updates.refNumber = editValue || null;
        break;
    }

    // Recalculate amount
    if (editField === 'debit' || editField === 'credit') {
      const entry = entries.find((e) => e.id === editingId);
      if (entry) {
        const newDebit =
          editField === 'debit'
            ? updates.debit ?? entry.debit
            : entry.debit;
        const newCredit =
          editField === 'credit'
            ? updates.credit ?? entry.credit
            : entry.credit;
        const amount = (newCredit ?? 0) - (newDebit ?? 0);
        updates.amount = amount;
        updates.amountAbs = Math.abs(amount);
        updates.amountCents = Math.round(amount * 100);
      }
    }

    updates.manualOverrides = {
      [editField]: editValue,
      overriddenFields: [editField],
      overriddenAt: Date.now(),
    };

    updateEntry(editingId, updates);
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Filter toggle */}
      <div className="mb-2 flex items-center gap-2">
        <Button
          variant={filterLowConf ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFilterLowConf(!filterLowConf)}
        >
          <AlertTriangle className="mr-1 h-3 w-3" />
          {filterLowConf ? 'Show all' : 'Show low confidence only'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {displayEntries.length} entries
        </span>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1 rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="w-24">Date</TableHead>
              <TableHead className="min-w-[150px]">Description</TableHead>
              <TableHead className="w-24 text-right">Debit</TableHead>
              <TableHead className="w-24 text-right">Credit</TableHead>
              <TableHead className="w-20">Ref</TableHead>
              {showConfidence && (
                <TableHead className="w-16 text-center">Conf</TableHead>
              )}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayEntries.map((entry) => {
              const isLowConf = entry.ocrConfidence < OCR_CONFIDENCE_MEDIUM;
              const isEditing = editingId === entry.id;

              return (
                <TableRow
                  key={entry.id}
                  className={cn(
                    isLowConf && 'bg-yellow-50/50',
                    entry.manualOverrides && 'bg-blue-50/30'
                  )}
                >
                  <TableCell className="text-2xs text-muted-foreground">
                    {entry.rowIndex + 1}
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      value={entry.date ?? ''}
                      isEditing={isEditing && editField === 'date'}
                      editValue={editValue}
                      onEditValueChange={setEditValue}
                      onStartEdit={() =>
                        startEdit(entry.id, 'date', entry.date ?? '')
                      }
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      className="text-xs"
                    />
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      value={entry.description}
                      isEditing={isEditing && editField === 'description'}
                      editValue={editValue}
                      onEditValueChange={setEditValue}
                      onStartEdit={() =>
                        startEdit(entry.id, 'description', entry.description)
                      }
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      className="text-xs truncate max-w-[200px]"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={entry.debit?.toFixed(2) ?? ''}
                      isEditing={isEditing && editField === 'debit'}
                      editValue={editValue}
                      onEditValueChange={setEditValue}
                      onStartEdit={() =>
                        startEdit(
                          entry.id,
                          'debit',
                          entry.debit?.toFixed(2) ?? ''
                        )
                      }
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      className="text-xs font-mono text-onlya"
                      align="right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditableCell
                      value={entry.credit?.toFixed(2) ?? ''}
                      isEditing={isEditing && editField === 'credit'}
                      editValue={editValue}
                      onEditValueChange={setEditValue}
                      onStartEdit={() =>
                        startEdit(
                          entry.id,
                          'credit',
                          entry.credit?.toFixed(2) ?? ''
                        )
                      }
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      className="text-xs font-mono text-matched"
                      align="right"
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-2xs text-muted-foreground">
                      {entry.refNumber ?? '—'}
                    </span>
                  </TableCell>
                  {showConfidence && (
                    <TableCell className="text-center">
                      <ConfidenceBadge value={entry.ocrConfidence} />
                    </TableCell>
                  )}
                  <TableCell>
                    {entry.manualOverrides && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Edit3 className="h-3 w-3 text-blue-500" />
                        </TooltipTrigger>
                        <TooltipContent>Manually edited</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

// ─── Editable Cell ───────────────────────────────────────────

interface EditableCellProps {
  value: string;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (value: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
  align?: 'left' | 'right';
}

function EditableCell({
  value,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onSave,
  onCancel,
  className,
  align,
}: EditableCellProps) {
  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave();
            if (e.key === 'Escape') onCancel();
          }}
          className="h-6 text-xs"
          autoFocus
        />
        <button
          onClick={onSave}
          className="rounded p-0.5 hover:bg-accent"
        >
          <Check className="h-3 w-3 text-matched" />
        </button>
      </div>
    );
  }

  return (
    <span
      className={cn(
        'cursor-pointer rounded px-1 py-0.5 hover:bg-accent',
        className
      )}
      onDoubleClick={onStartEdit}
      title="Double-click to edit"
    >
      {value || '—'}
    </span>
  );
}

// ─── Confidence Badge ────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const rounded = Math.round(value);
  let variant: 'success' | 'warning' | 'error' = 'success';

  if (rounded < 50) variant = 'error';
  else if (rounded < 70) variant = 'warning';

  return (
    <Badge variant={variant} className="text-2xs px-1 py-0">
      {rounded}%
    </Badge>
  );
}