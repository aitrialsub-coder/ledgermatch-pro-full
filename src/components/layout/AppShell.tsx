/**
 * AppShell — Root layout wrapper
 * 
 * Provides the overall structure:
 * ┌──────────────────────────────┐
 * │           Header             │
 * ├────────┬─────────────────────┤
 * │        │                     │
 * │Sidebar │   Main Content      │
 * │        │                     │
 * │        │                     │
 * ├────────┴─────────────────────┤
 * │         StatusBar            │
 * └──────────────────────────────┘
 * 
 * Adapts to Chrome extension side panel width (~400px typical).
 */

import React from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { ToastContainer } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/cn';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isSidebarCollapsed = useAppStore((s) => s.isSidebarCollapsed);
  const isGlobalLoading = useAppStore((s) => s.isGlobalLoading);
  const globalLoadingMessage = useAppStore((s) => s.globalLoadingMessage);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col overflow-hidden bg-background">
        {/* Header */}
        <Header />

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar navigation */}
          <Sidebar />

          {/* Content area */}
          <main
            className={cn(
              'flex-1 overflow-y-auto overflow-x-hidden transition-all duration-200',
              isSidebarCollapsed ? 'ml-0' : 'ml-0'
            )}
          >
            <div className="h-full p-3">
              {children}
            </div>
          </main>
        </div>

        {/* Status bar */}
        <StatusBar />

        {/* Global loading overlay */}
        {isGlobalLoading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              {globalLoadingMessage && (
                <p className="text-sm text-muted-foreground">
                  {globalLoadingMessage}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Toast notifications */}
        <ToastContainer />
      </div>
    </TooltipProvider>
  );
}