import * as React from 'react';
import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { useAppStore } from '@/stores/appStore';

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg transition-all animate-slide-in-right',
  {
    variants: {
      variant: {
        success: 'border-green-200 bg-green-50 text-green-900',
        error: 'border-red-200 bg-red-50 text-red-900',
        warning: 'border-yellow-200 bg-yellow-50 text-yellow-900',
        info: 'border-blue-200 bg-blue-50 text-blue-900',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  }
);

const TOAST_ICONS: Record<string, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export function ToastContainer() {
  const notifications = useAppStore((s) => s.notifications);
  const removeNotification = useAppStore((s) => s.removeNotification);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-h-screen w-full max-w-sm flex-col gap-2">
      {notifications.slice(-5).map((notification) => (
        <div
          key={notification.id}
          className={cn(
            toastVariants({ variant: notification.type as VariantProps<typeof toastVariants>['variant'] })
          )}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg leading-none">
              {TOAST_ICONS[notification.type] ?? 'ℹ'}
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">{notification.title}</p>
              {notification.message && (
                <p className="mt-0.5 text-xs opacity-80">
                  {notification.message}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => removeNotification(notification.id)}
            className="absolute right-2 top-2 rounded-sm p-0.5 opacity-50 transition-opacity hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}