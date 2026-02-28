import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AppStep } from '@/types';

// ─── Application-level state ─────────────────────────────────

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;       // ms, 0 = persistent
  createdAt: number;
}

interface AppState {
  // Navigation
  currentStep: AppStep;
  completedSteps: AppStep[];
  canProceedToStep: (step: AppStep) => boolean;
  setStep: (step: AppStep) => void;
  markStepComplete: (step: AppStep) => void;

  // Session
  sessionId: string | null;
  setSessionId: (id: string | null) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'createdAt'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // UI state
  isDetailDrawerOpen: boolean;
  selectedMatchGroupId: string | null;
  setDetailDrawer: (open: boolean, matchGroupId?: string | null) => void;

  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Dark mode
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // Loading
  isGlobalLoading: boolean;
  globalLoadingMessage: string;
  setGlobalLoading: (loading: boolean, message?: string) => void;

  // Reset
  resetAll: () => void;
}

const STEP_ORDER: AppStep[] = [
  'upload', 'ocr_review', 'configure', 'matching', 'results', 'export',
];

export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // ─── Navigation ──────────────────
      currentStep: 'upload',
      completedSteps: [],

      canProceedToStep: (step: AppStep) => {
        const targetIdx = STEP_ORDER.indexOf(step);
        if (targetIdx === 0) return true;

        const prevStep = STEP_ORDER[targetIdx - 1];
        return get().completedSteps.includes(prevStep);
      },

      setStep: (step: AppStep) => {
        if (get().canProceedToStep(step)) {
          set({ currentStep: step });
        }
      },

      markStepComplete: (step: AppStep) => {
        set((state) => ({
          completedSteps: state.completedSteps.includes(step)
            ? state.completedSteps
            : [...state.completedSteps, step],
        }));
      },

      // ─── Session ─────────────────────
      sessionId: null,
      setSessionId: (id) => set({ sessionId: id }),

      // ─── Notifications ───────────────
      notifications: [],

      addNotification: (n) => {
        const notification: Notification = {
          ...n,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };
        set((state) => ({
          notifications: [...state.notifications, notification],
        }));

        // Auto-remove after duration
        const duration = n.duration ?? 5000;
        if (duration > 0) {
          setTimeout(() => {
            get().removeNotification(notification.id);
          }, duration);
        }
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearNotifications: () => set({ notifications: [] }),

      // ─── UI State ────────────────────
      isDetailDrawerOpen: false,
      selectedMatchGroupId: null,

      setDetailDrawer: (open, matchGroupId = null) => {
        set({
          isDetailDrawerOpen: open,
          selectedMatchGroupId: open ? matchGroupId : null,
        });
      },

      isSidebarCollapsed: false,
      toggleSidebar: () => {
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
      },

      // ─── Dark Mode ───────────────────
      isDarkMode: false,
      toggleDarkMode: () => {
        set((state) => {
          const newMode = !state.isDarkMode;
          if (newMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          return { isDarkMode: newMode };
        });
      },

      // ─── Loading ─────────────────────
      isGlobalLoading: false,
      globalLoadingMessage: '',

      setGlobalLoading: (loading, message = '') => {
        set({ isGlobalLoading: loading, globalLoadingMessage: message });
      },

      // ─── Reset ───────────────────────
      resetAll: () => {
        set({
          currentStep: 'upload',
          completedSteps: [],
          sessionId: null,
          notifications: [],
          isDetailDrawerOpen: false,
          selectedMatchGroupId: null,
          isGlobalLoading: false,
          globalLoadingMessage: '',
        });
      },
    }),
    { name: 'app-store' }
  )
);