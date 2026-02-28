/**
 * TemplateManager — Manage saved ledger format templates
 * 
 * Allows users to:
 * - View saved templates
 * - Create new templates from current column map
 * - Edit template names and settings
 * - Delete templates
 * - Apply templates to current upload
 */

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Copy,
  Check,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useAppStore } from '@/stores/appStore';
import type { LedgerTemplate, Party } from '@/types';
import { cn } from '@/lib/cn';

export function TemplateManager() {
  const templates = useSettingsStore((s) => s.templates);
  const addTemplate = useSettingsStore((s) => s.addTemplate);
  const updateTemplate = useSettingsStore((s) => s.updateTemplate);
  const deleteTemplate = useSettingsStore((s) => s.deleteTemplate);
  const addNotification = useAppStore((s) => s.addNotification);

  const columnMapA = useLedgerStore((s) => s.columnMapA);
  const columnMapB = useLedgerStore((s) => s.columnMapB);
  const numberFormatA = useLedgerStore((s) => s.numberFormatA);
  const numberFormatB = useLedgerStore((s) => s.numberFormatB);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateParty, setNewTemplateParty] = useState<Party>('A');

  const handleCreate = () => {
    const columnMap = newTemplateParty === 'A' ? columnMapA : columnMapB;
    const numberFormat = newTemplateParty === 'A' ? numberFormatA : numberFormatB;

    if (!columnMap) {
      addNotification({
        type: 'error',
        title: 'No column map',
        message: `Upload and parse Ledger ${newTemplateParty} first.`,
      });
      return;
    }

    const template: LedgerTemplate = {
      id: crypto.randomUUID(),
      name: newTemplateName || 'Untitled Template',
      headerPatterns: [],
      columnMap,
      skipPatterns: [],
      amountStyle: columnMap.amountStyle,
      numberFormat: numberFormat?.format ?? 'US',
      dateFormat: 'DD/MM/YYYY',
      isBuiltIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    addTemplate(template);
    setShowCreateDialog(false);
    setNewTemplateName('');

    addNotification({
      type: 'success',
      title: 'Template saved',
      message: `"${template.name}" saved for future use.`,
    });
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id);
    setShowDeleteDialog(null);
    addNotification({
      type: 'info',
      title: 'Template deleted',
    });
  };

  const startRename = (template: LedgerTemplate) => {
    setEditingId(template.id);
    setEditName(template.name);
  };

  const saveRename = () => {
    if (editingId && editName.trim()) {
      updateTemplate(editingId, { name: editName.trim() });
    }
    setEditingId(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Saved Templates</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Save Current
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p>No saved templates</p>
            <p className="mt-1">
              Save the current column mapping as a template for reuse.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-60">
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between rounded-md border p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    {editingId === template.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="h-6 text-xs"
                          autoFocus
                        />
                        <button
                          onClick={saveRename}
                          className="rounded p-0.5 hover:bg-accent"
                        >
                          <Check className="h-3 w-3 text-matched" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded p-0.5 hover:bg-accent"
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-xs font-medium">
                          {template.name}
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          {template.amountStyle.replace(/_/g, ' ')} ·{' '}
                          {template.numberFormat} ·{' '}
                          {new Date(template.createdAt).toLocaleDateString()}
                        </p>
                      </>
                    )}
                  </div>

                  {editingId !== template.id && (
                    <div className="flex items-center gap-0.5">
                      {template.isBuiltIn && (
                        <Badge variant="secondary" className="text-2xs mr-1">
                          Built-in
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => startRename(template)}
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      {!template.isBuiltIn && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setShowDeleteDialog(template.id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Create dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Save Template</DialogTitle>
              <DialogDescription>
                Save the current column mapping for reuse with similar documents.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Template name</Label>
                <Input
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g., Chase Checking Statement"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Based on</Label>
                <div className="mt-1 flex gap-2">
                  <Button
                    variant={newTemplateParty === 'A' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewTemplateParty('A')}
                    disabled={!columnMapA}
                  >
                    Ledger A
                  </Button>
                  <Button
                    variant={newTemplateParty === 'B' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewTemplateParty('B')}
                    disabled={!columnMapB}
                  >
                    Ledger B
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate}>Save Template</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog
          open={showDeleteDialog !== null}
          onOpenChange={() => setShowDeleteDialog(null)}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Template?</DialogTitle>
              <DialogDescription>
                This template will be permanently deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  showDeleteDialog && handleDelete(showDeleteDialog)
                }
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}