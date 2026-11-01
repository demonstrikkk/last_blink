import type { PersistencePort, SessionId } from '../engine/index.js';
import { CloudSyncClient, CloudSyncError } from './cloudSync.js';

const TOKEN_KEY = 'last-blink-cloud-token';
const PLAYER_KEY = 'last-blink-cloud-player';

/** The browser talks to the same server that owns Yugabyte and Meko. */
export function apiBaseUrl(): string {
  return (import.meta.env.VITE_GAME_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function storedCloudToken(): string | null {
  try {
    return storage()?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

function storeIdentity(client: CloudSyncClient): string {
  const token = client.authToken;
  if (!token) throw new Error('Cloud authentication returned no token.');
  try {
    storage()?.setItem(TOKEN_KEY, token);
    const playerId = client.identity.playerId;
    if (playerId) storage()?.setItem(PLAYER_KEY, playerId);
  } catch {
    // A private-mode browser may refuse storage; the in-memory token still works.
  }
  return token;
}

/**
 * Returns an authenticated client. The anonymous bearer token is persisted so
 * a reload can still reach the same cloud sessions; clearing site data creates
 * a new anonymous identity, exactly as the server contract states.
 */
async function authenticatedClient(
  forceNewIdentity = false,
  options: { readonly baseUrl?: string; readonly token?: string } = {},
): Promise<CloudSyncClient> {
  const baseUrl = options.baseUrl ?? apiBaseUrl();
  if (options.token && !forceNewIdentity) {
    return new CloudSyncClient({ baseUrl, token: options.token });
  }
  const token = forceNewIdentity ? null : storedCloudToken();
  const client = new CloudSyncClient({
    baseUrl,
    ...(token ? { token } : {}),
  });
  if (token) return client;
  await client.authenticate('Field Auditor');
  storeIdentity(client);
  return client;
}

export async function getCloudToken(forceNewIdentity = false): Promise<string> {
  const client = await authenticatedClient(forceNewIdentity);
  return client.authToken ?? storeIdentity(client);
}

export interface CloudSyncOutcome {
  readonly status: 'synced' | 'pulled' | 'conflict' | 'unavailable' | 'error' | 'skipped';
  readonly pushedEvents: number;
  readonly remoteVersion: number;
  readonly localVersion: number;
  readonly message: string;
}

/**
 * Pushes the durable local record to Yugabyte. This never deletes or rewrites
 * local data: a conflict, timeout or missing server leaves the IndexedDB save
 * exactly as it was.
 */
export async function syncDurableSession(
  persistence: PersistencePort,
  sessionId: SessionId,
  options: { readonly baseUrl?: string; readonly token?: string } = {},
): Promise<CloudSyncOutcome> {
  if (typeof persistence.loadSession !== 'function') {
    return {
      status: 'skipped',
      pushedEvents: 0,
      remoteVersion: 0,
      localVersion: 0,
      message: 'This persistence adapter has no durable session record.',
    };
  }

  const record = await persistence.loadSession(sessionId);
  if (!record) {
    return {
      status: 'skipped',
      pushedEvents: 0,
      remoteVersion: 0,
      localVersion: 0,
      message: 'Save locally first; there is no durable record to upload.',
    };
  }

  const localVersion = record.envelope.payload.stateVersion;
  const run = async (forceNewIdentity: boolean) => {
    const client = await authenticatedClient(forceNewIdentity, options);
    return client.syncSession(record);
  };

  try {
    let result;
    try {
      result = await run(false);
    } catch (error) {
      if (error instanceof CloudSyncError && (error.status === 401 || error.status === 403)) {
        result = await run(true);
      } else {
        throw error;
      }
    }
    return {
      status: result.status,
      pushedEvents: result.pushedEvents,
      remoteVersion: result.remoteVersion,
      localVersion,
      message:
        result.message ??
        (result.status === 'synced'
          ? result.pushedEvents > 0
            ? `Uploaded ${result.pushedEvents} event${result.pushedEvents === 1 ? '' : 's'} to Yugabyte.`
            : 'Yugabyte already holds this version.'
          : result.status === 'pulled'
            ? 'The cloud is ahead; local data was left untouched.'
            : 'The cloud history conflicts with this local branch.'),
    };
  } catch (error) {
    if (error instanceof CloudSyncError) {
      return {
        status: error.status === 409 ? 'conflict' : 'unavailable',
        pushedEvents: 0,
        remoteVersion: 0,
        localVersion,
        message:
          error.status === 409
            ? 'The cloud branch advanced under another writer. Local data was left untouched.'
            : 'Cloud is unreachable; the local IndexedDB save is still durable.',
      };
    }
    return {
      status: 'error',
      pushedEvents: 0,
      remoteVersion: 0,
      localVersion,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface MekoAdvisoryHit {
  readonly id: string;
  readonly text: string;
  readonly score?: number;
  readonly source: 'knowledge_base' | 'memory' | 'conversation';
}

export interface MekoAdvisoryResponse {
  readonly advisory: true;
  readonly canonical: false;
  readonly query: string;
  readonly source: 'remote' | 'fallback_local';
  readonly truncated: boolean;
  readonly hits: readonly MekoAdvisoryHit[];
  readonly memories: readonly string[];
  readonly diagnostics: {
    readonly configured: boolean;
    readonly online: boolean;
    readonly datapackId: string | null;
  };
}

/** ECHO and the HUD call this; Meko never writes canonical state. */
export async function fetchMekoAdvisory(input: {
  readonly sessionId: string;
  readonly branchId: string;
  readonly query: string;
  readonly npcId?: string;
}): Promise<MekoAdvisoryResponse> {
  const request = async (token: string) =>
    fetch(`${apiBaseUrl()}/api/context/meko`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });

  let response = await request(await getCloudToken());
  if (response.status === 401 || response.status === 403) {
    response = await request(await getCloudToken(true));
  }
  if (!response.ok) {
    throw new Error(`Meko advisory returned ${response.status}.`);
  }
  return (await response.json()) as MekoAdvisoryResponse;
}
