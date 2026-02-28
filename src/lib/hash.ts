/**
 * SHA-256 hashing utilities for matching and audit trail
 * Uses Web Crypto API (available in extension context)
 */

export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function sha256Sync(input: string): string {
  // Simple hash for non-crypto use (match keys, dedup)
  // FNV-1a hash — fast, good distribution, deterministic
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createMatchKey(
  dateIso: string,
  amountCents: number,
  refNormalized: string
): string {
  return `${dateIso}|${amountCents}|${refNormalized.toLowerCase().trim()}`;
}

export function normalizeRef(ref: string | null | undefined): string {
  if (!ref) return '';
  return ref
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}