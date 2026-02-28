/**
 * Runtime Message Handler
 * 
 * Manages Chrome runtime message communication between:
 * - Side panel ↔ Background service worker
 * - Side panel ↔ Offscreen document
 * 
 * Provides typed message sending and listener registration.
 */

// ─── Message types ───────────────────────────────────────────

export type RuntimeMessageType =
  | 'CREATE_OFFSCREEN'
  | 'FORWARD_TO_OFFSCREEN'
  | 'OCR_INIT'
  | 'OCR_PROCESS_PAGE'
  | 'OCR_CANCEL'
  | 'OCR_PROGRESS'
  | 'OCR_RESULT'
  | 'OCR_ERROR'
  | 'OCR_READY'
  | 'START_KEEP_ALIVE'
  | 'STOP_KEEP_ALIVE'
  | 'GET_EXTENSION_URL';

export interface RuntimeMessage {
  type: RuntimeMessageType;
  payload?: unknown;
  source?: string;
}

// ─── Send message to background ──────────────────────────────

export async function sendToBackground<T = unknown>(
  type: RuntimeMessageType,
  payload?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        { type, payload } as RuntimeMessage,
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response as T);
          }
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Listen for messages ─────────────────────────────────────

export type MessageListener = (
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender
) => void;

const listeners = new Map<RuntimeMessageType, Set<MessageListener>>();

export function addMessageListener(
  type: RuntimeMessageType,
  listener: MessageListener
): () => void {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  listeners.get(type)!.add(listener);

  // Return cleanup function
  return () => {
    listeners.get(type)?.delete(listener);
  };
}

// ─── Global message router ──────────────────────────────────

let isRouterInitialized = false;

export function initMessageRouter(): void {
  if (isRouterInitialized) return;

  chrome.runtime.onMessage.addListener(
    (message: RuntimeMessage, sender) => {
      if (!message.type) return;

      const typeListeners = listeners.get(message.type);
      if (typeListeners) {
        for (const listener of typeListeners) {
          listener(message, sender);
        }
      }
    }
  );

  isRouterInitialized = true;
}

// ─── Ensure offscreen document exists ────────────────────────

let offscreenCreated = false;

export async function ensureOffscreen(): Promise<void> {
  if (offscreenCreated) return;

  try {
    const response = await sendToBackground<{ success: boolean }>(
      'CREATE_OFFSCREEN'
    );
    if (response?.success) {
      offscreenCreated = true;
    }
  } catch {
    // Offscreen might already exist
    offscreenCreated = true;
  }
}

// ─── Get extension URL ───────────────────────────────────────

export function getExtensionUrl(path: string): string {
  try {
    return chrome.runtime.getURL(path);
  } catch {
    // Not in extension context — return relative path
    return path;
  }
}