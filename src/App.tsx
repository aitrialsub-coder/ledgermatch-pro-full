/**
 * App — Root application component with error boundary,
 * message router initialization, and lazy-loaded views
 */

import React, { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/core/runtime/errorBoundary';
import { initMessageRouter } from '@/core/runtime/messageHandler';
import { useAppStore } from '@/stores/appStore';

// Lazy-load heavy views to reduce initial bundle size
const UploadView = React.lazy(() =>
  import('@/components/upload/FileUploadZone').then((m) => ({
    default: m.FileUploadZone,
  }))
);
const OcrReviewView = React.lazy(() =>
  import('@/components/ocr/OcrReviewPanel').then((m) => ({
    default: m.OcrReviewPanel,
  }))
);
const ConfigView = React.lazy(() =>
  import('@/components/settings/MatchingConfig').then((m) => ({
    default: m.MatchingConfig,
  }))
);
const ResultsView = React.lazy(() =>
  import('@/components/results/ResultsTable').then((m) => ({
    default: m.ResultsTable,
  }))
);
const DashboardView = React.lazy(() =>
  import('@/components/dashboard/Dashboard').then((m) => ({
    default: m.Dashboard,
  }))
);

function AppContent() {
  const currentStep = useAppStore((s) => s.currentStep);

  // Initialize Chrome runtime message router
  useEffect(() => {
    try {
      initMessageRouter();
    } catch {
      // Not in extension context — message router not needed
      console.log('[LedgerMatch] Running outside extension context');
    }
  }, []);

  // Restore dark mode preference
  useEffect(() => {
    const isDark = useAppStore.getState().isDarkMode;
    if (isDark) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const renderStep = () => {
    switch (currentStep) {
      case 'upload':
        return <UploadView />;
      case 'ocr_review':
        return <OcrReviewView />;
      case 'configure':
        return <ConfigView />;
      case 'matching':
      case 'results':
        return <ResultsView />;
      case 'export':
        return <DashboardView />;
      default:
        return <UploadView />;
    }
  };

  return (
    <React.Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      {renderStep()}
    </React.Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell>
        <AppContent />
      </AppShell>
    </ErrorBoundary>
  );
}