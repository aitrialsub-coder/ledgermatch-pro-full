/**
 * Chrome MV3 Service Worker
 *
 * KEEP THIS LIGHTWEIGHT.
 * No heavy processing — only:
 * - Extension lifecycle events
 * - Side panel management
 * - Message routing
 * - Offscreen document creation
 */

// ─── Side Panel Setup ─────────────────────────────────────────
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Failed to set panel behavior:', error));

// ─── Action Click → Open Side Panel ──────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ─── Offscreen Document Management ───────────────────────────
let offscreenCreated = false;

async function ensureOffscreenDocument(): Promise<void> {
  if (offscreenCreated) return;

  // Check if already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL('src/offscreen.html')],
  });

  if (existingContexts.length > 0) {
    offscreenCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'src/offscreen.html',
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'OCR processing with Tesseract.js and OpenCV.js in Web Workers',
  });

  offscreenCreated = true;
  console.log('[LedgerMatch] Offscreen document created for OCR processing');
}

// ─── Message Router ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'CREATE_OFFSCREEN':
      ensureOffscreenDocument()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // async

    case 'FORWARD_TO_OFFSCREEN':
      // Forward message from side panel to offscreen document
      ensureOffscreenDocument()
        .then(() => {
          chrome.runtime.sendMessage(
            { type: payload.type, payload: payload.data, source: 'background' },
            (response) => {
              sendResponse(response);
            }
          );
        })
        .catch((err) => sendResponse({ error: err.message }));
      return true; // async

    case 'OCR_RESULT':
    case 'OCR_PROGRESS':
    case 'OCR_ERROR':
      // Forward from offscreen back to side panel
      // The side panel listens for these directly
      break;

    case 'GET_EXTENSION_URL':
      sendResponse({ url: chrome.runtime.getURL(payload.path) });
      return false;

    default:
      break;
  }
});

// ─── Install / Update ────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[LedgerMatch] Extension installed — version 1.0.0');
  } else if (details.reason === 'update') {
    console.log(`[LedgerMatch] Extension updated to ${chrome.runtime.getManifest().version}`);
  }
});

// ─── Keep-alive (for long OCR jobs) ──────────────────────────
// Service worker can be killed after 30s idle
// This heartbeat keeps it alive during active processing
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_KEEP_ALIVE') {
    if (!keepAliveInterval) {
      keepAliveInterval = setInterval(() => {
        // Accessing chrome API keeps the service worker alive
        chrome.runtime.getPlatformInfo(() => {});
      }, 25000);
    }
  }

  if (message.type === 'STOP_KEEP_ALIVE') {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
  }
});

export {};