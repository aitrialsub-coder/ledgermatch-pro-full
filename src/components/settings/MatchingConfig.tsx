/**
 * MatchingConfig — Configuration panel for matching rules
 * 
 * Allows users to adjust:
 * - Date tolerance (±N days slider)
 * - Amount tolerance (percent + fixed)
 * - Description similarity threshold
 * - Polarity mode
 * - Which passes to enable/disable
 * - Split match settings
 * - Description weight distribution
 * 
 * Shows live preview of how rule changes affect match counts.
 */

import React, { useState, useCallback } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Play,
  RotateCcw,
  Calendar,
  DollarSign,
  FileText,
  Layers,
  SplitSquareHorizontal,
  Settings2,
  Info,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useMatchStore } from '@/stores/matchStore';
import { useAppStore } from '@/stores/appStore';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useMatching } from '@/hooks/useMatching';
import type { MatchingConfig as MatchingConfigType, PolarityMode } from '@/types';
import {
  MAX_DATE_TOLERANCE_DAYS,
  MAX_AMOUNT_TOLERANCE_PERCENT,
  MAX_DESCRIPTION_THRESHOLD,
  MIN_DESCRIPTION_THRESHOLD,
} from '@/constants';
import { cn } from '@/lib/cn';

export function MatchingConfig() {
  const config = useMatchStore((s) => s.config);
  const setConfig = useMatchStore((s) => s.setConfig);
  const resetConfig = useMatchStore((s) => s.resetConfig);
  const setStep = useAppStore((s) => s.setStep);
  const markStepComplete = useAppStore((s) => s.markStepComplete);
  const { startMatching, isReady } = useMatching();

  const entriesA = useLedgerStore((s) => s.entriesA);
  const entriesB = useLedgerStore((s) => s.entriesB);

  const handleRunMatching = async () => {
    markStepComplete('configure');
    setStep('matching');
    await startMatching();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold">Matching Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Adjust matching rules before running the engine.{' '}
            {entriesA.length > 0 && entriesB.length > 0 && (
              <span className="text-foreground">
                ({entriesA.length} × {entriesB.length} entries)
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetConfig}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reset defaults
        </Button>
      </div>

      {/* Config sections */}
      <ScrollArea className="flex-1">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="basic" className="flex-1">
              <Settings2 className="mr-1 h-3.5 w-3.5" />
              Basic
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex-1">
              <Zap className="mr-1 h-3.5 w-3.5" />
              Advanced
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <DateToleranceSection config={config} setConfig={setConfig} />
            <AmountToleranceSection config={config} setConfig={setConfig} />
            <DescriptionSection config={config} setConfig={setConfig} />
            <PolaritySection config={config} setConfig={setConfig} />
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            <PassControlSection config={config} setConfig={setConfig} />
            <SplitMatchSection config={config} setConfig={setConfig} />
            <DescriptionWeightsSection config={config} setConfig={setConfig} />
            <MiscSection config={config} setConfig={setConfig} />
          </TabsContent>
        </Tabs>
      </ScrollArea>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <Button variant="outline" onClick={() => setStep('ocr_review')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        <Button
          onClick={handleRunMatching}
          disabled={!isReady}
          size="lg"
          className="min-w-[160px]"
        >
          <Play className="mr-1 h-4 w-4" />
          Run Matching
        </Button>
      </div>
    </div>
  );
}

// ─── Section: Date Tolerance ─────────────────────────────────

function DateToleranceSection({
  config,
  setConfig,
}: SectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Date Tolerance</CardTitle>
          <InfoTip text="How many days apart two transactions can be and still match. Bank processing delays often cause 1-3 day differences." />
        </div>
        <CardDescription className="text-xs">
          Allow dates to differ by up to ±{config.dateToleranceDays} days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Slider
            value={[config.dateToleranceDays]}
            onValueChange={([v]) =>
              setConfig({ dateToleranceDays: v })
            }
            min={0}
            max={MAX_DATE_TOLERANCE_DAYS}
            step={1}
            showValue
            formatValue={(v) => `±${v} days`}
          />
          <div className="flex justify-between text-2xs text-muted-foreground">
            <span>Exact only</span>
            <span>±{MAX_DATE_TOLERANCE_DAYS} days</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section: Amount Tolerance ───────────────────────────────

function AmountToleranceSection({
  config,
  setConfig,
}: SectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Amount Tolerance</CardTitle>
          <InfoTip text="How much amounts can differ and still match. Accounts for rounding differences, fees, or exchange rate variations." />
        </div>
        <CardDescription className="text-xs">
          Mode: {config.amountToleranceMode}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode select */}
        <div className="space-y-1">
          <Label className="text-xs">Tolerance mode</Label>
          <Select
            value={config.amountToleranceMode}
            onValueChange={(v) =>
              setConfig({
                amountToleranceMode: v as 'percent' | 'fixed' | 'both',
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">
                Either (percent OR fixed)
              </SelectItem>
              <SelectItem value="percent">Percentage only</SelectItem>
              <SelectItem value="fixed">Fixed amount only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Percent tolerance */}
        {(config.amountToleranceMode === 'percent' ||
          config.amountToleranceMode === 'both') && (
          <div className="space-y-2">
            <Label className="text-xs">
              Percentage: ±{(config.amountTolerancePercent * 100).toFixed(2)}%
            </Label>
            <Slider
              value={[config.amountTolerancePercent * 100]}
              onValueChange={([v]) =>
                setConfig({ amountTolerancePercent: v / 100 })
              }
              min={0}
              max={MAX_AMOUNT_TOLERANCE_PERCENT * 100}
              step={0.01}
              showValue
              formatValue={(v) => `±${v.toFixed(2)}%`}
            />
          </div>
        )}

        {/* Fixed tolerance */}
        {(config.amountToleranceMode === 'fixed' ||
          config.amountToleranceMode === 'both') && (
          <div className="space-y-2">
            <Label className="text-xs">Fixed amount</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">±$</span>
              <Input
                type="number"
                value={config.amountToleranceFixed}
                onChange={(e) =>
                  setConfig({
                    amountToleranceFixed: parseFloat(e.target.value) || 0,
                  })
                }
                min={0}
                max={1000}
                step={0.01}
                className="h-8 w-24 text-xs"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Section: Description Matching ───────────────────────────

function DescriptionSection({
  config,
  setConfig,
}: SectionProps) {
  const threshold = config.descriptionThreshold;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Description Similarity</CardTitle>
          <InfoTip text="Minimum similarity score for descriptions to be considered a match. Uses a blend of Jaro-Winkler, token sort, and token containment algorithms." />
        </div>
        <CardDescription className="text-xs">
          Threshold: {(threshold * 100).toFixed(0)}% similarity required
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Slider
            value={[threshold * 100]}
            onValueChange={([v]) =>
              setConfig({ descriptionThreshold: v / 100 })
            }
            min={MIN_DESCRIPTION_THRESHOLD * 100}
            max={MAX_DESCRIPTION_THRESHOLD * 100}
            step={1}
            showValue
            formatValue={(v) => `${v}%`}
          />
          <div className="flex justify-between text-2xs text-muted-foreground">
            <span>Loose ({(MIN_DESCRIPTION_THRESHOLD * 100).toFixed(0)}%)</span>
            <span>Exact (100%)</span>
          </div>

          {/* Threshold interpretation */}
          <div className="rounded-md bg-muted p-2 text-2xs text-muted-foreground">
            {threshold >= 0.95 && '🔒 Very strict — only near-identical descriptions'}
            {threshold >= 0.85 && threshold < 0.95 && '✓ Recommended — catches most legitimate matches'}
            {threshold >= 0.70 && threshold < 0.85 && '⚠ Loose — may produce false positives'}
            {threshold < 0.70 && '⚠ Very loose — high risk of false positives'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section: Polarity ───────────────────────────────────────

function PolaritySection({
  config,
  setConfig,
}: SectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Amount Polarity</CardTitle>
          <InfoTip text="How to compare the sign (+/-) of amounts between ledgers. Bank statements and company books typically use opposite signs." />
        </div>
      </CardHeader>
      <CardContent>
        <Select
          value={config.polarityMode}
          onValueChange={(v) =>
            setConfig({ polarityMode: v as PolarityMode })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="opposite_sign">
              <div>
                <p className="font-medium">Opposite sign</p>
                <p className="text-2xs text-muted-foreground">
                  Bank vs company books (most common)
                </p>
              </div>
            </SelectItem>
            <SelectItem value="same_sign">
              <div>
                <p className="font-medium">Same sign</p>
                <p className="text-2xs text-muted-foreground">
                  Both ledgers use same convention
                </p>
              </div>
            </SelectItem>
            <SelectItem value="absolute">
              <div>
                <p className="font-medium">Absolute value</p>
                <p className="text-2xs text-muted-foreground">
                  Ignore signs entirely
                </p>
              </div>
            </SelectItem>
            <SelectItem value="auto_detect">
              <div>
                <p className="font-medium">Auto-detect</p>
                <p className="text-2xs text-muted-foreground">
                  Infer from first matched entries
                </p>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}

// ─── Section: Pass Control ───────────────────────────────────

function PassControlSection({
  config,
  setConfig,
}: SectionProps) {
  const passes = [
    { num: 1, name: 'Exact Hash', desc: 'Date + amount + reference (fastest)' },
    { num: 2, name: 'Amount + Date', desc: 'Amount within tolerance, date within window' },
    { num: 3, name: 'Fuzzy Description', desc: 'String similarity on descriptions' },
    { num: 4, name: 'Split Detection', desc: 'One-to-many transaction matching' },
    { num: 5, name: 'Residue', desc: 'Classify remaining as unmatched/duplicate' },
  ];

  const togglePass = (passNum: number) => {
    const current = config.enabledPasses;
    const updated = current.includes(passNum)
      ? current.filter((p) => p !== passNum)
      : [...current, passNum].sort();
    setConfig({ enabledPasses: updated });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Matching Passes</CardTitle>
          <InfoTip text="Enable or disable individual matching passes. Pass 5 (Residue) should always be enabled to classify unmatched entries." />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {passes.map((pass) => {
            const enabled = config.enabledPasses.includes(pass.num);
            return (
              <button
                key={pass.num}
                onClick={() => togglePass(pass.num)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition-colors',
                  enabled
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-muted bg-muted/30 opacity-60'
                )}
              >
                <div
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    enabled
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {pass.num}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{pass.name}</p>
                  <p className="text-2xs text-muted-foreground">
                    {pass.desc}
                  </p>
                </div>
                <Badge
                  variant={enabled ? 'success' : 'secondary'}
                  className="text-2xs"
                >
                  {enabled ? 'ON' : 'OFF'}
                </Badge>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section: Split Match ────────────────────────────────────

function SplitMatchSection({
  config,
  setConfig,
}: SectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <SplitSquareHorizontal className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Split Transaction Settings</CardTitle>
          <InfoTip text="Controls how many entries can combine to match a single entry on the other side. Higher limits find more matches but take longer." />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">
            Max entries per split: {config.splitMaxEntries}
          </Label>
          <Slider
            value={[config.splitMaxEntries]}
            onValueChange={([v]) => setConfig({ splitMaxEntries: v })}
            min={2}
            max={8}
            step={1}
            showValue
            formatValue={(v) => `${v} entries`}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">
            Time limit per search: {config.splitTimeLimitMs}ms
          </Label>
          <Slider
            value={[config.splitTimeLimitMs]}
            onValueChange={([v]) => setConfig({ splitTimeLimitMs: v })}
            min={50}
            max={1000}
            step={50}
            showValue
            formatValue={(v) => `${v}ms`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section: Description Weights ────────────────────────────

function DescriptionWeightsSection({
  config,
  setConfig,
}: SectionProps) {
  const weights = config.descriptionWeight;
  const total = weights.jaroWinkler + weights.tokenSort + weights.tokenContainment;

  const updateWeight = (
    field: 'jaroWinkler' | 'tokenSort' | 'tokenContainment',
    value: number
  ) => {
    setConfig({
      descriptionWeight: {
        ...weights,
        [field]: value / 100,
      },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Description Algorithm Weights</CardTitle>
          <InfoTip text="Adjust how much each string comparison algorithm contributes to the final similarity score. Weights should sum to ~1.0." />
        </div>
        <CardDescription className="text-xs">
          Total weight: {total.toFixed(2)}
          {Math.abs(total - 1.0) > 0.05 && (
            <span className="ml-1 text-partial">
              (should be ~1.0)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">
            Jaro-Winkler: {(weights.jaroWinkler * 100).toFixed(0)}%
          </Label>
          <Slider
            value={[weights.jaroWinkler * 100]}
            onValueChange={([v]) => updateWeight('jaroWinkler', v)}
            min={0}
            max={100}
            step={5}
          />
          <p className="text-2xs text-muted-foreground">
            Best for short strings and reference numbers
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">
            Token Sort: {(weights.tokenSort * 100).toFixed(0)}%
          </Label>
          <Slider
            value={[weights.tokenSort * 100]}
            onValueChange={([v]) => updateWeight('tokenSort', v)}
            min={0}
            max={100}
            step={5}
          />
          <p className="text-2xs text-muted-foreground">
            Handles reordered words in descriptions
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">
            Token Containment: {(weights.tokenContainment * 100).toFixed(0)}%
          </Label>
          <Slider
            value={[weights.tokenContainment * 100]}
            onValueChange={([v]) => updateWeight('tokenContainment', v)}
            min={0}
            max={100}
            step={5}
          />
          <p className="text-2xs text-muted-foreground">
            Handles truncated bank descriptions
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section: Misc Settings ──────────────────────────────────

function MiscSection({
  config,
  setConfig,
}: SectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Other Settings</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Currency</Label>
          <Select
            value={config.currency}
            onValueChange={(v) => setConfig({ currency: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD ($)</SelectItem>
              <SelectItem value="EUR">EUR (€)</SelectItem>
              <SelectItem value="GBP">GBP (£)</SelectItem>
              <SelectItem value="INR">INR (₹)</SelectItem>
              <SelectItem value="JPY">JPY (¥)</SelectItem>
              <SelectItem value="CAD">CAD ($)</SelectItem>
              <SelectItem value="AUD">AUD ($)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs">Case-sensitive references</Label>
            <p className="text-2xs text-muted-foreground">
              Treat "INV-001" and "inv-001" as different
            </p>
          </div>
          <button
            onClick={() =>
              setConfig({ caseSensitiveRef: !config.caseSensitiveRef })
            }
            className={cn(
              'relative h-5 w-9 rounded-full transition-colors',
              config.caseSensitiveRef ? 'bg-primary' : 'bg-muted'
            )}
          >
            <div
              className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                config.caseSensitiveRef
                  ? 'translate-x-4'
                  : 'translate-x-0.5'
              )}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs">Ignore description in exact match</Label>
            <p className="text-2xs text-muted-foreground">
              Pass 1 matches on date + amount only
            </p>
          </div>
          <button
            onClick={() =>
              setConfig({
                ignoreDescriptionInExact: !config.ignoreDescriptionInExact,
              })
            }
            className={cn(
              'relative h-5 w-9 rounded-full transition-colors',
              config.ignoreDescriptionInExact ? 'bg-primary' : 'bg-muted'
            )}
          >
            <div
              className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                config.ignoreDescriptionInExact
                  ? 'translate-x-4'
                  : 'translate-x-0.5'
              )}
            />
          </button>
        </div>

        {/* FX Rate */}
        <div className="space-y-1">
          <Label className="text-xs">
            Manual FX rate (optional)
          </Label>
          <p className="text-2xs text-muted-foreground">
            For cross-currency matching. Leave empty if same currency.
          </p>
          <Input
            type="number"
            placeholder="e.g., 1.08"
            value={config.fxRate ?? ''}
            onChange={(e) =>
              setConfig({
                fxRate: e.target.value ? parseFloat(e.target.value) : undefined,
              })
            }
            min={0}
            step={0.001}
            className="h-8 w-32 text-xs"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Shared types & components ───────────────────────────────

interface SectionProps {
  config: MatchingConfigType;
  setConfig: (partial: Partial<MatchingConfigType>) => void;
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground/50" />
      </TooltipTrigger>
      <TooltipContent className="max-w-[250px]">
        <p className="text-xs">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}