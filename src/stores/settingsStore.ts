import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { LedgerTemplate, PreprocessingConfig } from '@/types';
import { DEFAULT_PREPROCESSING_CONFIG } from '@/types/ocr';

// ─── Persisted settings ───────────────────────────────────────

interface SettingsState {
  // Preprocessing config
  preprocessingConfig: PreprocessingConfig;
  setPreprocessingConfig: (config: Partial<PreprocessingConfig>) => void;
  resetPreprocessingConfig: () => void;

  // Saved templates
  templates: LedgerTemplate[];
  addTemplate: (template: LedgerTemplate) => void;
  updateTemplate: (id: string, updates: Partial<LedgerTemplate>) => void;
  deleteTemplate: (id: string) => void;
  getTemplate: (id: string) => LedgerTemplate | undefined;

  // Preferences
  defaultCurrency: string;
  setDefaultCurrency: (currency: string) => void;

  autoDetectNumberFormat: boolean;
  setAutoDetectNumberFormat: (v: boolean) => void;

  showOcrConfidenceOverlay: boolean;
  setShowOcrConfidenceOverlay: (v: boolean) => void;

  defaultDateFormat: string;
  setDefaultDateFormat: (format: string) => void;

  // Telemetry opt-in (future)
  telemetryEnabled: boolean;
  setTelemetryEnabled: (v: boolean) => void;

  // Reset
  resetAll: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      (set, get) => ({
        // ─── Preprocessing ──────────────
        preprocessingConfig: { ...DEFAULT_PREPROCESSING_CONFIG },

        setPreprocessingConfig: (config) => {
          set((state) => ({
            preprocessingConfig: { ...state.preprocessingConfig, ...config },
          }));
        },

        resetPreprocessingConfig: () => {
          set({ preprocessingConfig: { ...DEFAULT_PREPROCESSING_CONFIG } });
        },

        // ─── Templates ─────────────────
        templates: [],

        addTemplate: (template) => {
          set((state) => ({
            templates: [...state.templates, template],
          }));
        },

        updateTemplate: (id, updates) => {
          set((state) => ({
            templates: state.templates.map((t) =>
              t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
            ),
          }));
        },

        deleteTemplate: (id) => {
          set((state) => ({
            templates: state.templates.filter((t) => t.id !== id),
          }));
        },

        getTemplate: (id) => {
          return get().templates.find((t) => t.id === id);
        },

        // ─── Preferences ───────────────
        defaultCurrency: 'USD',
        setDefaultCurrency: (currency) => set({ defaultCurrency: currency }),

        autoDetectNumberFormat: true,
        setAutoDetectNumberFormat: (v) => set({ autoDetectNumberFormat: v }),

        showOcrConfidenceOverlay: true,
        setShowOcrConfidenceOverlay: (v) =>
          set({ showOcrConfidenceOverlay: v }),

        defaultDateFormat: 'DD/MM/YYYY',
        setDefaultDateFormat: (format) => set({ defaultDateFormat: format }),

        telemetryEnabled: false,
        setTelemetryEnabled: (v) => set({ telemetryEnabled: v }),

        // ─── Reset ─────────────────────
        resetAll: () => {
          set({
            preprocessingConfig: { ...DEFAULT_PREPROCESSING_CONFIG },
            templates: [],
            defaultCurrency: 'USD',
            autoDetectNumberFormat: true,
            showOcrConfidenceOverlay: true,
            defaultDateFormat: 'DD/MM/YYYY',
            telemetryEnabled: false,
          });
        },
      }),
      {
        name: 'ledgermatch-settings',
        version: 1,
        // Only persist settings, not runtime state
        partialize: (state) => ({
          preprocessingConfig: state.preprocessingConfig,
          templates: state.templates,
          defaultCurrency: state.defaultCurrency,
          autoDetectNumberFormat: state.autoDetectNumberFormat,
          showOcrConfidenceOverlay: state.showOcrConfidenceOverlay,
          defaultDateFormat: state.defaultDateFormat,
          telemetryEnabled: state.telemetryEnabled,
        }),
      }
    ),
    { name: 'settings-store' }
  )
);