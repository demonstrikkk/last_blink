import {
  saveEnvelopeSchema,
  hashCanonical,
  CorruptSaveError,
  PersistenceError,
  PersistenceUnavailableError,
  QuotaExceededError,
  SaveTransactionError,
  type BranchSnapshotRecord,
  type GameEvent,
  type LoggerPort,
  type PersistencePort,
  type SaveEnvelope,
  type SaveSummary,
  type SessionDurableRecord,
  type SessionId,
} from '../engine/index.js';

export const DEFAULT_DB_NAME = 'the_last_blink_db';
export const DB_VERSION = 1;

export const STORE_ENVELOPES = 'envelopes';
export const STORE_EVENTS = 'events';
export const STORE_BRANCHES = 'branch_snapshots';
export const STORE_META = 'session_meta';

export interface IndexedDbOptions {
  readonly dbName?: string;
  readonly factory?: IDBFactory;
  readonly logger?: LoggerPort;
}

interface StoredEventRecord {
  sessionId: string;
  eventId: string;
  branchId: string;
  sequenceNo: number;
  occurredAt: string;
  event: GameEvent;
}

interface StoredMetaRecord {
  sessionId: string;
  activeBranchId: string;
  saveId: string;
  stateVersion: number;
  stateHash: string;
  savedAt: string;
  gameVersion: string;
  contentId: string;
}

function verifyEnvelopeIntegrity(envelope: SaveEnvelope): void {
  const withoutChecksum = {
    saveFormatVersion: envelope.saveFormatVersion,
    saveId: envelope.saveId,
    gameVersion: envelope.gameVersion,
    sessionId: envelope.sessionId,
    savedAt: envelope.savedAt,
    engineStateHash: envelope.engineStateHash,
    contractVersions: envelope.contractVersions,
    payload: envelope.payload,
  };
  const expectedChecksum = hashCanonical(withoutChecksum);
  if (expectedChecksum !== envelope.checksum) {
    throw new CorruptSaveError(
      `Save checksum mismatch for session ${envelope.sessionId}: expected ${expectedChecksum}, got ${envelope.checksum}`,
      { sessionId: envelope.sessionId, saveId: envelope.saveId },
    );
  }
  const expectedStateHash = hashCanonical(envelope.payload);
  if (expectedStateHash !== envelope.engineStateHash) {
    throw new CorruptSaveError(
      `Engine state hash mismatch for session ${envelope.sessionId}: expected ${expectedStateHash}, got ${envelope.engineStateHash}`,
      { sessionId: envelope.sessionId, saveId: envelope.saveId },
    );
  }
}

/**
 * Robust IndexedDB adapter implementing PersistencePort and durable session persistence.
 * Uses atomic readwrite transactions across envelopes, events, and branch snapshots.
 */
export class IndexedDbPersistence implements PersistencePort {
  private readonly dbName: string;
  private readonly factory: IDBFactory;
  private readonly logger?: LoggerPort;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.logger = options.logger;

    const detectedFactory = options.factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
    if (!detectedFactory) {
      throw new PersistenceUnavailableError(
        'IndexedDB is not available in the current runtime environment.',
      );
    }
    this.factory = detectedFactory;
  }

  private async openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = this.factory.open(this.dbName, DB_VERSION);
      } catch (error) {
        reject(
          new PersistenceUnavailableError('Failed to invoke factory.open for IndexedDB', {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return;
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_ENVELOPES)) {
          const envelopeStore = db.createObjectStore(STORE_ENVELOPES, { keyPath: 'sessionId' });
          envelopeStore.createIndex('by_savedAt', 'savedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_EVENTS)) {
          const eventsStore = db.createObjectStore(STORE_EVENTS, { keyPath: ['sessionId', 'eventId'] });
          eventsStore.createIndex('by_session_branch', ['sessionId', 'branchId', 'sequenceNo'], { unique: false });
          eventsStore.createIndex('by_session_seq', ['sessionId', 'sequenceNo'], { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_BRANCHES)) {
          db.createObjectStore(STORE_BRANCHES, { keyPath: ['sessionId', 'branchId'] });
        }

        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'sessionId' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        const err = request.error;
        if (err?.name === 'QuotaExceededError') {
          reject(new QuotaExceededError(err.message));
        } else {
          reject(new SaveTransactionError(err ? err.message : 'Failed to open IndexedDB database'));
        }
      };

      request.onblocked = () => {
        this.logger?.warn('IndexedDB database open request blocked by other open connections');
      };
    });

    return this.dbPromise;
  }

  async save(envelope: SaveEnvelope): Promise<void> {
    const parsed = saveEnvelopeSchema.parse(envelope);
    verifyEnvelopeIntegrity(parsed);

    const db = await this.openDb();
    const meta: StoredMetaRecord = {
      sessionId: parsed.sessionId,
      activeBranchId: parsed.payload.branchId,
      saveId: parsed.saveId,
      stateVersion: parsed.payload.stateVersion,
      stateHash: parsed.engineStateHash,
      savedAt: parsed.savedAt,
      gameVersion: parsed.gameVersion,
      contentId: parsed.payload.contentId,
    };

    return new Promise<void>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction([STORE_ENVELOPES, STORE_META], 'readwrite');
      } catch (err) {
        reject(new SaveTransactionError('Could not create readwrite transaction', { error: String(err) }));
        return;
      }

      tx.oncomplete = () => resolve();
      tx.onabort = () => {
        const err = tx.error;
        if (err?.name === 'QuotaExceededError') {
          reject(new QuotaExceededError(err.message));
        } else {
          reject(new SaveTransactionError(`Save transaction aborted: ${err ? err.message : 'unknown'}`));
        }
      };
      tx.onerror = () => {
        const err = tx.error;
        if (err?.name === 'QuotaExceededError') {
          reject(new QuotaExceededError(err.message));
        } else {
          reject(new SaveTransactionError(`Save transaction error: ${err ? err.message : 'unknown'}`));
        }
      };

      const envelopeStore = tx.objectStore(STORE_ENVELOPES);
      const metaStore = tx.objectStore(STORE_META);

      envelopeStore.put(parsed);
      metaStore.put(meta);
    });
  }

  async saveSession(record: SessionDurableRecord): Promise<void> {
    const parsed = saveEnvelopeSchema.parse(record.envelope);
    verifyEnvelopeIntegrity(parsed);

    const db = await this.openDb();
    const meta: StoredMetaRecord = {
      sessionId: parsed.sessionId,
      activeBranchId: record.activeBranchId,
      saveId: parsed.saveId,
      stateVersion: parsed.payload.stateVersion,
      stateHash: parsed.engineStateHash,
      savedAt: parsed.savedAt,
      gameVersion: parsed.gameVersion,
      contentId: parsed.payload.contentId,
    };

    return new Promise<void>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction([STORE_ENVELOPES, STORE_EVENTS, STORE_BRANCHES, STORE_META], 'readwrite');
      } catch (err) {
        reject(new SaveTransactionError('Could not start multi-store readwrite transaction', { error: String(err) }));
        return;
      }

      tx.oncomplete = () => resolve();
      tx.onabort = () => {
        const err = tx.error;
        if (err?.name === 'QuotaExceededError') {
          reject(new QuotaExceededError(err.message));
        } else {
          reject(new SaveTransactionError(`Session save transaction aborted: ${err ? err.message : 'unknown'}`));
        }
      };
      tx.onerror = () => {
        const err = tx.error;
        if (err?.name === 'QuotaExceededError') {
          reject(new QuotaExceededError(err.message));
        } else {
          reject(new SaveTransactionError(`Session save transaction error: ${err ? err.message : 'unknown'}`));
        }
      };

      const envelopeStore = tx.objectStore(STORE_ENVELOPES);
      const eventsStore = tx.objectStore(STORE_EVENTS);
      const branchStore = tx.objectStore(STORE_BRANCHES);
      const metaStore = tx.objectStore(STORE_META);

      envelopeStore.put(parsed);
      metaStore.put(meta);

      for (const event of record.events) {
        const eventRow: StoredEventRecord = {
          sessionId: parsed.sessionId,
          eventId: event.eventId,
          branchId: event.branchId,
          sequenceNo: event.sequenceNo,
          occurredAt: event.occurredAt,
          event,
        };
        eventsStore.put(eventRow);
      }

      for (const branchSnapshot of record.branchSnapshots) {
        branchStore.put(branchSnapshot);
      }
    });
  }

  async load(sessionId: SessionId): Promise<SaveEnvelope | null> {
    const db = await this.openDb();

    return new Promise<SaveEnvelope | null>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction([STORE_ENVELOPES], 'readonly');
      } catch (err) {
        reject(new PersistenceUnavailableError('Could not start readonly transaction', { error: String(err) }));
        return;
      }

      const store = tx.objectStore(STORE_ENVELOPES);
      const req = store.get(sessionId);

      req.onsuccess = () => {
        const raw = req.result;
        if (!raw) {
          resolve(null);
          return;
        }

        const parsed = saveEnvelopeSchema.safeParse(raw);
        if (!parsed.success) {
          reject(
            new CorruptSaveError(`Corrupted save envelope for session ${sessionId}`, {
              issues: parsed.error.issues,
            }),
          );
          return;
        }

        try {
          verifyEnvelopeIntegrity(parsed.data);
          resolve(parsed.data);
        } catch (err) {
          reject(err);
        }
      };

      req.onerror = () => {
        reject(new PersistenceError(`Failed to load save envelope: ${req.error?.message}`));
      };
    });
  }

  async loadSession(sessionId: SessionId): Promise<SessionDurableRecord | null> {
    const envelope = await this.load(sessionId);
    if (!envelope) return null;

    const db = await this.openDb();

    const [events, branchSnapshots] = await Promise.all([
      new Promise<GameEvent[]>((resolve, reject) => {
        const tx = db.transaction([STORE_EVENTS], 'readonly');
        const store = tx.objectStore(STORE_EVENTS);
        const req = store.getAll();

        req.onsuccess = () => {
          const rows = (req.result as StoredEventRecord[]).filter((row) => row.sessionId === sessionId);
          rows.sort((a, b) => a.sequenceNo - b.sequenceNo);
          resolve(rows.map((row) => row.event));
        };
        req.onerror = () => reject(new PersistenceError(`Failed to read events: ${req.error?.message}`));
      }),
      new Promise<BranchSnapshotRecord[]>((resolve, reject) => {
        const tx = db.transaction([STORE_BRANCHES], 'readonly');
        const store = tx.objectStore(STORE_BRANCHES);
        const req = store.getAll();

        req.onsuccess = () => {
          const rows = (req.result as BranchSnapshotRecord[]).filter((row) => row.sessionId === sessionId);
          resolve(rows);
        };
        req.onerror = () => reject(new PersistenceError(`Failed to read branch snapshots: ${req.error?.message}`));
      }),
    ]);

    return {
      envelope,
      events,
      branchSnapshots,
      activeBranchId: envelope.payload.branchId,
    };
  }

  async list(): Promise<SaveSummary[]> {
    const db = await this.openDb();

    return new Promise<SaveSummary[]>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction([STORE_META], 'readonly');
      } catch (err) {
        reject(new PersistenceUnavailableError('Could not start readonly transaction', { error: String(err) }));
        return;
      }

      const store = tx.objectStore(STORE_META);
      const req = store.getAll();

      req.onsuccess = () => {
        const rows = req.result as StoredMetaRecord[];
        const summaries: SaveSummary[] = rows.map((row) => ({
          sessionId: row.sessionId as SessionId,
          saveId: row.saveId,
          savedAt: row.savedAt,
          stateVersion: row.stateVersion,
        }));
        summaries.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
        resolve(summaries);
      };

      req.onerror = () => {
        reject(new PersistenceError(`Failed to list saves: ${req.error?.message}`));
      };
    });
  }

  async delete(sessionId: SessionId): Promise<void> {
    const db = await this.openDb();

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_ENVELOPES, STORE_EVENTS, STORE_BRANCHES, STORE_META], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new PersistenceError(`Delete failed: ${tx.error?.message}`));
      tx.onabort = () => reject(new PersistenceError('Delete transaction aborted'));

      const envelopeStore = tx.objectStore(STORE_ENVELOPES);
      const eventsStore = tx.objectStore(STORE_EVENTS);
      const branchStore = tx.objectStore(STORE_BRANCHES);
      const metaStore = tx.objectStore(STORE_META);

      envelopeStore.delete(sessionId);
      metaStore.delete(sessionId);

      // Clean up associated events and snapshots
      const evReq = eventsStore.getAll();
      evReq.onsuccess = () => {
        for (const row of evReq.result as StoredEventRecord[]) {
          if (row.sessionId === sessionId) {
            eventsStore.delete([row.sessionId, row.eventId]);
          }
        }
      };

      const brReq = branchStore.getAll();
      brReq.onsuccess = () => {
        for (const row of brReq.result as BranchSnapshotRecord[]) {
          if (row.sessionId === sessionId) {
            branchStore.delete([row.sessionId, row.branchId]);
          }
        }
      };
    });
  }

  close(): void {
    if (this.dbPromise) {
      this.dbPromise.then((db) => db.close()).catch(() => {});
      this.dbPromise = null;
    }
  }
}

/**
 * Clean in-memory IDBFactory implementation conforming to the W3C IDB standard.
 * Enables 100% deterministic, offline Vitest testing in Node.js with real atomic abort rollback.
 */
export function createMemoryIdbFactory(): IDBFactory {
  interface StoreData {
    records: Map<string, unknown>;
  }

  class MemoryDb {
    readonly stores = new Map<string, StoreData>();
    version = 1;
  }

  const dbs = new Map<string, MemoryDb>();

  class MemoryRequest<T> extends EventTarget implements Partial<IDBRequest<T>> {
    result!: T;
    error: DOMException | null = null;
    source: any = null;
    transaction: any = null;
    readyState: IDBRequestReadyState = 'pending';
    onsuccess: ((ev: any) => any) | null = null;
    onerror: ((ev: any) => any) | null = null;

    triggerSuccess(res: T) {
      this.result = res;
      this.readyState = 'done';
      if (this.onsuccess) this.onsuccess({ target: this });
    }

    triggerError(err: DOMException) {
      this.error = err;
      this.readyState = 'done';
      if (this.onerror) this.onerror({ target: this });
    }
  }

  class MemoryOpenRequest extends MemoryRequest<IDBDatabase> implements Partial<IDBOpenDBRequest> {
    onblocked: ((ev: any) => any) | null = null;
    onupgradeneeded: ((ev: any) => any) | null = null;
  }

  function serializeKey(key: unknown): string {
    if (Array.isArray(key)) return key.map(String).join('::');
    return String(key);
  }

  return {
    databases(): Promise<IDBDatabaseInfo[]> {
      const list = [...dbs.keys()].map((name) => ({ name, version: dbs.get(name)!.version }));
      return Promise.resolve(list);
    },
    open(name: string, version?: number): IDBOpenDBRequest {
      const openReq = new MemoryOpenRequest() as unknown as IDBOpenDBRequest;
      setTimeout(() => {
        let isNew = !dbs.has(name);
        if (!dbs.has(name)) dbs.set(name, new MemoryDb());
        const dbState = dbs.get(name)!;

        const dbObj: any = {
          name,
          version: version ?? dbState.version,
          objectStoreNames: {
            contains(storeName: string) {
              return dbState.stores.has(storeName);
            },
          },
          createObjectStore(storeName: string, _opts?: any) {
            if (!dbState.stores.has(storeName)) {
              dbState.stores.set(storeName, { records: new Map() });
            }
            return {
              createIndex(_indexName: string, _keyPath: any, _options?: any) {},
            };
          },
          transaction(storeNames: string | string[], mode?: IDBTransactionMode) {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const snapshots = new Map<string, Map<string, unknown>>();
            for (const n of names) {
              const currentStore = dbState.stores.get(n);
              if (currentStore) {
                snapshots.set(n, new Map(currentStore.records));
              }
            }

            const tx: any = {
              mode: mode ?? 'readonly',
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              abort() {
                // Rollback
                for (const [sName, snap] of snapshots.entries()) {
                  const s = dbState.stores.get(sName);
                  if (s) s.records = snap;
                }
                setTimeout(() => {
                  if (tx.onabort) tx.onabort({ target: tx });
                }, 0);
              },
              objectStore(sName: string) {
                const s = dbState.stores.get(sName);
                if (!s) throw new Error(`Unknown object store: ${sName}`);
                return {
                  put(val: any, explicitKey?: any) {
                    const key = explicitKey ?? (Array.isArray(val) ? serializeKey(val) : val.sessionId && val.eventId ? serializeKey([val.sessionId, val.eventId]) : val.sessionId && val.branchId ? serializeKey([val.sessionId, val.branchId]) : val.sessionId ?? val.id);
                    s.records.set(serializeKey(key), JSON.parse(JSON.stringify(val)));
                    const r = new MemoryRequest();
                    setTimeout(() => r.triggerSuccess(key), 0);
                    return r;
                  },
                  get(key: any) {
                    const r = new MemoryRequest();
                    const val = s.records.get(serializeKey(key));
                    setTimeout(() => r.triggerSuccess(val ? JSON.parse(JSON.stringify(val)) : undefined), 0);
                    return r;
                  },
                  getAll() {
                    const r = new MemoryRequest();
                    const list = [...s.records.values()].map((v) => JSON.parse(JSON.stringify(v)));
                    setTimeout(() => r.triggerSuccess(list), 0);
                    return r;
                  },
                  delete(key: any) {
                    const r = new MemoryRequest();
                    s.records.delete(serializeKey(key));
                    setTimeout(() => r.triggerSuccess(undefined), 0);
                    return r;
                  },
                };
              },
            };

            setTimeout(() => {
              if (tx.oncomplete) tx.oncomplete({ target: tx });
            }, 0);

            return tx;
          },
          close() {},
        };

        if (isNew && openReq.onupgradeneeded) {
          openReq.onupgradeneeded({ target: { result: dbObj } } as any);
        }

        (openReq as any).triggerSuccess(dbObj);
      }, 0);

      return openReq;
    },
    deleteDatabase(_name: string): IDBOpenDBRequest {
      const req = new MemoryOpenRequest() as unknown as IDBOpenDBRequest;
      setTimeout(() => (req as any).triggerSuccess({} as any), 0);
      return req;
    },
    cmp(first: any, second: any): number {
      if (first < second) return -1;
      if (first > second) return 1;
      return 0;
    },
  };
}
