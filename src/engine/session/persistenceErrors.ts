/**
 * Typed persistence error hierarchy for The Last Blink.
 *
 * Distinguishes between unavailable storage, transactional aborts,
 * corruption, version mismatches, and quota exhaustion.
 */

export class PersistenceError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code = 'persistence_error', details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PersistenceUnavailableError extends PersistenceError {
  constructor(message = 'IndexedDB storage is not available in the current environment', details?: Record<string, unknown>) {
    super(message, 'storage_unavailable', details);
  }
}

export class SaveTransactionError extends PersistenceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'save_transaction_failed', details);
  }
}

export class CorruptSaveError extends PersistenceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'corrupt_save', details);
  }
}

export class VersionMismatchError extends PersistenceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'version_mismatch', details);
  }
}

export class QuotaExceededError extends PersistenceError {
  constructor(message = 'Browser storage quota exceeded while saving game state', details?: Record<string, unknown>) {
    super(message, 'quota_exceeded', details);
  }
}
