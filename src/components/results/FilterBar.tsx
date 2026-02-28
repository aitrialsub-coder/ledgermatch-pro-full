/**
 * FilterBar — Filter and sort controls for results table
 * 
 * Provides:
 * - Filter by match type (All, Matched, Unmatched, Split, etc.)
 * - Sort by date, amount, confidence, status
 * - Text search across descriptions and reasons
 * - Active filter count indicator
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  Filter,
  ArrowUpDown,
  Search,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SplitSquareHorizontal,
  Copy,
  Eye,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMatchStore } from '@/stores/matchStore';
import type { ResultFilter, ResultSort } from '@/types';
import { cn } from '@/lib/cn';

interface FilterBarProps {
  onSearchFocus?: () => void;
}

const FILTER_OPTIONS: Array<{
  value: ResultFilter;
  label: string;
  icon: React.ElementType;
  color: string;
}> = [
  { value: 'all', label: 'All', icon: Eye, color: 'text-foreground' },
  { value: 'matched', label: 'Matched', icon: CheckCircle2, color: 'text-matched' },
  { value: 'unmatched', label: 'All Unmatched', icon: XCircle, color: 'text-onlya' },
  { value: 'unmatched_a', label: 'Only in A', icon: XCircle, color: 'text-onlya' },
  { value: 'unmatched_b', label: 'Only in B', icon: AlertTriangle, color: 'text-onlyb' },
  { value: 'split', label: 'Split', icon: SplitSquareHorizontal, color: 'text-split' },
  { value: 'duplicate', label: 'Duplicates', icon: Copy, color: 'text-duplicate' },
  { value: 'disputed', label: 'Disputed', icon: MessageSquare, color: 'text-destructive' },
  { value: 'low_confidence', label: 'Low Confidence', icon: AlertTriangle, color: 'text-partial' },
];

const SORT_OPTIONS: Array<{ value: ResultSort; label: string }> = [
  { value: 'date_asc', label: 'Date (oldest)' },
  { value: 'date_desc', label: 'Date (newest)' },
  { value: 'amount_asc', label: 'Amount (low→high)' },
  { value: 'amount_desc', label: 'Amount (high→low)' },
  { value: 'confidence_asc', label: 'Confidence (low→high)' },
  { value: 'confidence_desc', label: 'Confidence (high→low)' },
  { value: 'status', label: 'Status' },
];

export function FilterBar({ onSearchFocus }: FilterBarProps) {
  const activeFilter = useMatchStore((s) => s.activeFilter);
  const activeSort = useMatchStore((s) => s.activeSort);
  const searchQuery = useMatchStore((s) => s.searchQuery);
  const setFilter = useMatchStore((s) => s.setFilter);
  const setSort = useMatchStore((s) => s.setSort);
  const setSearchQuery = useMatchStore((s) => s.setSearchQuery);
  const getFilteredGroups = useMatchStore((s) => s.getFilteredGroups);

  const searchRef = useRef<HTMLInputElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const filteredCount = getFilteredGroups().length;
  const totalCount = useMatchStore((s) => s.matchGroups.length);
  const isFiltered = activeFilter !== 'all' || searchQuery.length > 0;

  // Expose search focus
  useEffect(() => {
    if (onSearchFocus) {
      // This is called externally from keyboard shortcut
    }
  }, [onSearchFocus]);

  const clearFilters = () => {
    setFilter('all');
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Filter buttons */}
      <div className="flex flex-wrap items-center gap-1">
        {FILTER_OPTIONS.slice(0, 5).map((option) => {
          const Icon = option.icon;
          const isActive = activeFilter === option.value;

          return (
            <Button
              key={option.value}
              variant={isActive ? 'secondary' : 'ghost'}
              size="sm"
              className={cn(
                'h-7 text-xs',
                isActive && 'shadow-sm'
              )}
              onClick={() =>
                setFilter(isActive ? 'all' : option.value)
              }
            >
              <Icon
                className={cn(
                  'mr-1 h-3 w-3',
                  isActive ? option.color : 'text-muted-foreground'
                )}
              />
              {option.label}
            </Button>
          );
        })}

        {/* More filters dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              <Filter className="mr-1 h-3 w-3" />
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs">
              Filter by type
            </DropdownMenuLabel>
            {FILTER_OPTIONS.slice(5).map((option) => {
              const Icon = option.icon;
              return (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={activeFilter === option.value}
                  onCheckedChange={() =>
                    setFilter(
                      activeFilter === option.value ? 'all' : option.value
                    )
                  }
                >
                  <Icon className={cn('mr-2 h-3.5 w-3.5', option.color)} />
                  {option.label}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Result count */}
      {isFiltered && (
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-2xs">
            {filteredCount} / {totalCount}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearFilters}
            className="h-5 w-5"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        {isSearchOpen ? (
          <div className="flex items-center gap-1">
            <Input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search descriptions, reasons..."
              className="h-7 w-48 text-xs"
              icon={<Search className="h-3 w-3" />}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={() => {
                setSearchQuery('');
                setIsSearchOpen(false);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setIsSearchOpen(true)}
          >
            <Search className="mr-1 h-3 w-3" />
            Search
          </Button>
        )}
      </div>

      {/* Sort */}
      <Select value={activeSort} onValueChange={(v) => setSort(v as ResultSort)}>
        <SelectTrigger className="h-7 w-40 text-xs">
          <ArrowUpDown className="mr-1 h-3 w-3" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}