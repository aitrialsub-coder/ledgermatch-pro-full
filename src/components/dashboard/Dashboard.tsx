/**
 * Dashboard — Analytics and history view
 * 
 * Shows:
 * - Current session summary cards
 * - Match rate over time (if multiple runs)
 * - Discrepancy breakdown chart
 * - Pass breakdown chart
 * - Export options
 * - Run history table
 */

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Download,
  FileText,
  FileJson,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SplitSquareHorizontal,
  Copy,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMatchStore, type MatchRunRecord } from '@/stores/matchStore';
import { useAppStore } from '@/stores/appStore';
import { useExport } from '@/hooks/useExport';
import { cn } from '@/lib/cn';
import { MATCH_TYPE_LABELS } from '@/constants';

const PIE_COLORS = {
  exact: '#16a34a',
  amount_date: '#22c55e',
  fuzzy: '#eab308',
  split: '#a855f7',
  unmatched_a: '#ef4444',
  unmatched_b: '#f97316',
  duplicate: '#eab308',
};

export function Dashboard() {
  const summary = useMatchStore((s) => s.summary);
  const result = useMatchStore((s) => s.result);
  const runHistory = useMatchStore((s) => s.runHistory);
  const setStep = useAppStore((s) => s.setStep);
  const { exportCsv, exportPdf, exportJson, exportAll, isExporting } =
    useExport();

  if (!summary || !result) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <TrendingUp className="mb-3 h-12 w-12 text-muted-foreground/30" />
        <h2 className="text-lg font-semibold">No Results Yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Run a matching session to see analytics here.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setStep('upload')}
        >
          Go to Upload
        </Button>
      </div>
    );
  }

  // Prepare chart data
  const matchTypeData = [
    {
      name: 'Exact',
      value: result.matchGroups.filter((mg) => mg.matchType === 'exact').length,
      key: 'exact',
    },
    {
      name: 'Amount+Date',
      value: result.matchGroups.filter((mg) => mg.matchType === 'amount_date').length,
      key: 'amount_date',
    },
    {
      name: 'Fuzzy',
      value: result.matchGroups.filter((mg) => mg.matchType === 'fuzzy').length,
      key: 'fuzzy',
    },
    {
      name: 'Split',
      value: result.matchGroups.filter((mg) => mg.matchType === 'split').length,
      key: 'split',
    },
    {
      name: 'Unmatched A',
      value: summary.unmatchedACount,
      key: 'unmatched_a',
    },
    {
      name: 'Unmatched B',
      value: summary.unmatchedBCount,
      key: 'unmatched_b',
    },
  ].filter((d) => d.value > 0);

  const passData = summary.byPass.map((pass) => ({
    name: `P${pass.passNumber}`,
    fullName: pass.passName,
    matches: pass.matchCount,
    confidence: pass.averageConfidence,
    time: pass.timeMs,
  }));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold">Dashboard & Export</h1>
          <p className="text-sm text-muted-foreground">
            Session completed{' '}
            {new Date(result.completedAt).toLocaleString()}
          </p>
        </div>

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button loading={isExporting}>
              <Download className="mr-1 h-4 w-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>CSV Reports</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => exportCsv('full')}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Full Match Report
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCsv('unmatched')}>
              <XCircle className="mr-2 h-4 w-4" />
              Unmatched Only
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCsv('summary')}>
              <TrendingUp className="mr-2 h-4 w-4" />
              Summary Stats
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCsv('audit')}>
              <FileText className="mr-2 h-4 w-4" />
              Audit Trail
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Other Formats</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => exportPdf()}>
              <FileText className="mr-2 h-4 w-4" />
              PDF Report
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportJson()}>
              <FileJson className="mr-2 h-4 w-4" />
              JSON Data
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportAll()}>
              <Download className="mr-2 h-4 w-4" />
              Export All Formats
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard
              icon={CheckCircle2}
              label="Match Rate"
              value={`${(summary.matchRate * 100).toFixed(1)}%`}
              color="text-matched"
            />
            <SummaryCard
              icon={XCircle}
              label="Unmatched"
              value={(
                summary.unmatchedACount + summary.unmatchedBCount
              ).toString()}
              color="text-onlya"
            />
            <SummaryCard
              icon={TrendingDown}
              label="Discrepancy"
              value={`$${summary.totalDiscrepancy.toFixed(2)}`}
              color={
                summary.totalDiscrepancy > 0 ? 'text-onlya' : 'text-matched'
              }
            />
            <SummaryCard
              icon={SplitSquareHorizontal}
              label="Avg Confidence"
              value={`${summary.averageConfidence}%`}
              color="text-primary"
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Match type distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Match Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={matchTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {matchTypeData.map((entry) => (
                          <Cell
                            key={entry.key}
                            fill={
                              PIE_COLORS[
                                entry.key as keyof typeof PIE_COLORS
                              ] ?? '#94a3b8'
                            }
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: number, name: string) => [
                          value,
                          name,
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: '10px' }}
                        iconSize={8}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Pass breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Matches by Pass</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={passData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-md border bg-background p-2 text-xs shadow-sm">
                              <p className="font-medium">{data.fullName}</p>
                              <p>Matches: {data.matches}</p>
                              <p>Confidence: {data.confidence}%</p>
                              <p>Time: {data.time.toFixed(0)}ms</p>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="matches"
                        fill="hsl(220.9, 39.3%, 11%)"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Amount breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Amount Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xs text-muted-foreground">Ledger A Total</p>
                  <p className="text-sm font-bold">
                    ${summary.totalAmountA.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-muted-foreground">Ledger B Total</p>
                  <p className="text-sm font-bold">
                    ${summary.totalAmountB.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-muted-foreground">Discrepancy</p>
                  <p
                    className={cn(
                      'text-sm font-bold',
                      summary.totalDiscrepancy > 0
                        ? 'text-onlya'
                        : 'text-matched'
                    )}
                  >
                    ${summary.totalDiscrepancy.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Run history */}
          {runHistory.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Run History</CardTitle>
                <CardDescription className="text-xs">
                  Last {Math.min(runHistory.length, 10)} matching runs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {runHistory.slice(0, 10).map((run, i) => (
                    <HistoryRow key={run.id} run={run} isCurrent={i === 0} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <Button variant="outline" onClick={() => setStep('results')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Results
        </Button>
      </div>
    </div>
  );
}

// ─── Summary Card ────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className={cn('h-4 w-4', color)} />
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">{label}</p>
          <p className={cn('text-lg font-bold leading-tight', color)}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── History Row ─────────────────────────────────────────────

function HistoryRow({
  run,
  isCurrent,
}: {
  run: MatchRunRecord;
  isCurrent: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md border p-2',
        isCurrent && 'border-primary/30 bg-primary/5'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-medium">
            {run.fileNameA} ↔ {run.fileNameB}
          </p>
          {isCurrent && (
            <Badge variant="info" className="text-2xs">
              Current
            </Badge>
          )}
        </div>
        <p className="text-2xs text-muted-foreground">
          {new Date(run.completedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-matched font-medium">
          {(run.summary.matchRate * 100).toFixed(0)}%
        </span>
        <span className="text-muted-foreground">
          {run.summary.matchedCount}/{run.summary.totalEntriesA}
        </span>
      </div>
    </div>
  );
}