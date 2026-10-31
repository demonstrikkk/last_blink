import { fnv1a64 } from './hash.js';

export interface IdFactory {
  /** Allocate the next identifier with the supplied prefix, e.g. `evt_`. */
  next(prefix: string): string;
  /** Number of identifiers allocated so far. */
  readonly allocated: number;
}

/**
 * IDs must survive restore without colliding with earlier allocations, so the
 * factory is seeded by the session and resumes from the saved state version.
 */
export function createDeterministicIdFactory(seed: string, startAt = 0): IdFactory {
  const tag = fnv1a64(seed).slice(0, 6);
  let counter = startAt;

  return {
    next(prefix: string): string {
      counter += 1;
      return `${prefix}${tag}_${counter.toString(36).padStart(4, '0')}`;
    },
    get allocated(): number {
      return counter;
    },
  };
}
