/**
 * Error Boundary — Catches React rendering errors
 * 
 * Shows a user-friendly error message with:
 * - Error details
 * - Reset button
 * - Option to report the issue
 */

import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw, Bug } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[LedgerMatch] React Error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full items-center justify-center bg-background p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>

            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              An unexpected error occurred. Your data is safe — try resetting
              the view.
            </p>

            {this.state.error && (
              <div className="mt-4 rounded-md bg-muted p-3 text-left">
                <p className="font-mono text-xs text-destructive">
                  {this.state.error.message}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-2 max-h-32 overflow-auto font-mono text-2xs text-muted-foreground">
                    {this.state.errorInfo.componentStack.slice(0, 500)}
                  </pre>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              >
                <RotateCcw className="h-4 w-4" />
                Reset View
              </button>
              <button
                onClick={() => {
                  const body = encodeURIComponent(
                    `Error: ${this.state.error?.message}\n\nStack: ${this.state.error?.stack?.slice(0, 500)}`
                  );
                  window.open(
                    `https://github.com/user/ledgermatch-pro/issues/new?body=${body}`,
                    '_blank'
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent"
              >
                <Bug className="h-4 w-4" />
                Report Issue
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}