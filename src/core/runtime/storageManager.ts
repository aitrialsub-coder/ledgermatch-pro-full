/**
 * Storage Manager — Persist data using Chrome extension storage
 * 
 * Uses chrome.storage.local for:
 * - Session data (temporary, auto-cleared)
 * - Templates (persistent)
 * - Settings (persistent)
 * 
 * Falls back to localStorage when not in extension context.
 */

const PREFIX = 'ledgermatch_';

// ─── Chrome storage API wrapper ──────────────────────────────

function isExtensionContext(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.storage;
  } catch {
    return false;
  }
}

export async function storageGet<T>(key: string): Promise<T | null> {
  const fullKey = PREFIX + key;

  if (isExtensionContext()) {
    return new Promise((resolve) => {
      chrome.storage.local.get(fullKey, (result) => {
        resolve(result[fullKey] ?? null);
      });
    });
  }

  try {
    const item = localStorage.getItem(fullKey);
    return item ? (JSON.parse(item) as T) : null;
  } catch {
    return null;
  }
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  const fullKey = PREFIX + key;

  if (isExtensionContext()) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [fullKey]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  try {
    localStorage.setItem(fullKey, JSON.stringify(value));
  } catch {
    // Storage full
  }
}

export async function storageRemove(key: string): Promise<void> {
  const fullKey = PREFIX + key;

  if (isExtensionContext()) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(fullKey, () => {
        resolve();
      });
    });
  }

  try {
    localStorage.removeItem(fullKey);
  } catch {
    // Ignore
  }
}

export async function storageClear(): Promise<void> {
  if (isExtensionContext()) {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        resolve();
      });
    });
  }

  try {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(PREFIX)
    );
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}

// ─── Storage usage tracking ──────────────────────────────────

export async function getStorageUsage(): Promise<{
  bytesUsed: number;
  bytesAvailable: number;
  percentUsed: number;
}> {
  if (isExtensionContext()) {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytesUsed) => {
        const quota = chrome.storage.local.QUOTA_BYTES ?? 10485760; // 10MB default
        resolve({
          bytesUsed,
          bytesAvailable: quota - bytesUsed,
          percentUsed: (bytesUsed / quota) * 100,
        });
      });
    });
  }

  // Estimate localStorage usage
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      totalBytes += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
  }

  const quota = 5 * 1024 * 1024; // 5MB typical
  return {
    bytesUsed: totalBytes * 2, // UTF-16
    bytesAvailable: quota - totalBytes * 2,
    percentUsed: ((totalBytes * 2) / quota) * 100,
  };
}