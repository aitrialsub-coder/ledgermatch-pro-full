# LedgerMatch Pro

**Dual-Ledger Matching Chrome Extension**

Zero AI. Pure algorithmic matching. Every decision is deterministic,
auditable, and explainable.

## Features

- **OCR Pipeline** — PDF, scanned images, phone photos → structured data
- **5-Pass Matching Engine**
  1. Exact hash match (O(n))
  2. Amount + date window (O(n log n))
  3. Fuzzy description (Jaro-Winkler + token sort)
  4. Split transaction detection (subset-sum)
  5. Residue classification
- **Side-by-side diff view** with color-coded match status
- **Virtual scrolling** — handles 10,000+ row ledgers
- **CSV/PDF/JSON export** — full reconciliation reports
- **Keyboard navigation** — fast workflow for accountants
- **100% local** — no data leaves your browser
- **100% open source** — every line auditable

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build for production
npm run build

# Load in Chrome
# 1. Open chrome://extensions
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select the `dist` folder