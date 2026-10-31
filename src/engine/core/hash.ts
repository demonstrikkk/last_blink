import { canonicalJson } from './canonicalJson.js';

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

/**
 * FNV-1a over UTF-8 bytes, returned as 16 lowercase hex characters.
 *
 * Deliberately not node:crypto: the same function runs in the browser, in Node
 * tests and in a worker without a platform shim, and its output is stable
 * across every runtime we target.
 */
export function fnv1a64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

export function hashCanonical(value: unknown): string {
  return fnv1a64(canonicalJson(value));
}
