/**
 * Header — Top navigation bar
 * 
 * Shows:
 * - App logo/name
 * - Current step indicator (stepper)
 * - Settings + dark mode toggles
 * - Reset button
 */

import React, { useState } from 'react';
import {
  Upload,
  ScanSearch,
  Settings2,
  Play,
  Table2,
  Download,
  RotateCcw,
  Moon,
  Sun,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAppStore } from '@/stores/appStore';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useMatchStore } from '@/stores/matchStore';
import { APP_STEPS, type AppStep } from '@/constants';
import { cn } from '@/lib/cn';

const STEP_ICONS: Record<AppStep, React.ElementType> = {
  upload: Upload,
  ocr_review: ScanSearch,
  configure: Settings2,
  matching: Play,
  results: Table2,
  export: Download,
};

export function Header() {
  const currentStep = useAppStore((s) => s.currentStep);
  const completedSteps = useAppStore((s) => s.completedSteps);
  const setStep = useAppStore((s) => s.setStep);
  const canProceedToStep = useAppStore((s) => s.canProceedToStep);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode);

  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);

  const resetAllStores = () => {
    useAppStore.getState().resetAll();
    useLedgerStore.getState().resetAll();
    useMatchStore.getState().resetAll();
    setShowResetDialog(false);
  };

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <span className="text-xs font-bold text-primary-foreground">LM</span>
          </div>
          <span className="hidden text-sm font-semibold sm:inline">
            LedgerMatch
          </span>
        </div>

        {/* Step indicator */}
        <nav className="flex items-center gap-0.5">
          {APP_STEPS.map((step, index) => {
            const Icon = STEP_ICONS[step.key];
            const isActive = currentStep === step.key;
            const isCompleted = completedSteps.includes(step.key);
            const canNavigate = canProceedToStep(step.key);

            return (
              <React.Fragment key={step.key}>
                {index > 0 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => canNavigate && setStep(step.key)}
                      disabled={!canNavigate}
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                        isActive &&
                          'bg-primary text-primary-foreground shadow-sm',
                        isCompleted &&
                          !isActive &&
                          'bg-matched/10 text-matched hover:bg-matched/20',
                        !isActive &&
                          !isCompleted &&
                          canNavigate &&
                          'text-muted-foreground hover:bg-accent hover:text-foreground',
                        !canNavigate &&
                          !isActive &&
                          !isCompleted &&
                          'cursor-not-allowed text-muted-foreground/30'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">{step.label}</p>
                    <p className="text-xs opacity-70">{step.description}</p>
                    {isCompleted && (
                      <p className="text-xs text-matched">✓ Complete</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowShortcutsDialog(true)}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Keyboard shortcuts</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleDarkMode}
              >
                {isDarkMode ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isDarkMode ? 'Light mode' : 'Dark mode'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowResetDialog(true)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset all</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Reset confirmation dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Everything?</DialogTitle>
            <DialogDescription>
              This will clear all uploaded files, parsed data, match results,
              and settings. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={resetAllStores}>
              Reset All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keyboard shortcuts dialog */}
      <Dialog
        open={showShortcutsDialog}
        onOpenChange={setShowShortcutsDialog}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>
              Navigate and act on match results quickly
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <ShortcutRow keys={['↑', '↓']} description="Navigate rows" />
            <ShortcutRow keys={['Enter']} description="Open detail drawer" />
            <ShortcutRow keys={['Esc']} description="Close drawer" />
            <ShortcutRow keys={['R']} description="Mark as Resolved" />
            <ShortcutRow keys={['D']} description="Mark as Disputed" />
            <ShortcutRow keys={['I']} description="Mark as Ignored" />
            <ShortcutRow keys={['Ctrl', 'F']} description="Search" />
            <ShortcutRow keys={['Ctrl', 'E']} description="Export" />
            <ShortcutRow keys={['/']} description="Toggle filters" />
            <ShortcutRow keys={['?']} description="Show this dialog" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShortcutRow({
  keys,
  description,
}: {
  keys: string[];
  description: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{description}</span>
      <div className="flex gap-1">
        {keys.map((key, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-muted-foreground">+</span>}
            <kbd className="kbd">{key}</kbd>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}