/**
 * Keyboard navigation hook for results table
 * 
 * Shortcuts:
 * ↑/↓       Navigate rows
 * Enter      Open detail drawer
 * Escape     Close detail drawer
 * R          Mark as Resolved
 * D          Mark as Disputed
 * I          Mark as Ignored
 * Ctrl+F     Focus search
 * Ctrl+E     Export
 * ?          Show shortcuts help
 * /          Toggle filter dropdown
 */

import { useEffect, useCallback } from 'react';
import { useMatchStore } from '@/stores/matchStore';
import { useAppStore } from '@/stores/appStore';
import { KEYBOARD_SHORTCUTS } from '@/constants';

interface UseKeyboardOptions {
  enabled?: boolean;
  onExport?: () => void;
  onSearch?: () => void;
  onFilterToggle?: () => void;
  onShowHelp?: () => void;
}

export function useKeyboard(options: UseKeyboardOptions = {}) {
  const { enabled = true, onExport, onSearch, onFilterToggle, onShowHelp } = options;

  const moveSelection = useMatchStore((s) => s.moveSelection);
  const selectedRowIndex = useMatchStore((s) => s.selectedRowIndex);
  const getFilteredGroups = useMatchStore((s) => s.getFilteredGroups);
  const updateMatchStatus = useMatchStore((s) => s.updateMatchStatus);

  const setDetailDrawer = useAppStore((s) => s.setDetailDrawer);
  const isDetailDrawerOpen = useAppStore((s) => s.isDetailDrawerOpen);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't intercept if user is typing in an input
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Only handle Escape in inputs
        if (event.key === 'Escape') {
          target.blur();
          event.preventDefault();
        }
        return;
      }

      const isCtrl = event.ctrlKey || event.metaKey;

      switch (event.key) {
        case KEYBOARD_SHORTCUTS.NAVIGATE_UP:
          event.preventDefault();
          moveSelection('up');
          break;

        case KEYBOARD_SHORTCUTS.NAVIGATE_DOWN:
          event.preventDefault();
          moveSelection('down');
          break;

        case KEYBOARD_SHORTCUTS.OPEN_DETAIL: {
          event.preventDefault();
          const groups = getFilteredGroups();
          if (selectedRowIndex >= 0 && selectedRowIndex < groups.length) {
            setDetailDrawer(true, groups[selectedRowIndex].id);
          }
          break;
        }

        case KEYBOARD_SHORTCUTS.CLOSE_DETAIL:
          if (isDetailDrawerOpen) {
            event.preventDefault();
            setDetailDrawer(false);
          }
          break;

        case KEYBOARD_SHORTCUTS.MARK_RESOLVED: {
          if (isCtrl) break; // don't intercept Ctrl+R (reload)
          const groups = getFilteredGroups();
          if (selectedRowIndex >= 0 && selectedRowIndex < groups.length) {
            event.preventDefault();
            updateMatchStatus(groups[selectedRowIndex].id, 'resolved');
          }
          break;
        }

        case KEYBOARD_SHORTCUTS.MARK_DISPUTED: {
          const groups = getFilteredGroups();
          if (selectedRowIndex >= 0 && selectedRowIndex < groups.length) {
            event.preventDefault();
            updateMatchStatus(groups[selectedRowIndex].id, 'disputed');
          }
          break;
        }

        case KEYBOARD_SHORTCUTS.MARK_IGNORED: {
          const groups = getFilteredGroups();
          if (selectedRowIndex >= 0 && selectedRowIndex < groups.length) {
            event.preventDefault();
            updateMatchStatus(groups[selectedRowIndex].id, 'ignored');
          }
          break;
        }

        case KEYBOARD_SHORTCUTS.SEARCH:
          if (isCtrl) {
            event.preventDefault();
            onSearch?.();
          }
          break;

        case KEYBOARD_SHORTCUTS.EXPORT:
          if (isCtrl) {
            event.preventDefault();
            onExport?.();
          }
          break;

        case KEYBOARD_SHORTCUTS.SHOW_SHORTCUTS:
          event.preventDefault();
          onShowHelp?.();
          break;

        case KEYBOARD_SHORTCUTS.TOGGLE_FILTER:
          if (!isCtrl) {
            event.preventDefault();
            onFilterToggle?.();
          }
          break;

        default:
          break;
      }
    },
    [
      enabled, moveSelection, selectedRowIndex, getFilteredGroups,
      updateMatchStatus, setDetailDrawer, isDetailDrawerOpen,
      onExport, onSearch, onFilterToggle, onShowHelp,
    ]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}