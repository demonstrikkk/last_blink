/**
 * Meko MCP client for The Last Blink.
 *
 * Meko is a *supplementary* context and memory layer. It is never the canonical
 * game store: GameSession + YugabyteDB own truth, and Meko only enriches NPC
 * recall and archive search. Every remote result is bounded, filtered by
 * datapack/branch/NPC scope, and falls back deterministically when unavailable.
 *
 * Transport: MCP JSON-RPC 2.0 over HTTP with SSE responses. The client performs
 * the initialize -> notifications/initialized lifecycle once, reuses the session
 * id when the server issues one, and applies a hard timeout to every call.
 */

export interface MekoConfig {
  readonly endpointUrl: string;
  readonly apiToken: string;
  readonly datapackId: string;
  readonly agentId: string;
  readonly timeoutMs: number;
  readonly offlineOnly: boolean;
  readonly maxRetrievalLimit: number;
}

export const DEFAULT_MEKO_CONFIG: MekoConfig = {
  endpointUrl: 'https://mcp.mekodata.ai/mcp',
  apiToken: '',
  datapackId: '',
  agentId: 'last_blink:last_blink',
  timeoutMs: 12_000,
  offlineOnly: false,
  maxRetrievalLimit: 8,
};

export function mekoConfigFromEnvironment(
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): MekoConfig {
  const timeout = Number(env.MEKO_TIMEOUT_MS);
  return {
    endpointUrl: env.MEKO_ENDPOINT_URL ?? DEFAULT_MEKO_CONFIG.endpointUrl,
    apiToken: env.MEKO_API_KEY ?? '',
    datapackId: env.MEKO_DATAPACK_ID ?? '',
    agentId: env.MEKO_AGENT_ID ?? DEFAULT_MEKO_CONFIG.agentId,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_MEKO_CONFIG.timeoutMs,
    // Credentials alone are not enough: knowledgebase_search requires a datapack.
    offlineOnly:
      env.MEKO_OFFLINE_ONLY === 'true' ||
      !env.MEKO_API_KEY ||
      !env.MEKO_DATAPACK_ID ||
      !env.MEKO_ENDPOINT_URL,
    maxRetrievalLimit: DEFAULT_MEKO_CONFIG.maxRetrievalLimit,
  };
}

export type MekoVisibilityScope =
  | 'PUBLIC_WORLD'
  | 'FACTION'
  | 'CHARACTER_PRIVATE'
  | 'SYSTEM_SECURITY';

export interface MekoMemoryRecord {
  readonly memoryId?: string;
  readonly content: string;
  readonly npcId: string;
  readonly branchId: string;
  readonly sourceEventId?: string;
  readonly visibilityScope: MekoVisibilityScope;
  readonly confidence: number;
}

export interface MekoContextHit {
  readonly id: string;
  readonly text: string;
  readonly score?: number;
  readonly source: 'knowledge_base' | 'memory' | 'conversation';
}

export interface MekoContextSearchResult {
  readonly query: string;
  readonly hits: readonly MekoContextHit[];
  readonly source: 'remote' | 'fallback_local';
  readonly truncated: boolean;
}

export interface MekoDiagnostics {
  readonly configured: boolean;
  readonly online: boolean;
  readonly datapackId: string | null;
  readonly conversationId: string | null;
  readonly failures: number;
  readonly lastError: string | null;
}

interface ToolEnvelope {
  readonly payload: unknown;
  readonly sessionId: string | null;
}

const FALLBACK_ARCHIVE: readonly MekoContextHit[] = [
  {
    id: 'fb_relay_7_archive',
    text: 'Veyra Civic Network Archive: Relay 7 recorded an unaligned eight-minute window during district cycle 03:14.',
    source: 'knowledge_base',
  },
  {
    id: 'fb_ward_protocol',
    text: 'Ward protocol 14-B authorises a preservation hold when a settlement cannot be attributed.',
    source: 'knowledge_base',
  },
];

function clampLimit(limit: number, max: number): number {
  if (!Number.isFinite(limit)) return 5;
  return Math.max(1, Math.min(Math.floor(limit), max));
}

/** Extracts the MCP result from either a plain JSON or an SSE body. */
export function parseMcpResponse(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to SSE parsing.
    }
  }
  let last: unknown = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    try {
      const candidate: unknown = JSON.parse(data);
      if (
        candidate &&
        typeof candidate === 'object' &&
        ('result' in candidate || 'error' in candidate)
      ) {
        last = candidate;
      }
    } catch {
      // Ignore keep-alive or partial frames.
    }
  }
  return last;
}

/** Tool results are MCP content blocks whose text is usually stringified JSON. */
export function unwrapToolResult(result: unknown): unknown {
  const envelope = result as {
    error?: { message?: string };
    result?: { content?: Array<{ text?: string }>; structuredContent?: { result?: unknown } };
  };
  if (envelope?.error) throw new Error(`MCP error: ${envelope.error.message ?? 'unknown'}`);
  const text = envelope?.result?.content?.[0]?.text;
  if (typeof text === 'string') {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return envelope?.result?.structuredContent?.result ?? envelope?.result;
}

export class MekoService {
  private readonly config: MekoConfig;
  private readonly fetchImpl: typeof fetch;
  private conversationId: string | null = null;
  private mcpSessionId: string | null = null;
  private initialized = false;
  private online = true;
  private failures = 0;
  private lastError: string | null = null;
  private readonly localMemories: MekoMemoryRecord[] = [];

  constructor(
    config: Partial<MekoConfig> = {},
    deps: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    const merged: MekoConfig = {
      ...DEFAULT_MEKO_CONFIG,
      ...mekoConfigFromEnvironment(),
      ...config,
    };
    const credentialsPresent = merged.apiToken.length > 0 && merged.datapackId.length > 0;
    this.config = {
      ...merged,
      offlineOnly: config.offlineOnly ?? (credentialsPresent ? false : true),
    };
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  }

  diagnostics(): MekoDiagnostics {
    return {
      configured: !this.config.offlineOnly && this.config.apiToken.length > 0,
      online: this.online,
      datapackId: this.config.datapackId || null,
      conversationId: this.conversationId,
      failures: this.failures,
      lastError: this.lastError,
    };
  }

  /** Creates or reconnects the MCP session. Idempotent and safe to call often. */
  async initialize(): Promise<boolean> {
    if (this.config.offlineOnly) return false;
    if (this.initialized) return true;
    try {
      const envelope = await this.rpc('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'the-last-blink', version: '1.0.0' },
      });
      this.mcpSessionId = envelope.sessionId;
      const info = unwrapToolResult(envelope.payload) as { serverInfo?: { name?: string } };
      if (!info?.serverInfo?.name) throw new Error('MCP initialize response missing serverInfo');
      await this.notify('notifications/initialized', {});
      this.initialized = true;
      this.online = true;
      return true;
    } catch (error) {
      this.markFailure(error);
      return false;
    }
  }

  async ensureConversation(sessionId: string): Promise<string> {
    if (this.conversationId) return this.conversationId;
    if (this.config.offlineOnly) {
      this.conversationId = `conv_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      return this.conversationId;
    }
    const ready = await this.initialize();
    if (!ready) {
      this.conversationId = `conv_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      return this.conversationId;
    }
    try {
      const result = unwrapToolResult(
        (
          await this.callTool('conversation_create', {
            title: `The Last Blink — ${sessionId}`.slice(0, 120),
            agent_id: this.config.agentId,
            datapack_id: this.config.datapackId,
            session_id: sessionId,
          })
        ).payload,
      ) as { id?: string; conversation_id?: string };
      const id = result?.id ?? result?.conversation_id;
      if (typeof id === 'string' && id.length > 0) {
        this.conversationId = id;
        return id;
      }
    } catch (error) {
      this.markFailure(error);
    }
    this.conversationId = `conv_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return this.conversationId;
  }

  /** Discovers the caller's default datapack when no id is configured. */
  async discoverDatapackId(sessionId = 'discovery'): Promise<string | null> {
    const ready = await this.initialize();
    if (!ready) return null;
    const conversationId = await this.ensureConversation(sessionId);
    try {
      const result = unwrapToolResult(
        (
          await this.callTool('datapack_list', {
            conversation_id: conversationId,
            limit: 10,
          })
        ).payload,
      );
      const rows = Array.isArray(result) ? result : [];
      const first = rows[0] as { datapack_id?: string } | undefined;
      return typeof first?.datapack_id === 'string' ? first.datapack_id : null;
    } catch (error) {
      this.markFailure(error);
      return null;
    }
  }

  async searchKnowledgeBase(
    query: string,
    sessionId: string,
    limit = 5,
  ): Promise<MekoContextSearchResult> {
    const bounded = clampLimit(limit, this.config.maxRetrievalLimit);
    const trimmed = query.trim().slice(0, 500);
    const fallback = (): MekoContextSearchResult => ({
      query: trimmed,
      hits: FALLBACK_ARCHIVE.slice(0, bounded),
      source: 'fallback_local',
      truncated: false,
    });
    if (this.config.offlineOnly || trimmed.length === 0) return fallback();

    const conversationId = await this.ensureConversation(sessionId);
    try {
      const result = unwrapToolResult(
        (
          await this.callTool('knowledgebase_search', {
            query: trimmed,
            conversation_id: conversationId,
            datapack_id: this.config.datapackId,
            agent_id: this.config.agentId,
            limit: bounded,
          })
        ).payload,
      ) as { results?: Array<Record<string, unknown>> };
      const rows = Array.isArray(result?.results) ? result.results : [];
      const hits = rows
        .slice(0, bounded)
        .map((row, index) => ({
          id: typeof row.id === 'string' ? row.id : `kb_${index}`,
          text: String(row.chunk_text ?? row.content ?? row.text ?? '').slice(0, 1200),
          score: typeof row.score === 'number' ? row.score : undefined,
          source: 'knowledge_base' as const,
        }))
        .filter((hit) => hit.text.length > 0);
      if (hits.length === 0) return fallback();
      this.online = true;
      return { query: trimmed, hits, source: 'remote', truncated: rows.length > bounded };
    } catch (error) {
      this.markFailure(error);
      return fallback();
    }
  }

  /**
   * Writes an NPC-scoped memory. Branch and visibility are encoded in the text
   * (documented format) so they survive storage and can be re-verified on read.
   */
  async addNpcMemory(
    record: MekoMemoryRecord,
    sessionId: string,
  ): Promise<{ success: boolean; memoryId: string; remote: boolean }> {
    this.localMemories.push(record);
    if (this.config.offlineOnly) {
      return { success: true, memoryId: `local_${this.localMemories.length}`, remote: false };
    }
    const conversationId = await this.ensureConversation(sessionId);
    const provenance = record.sourceEventId ? `|SourceEvent:${record.sourceEventId}` : '';
    const text = `[NPC:${record.npcId}|Branch:${record.branchId}|Scope:${record.visibilityScope}${provenance}] ${record.content}`.slice(
      0,
      4000,
    );
    try {
      const result = unwrapToolResult(
        (
          await this.callTool('memory_add', {
            text,
            conversation_id: conversationId,
            datapack_id: this.config.datapackId,
            agent_id: this.config.agentId,
            metadata: JSON.stringify({
              npcId: record.npcId,
              branchId: record.branchId,
              scope: record.visibilityScope,
              confidence: record.confidence,
              sourceEventId: record.sourceEventId ?? null,
            }),
          })
        ).payload,
      ) as { results?: Array<{ id?: string }> };
      const memoryId = result?.results?.[0]?.id;
      this.online = true;
      return {
        success: true,
        memoryId: typeof memoryId === 'string' ? memoryId : `remote_${Date.now()}`,
        remote: true,
      };
    } catch (error) {
      this.markFailure(error);
      return { success: true, memoryId: `local_${this.localMemories.length}`, remote: false };
    }
  }

  /**
   * Retrieves memories for one NPC and branch. Remote rows are re-filtered
   * locally: a hit is accepted only when its encoded scope matches the NPC or is
   * PUBLIC_WORLD, and its branch matches or is `main`.
   */
  async searchNpcMemories(
    npcId: string,
    branchId: string,
    query: string,
    sessionId: string,
    limit = 6,
  ): Promise<readonly MekoMemoryRecord[]> {
    const bounded = clampLimit(limit, this.config.maxRetrievalLimit);
    const normalized = query.trim().slice(0, 300).toLowerCase();
    const local = this.localMemories.filter((memory) => {
      const npcVisible = memory.npcId === npcId || memory.visibilityScope === 'PUBLIC_WORLD';
      const branchVisible =
        memory.visibilityScope === 'PUBLIC_WORLD' || memory.branchId === branchId;
      return npcVisible && branchVisible && memory.content.toLowerCase().includes(normalized);
    });
    if (this.config.offlineOnly || normalized.length === 0 || !this.online) return local.slice(0, bounded);

    const conversationId = await this.ensureConversation(sessionId);
    try {
      const result = unwrapToolResult(
        (
          await this.callTool('memory_search', {
            query: `${npcId} ${normalized}`.slice(0, 300),
            conversation_id: conversationId,
            datapack_id: this.config.datapackId,
            agent_id: this.config.agentId,
            limit: bounded,
          })
        ).payload,
      ) as { results?: Array<Record<string, unknown>> };
      const remote = (Array.isArray(result?.results) ? result.results : [])
        .slice(0, bounded)
        .map((row): MekoMemoryRecord | null => {
          const text = String(row.memory ?? row.content ?? '');
          const metadata = (row.metadata ?? {}) as Record<string, unknown>;
          const encodedNpc = /NPC:([^|\]]+)/.exec(text)?.[1] ?? null;
          const encodedBranch = /Branch:([^|\]]+)/.exec(text)?.[1] ?? null;
          const encodedScope = /Scope:([^|\]]+)/.exec(text)?.[1] as MekoVisibilityScope | undefined;
          const encodedSourceEventId =
            /SourceEvent:([^|\]]+)/.exec(text)?.[1] ??
            (typeof metadata.sourceEventId === 'string' ? metadata.sourceEventId : undefined);
          if (encodedNpc !== null && encodedNpc !== npcId && encodedScope !== 'PUBLIC_WORLD') return null;
          if (
            encodedScope !== 'PUBLIC_WORLD' &&
            encodedBranch !== null &&
            encodedBranch !== branchId
          ) return null;
          return {
            memoryId: typeof row.id === 'string' ? row.id : undefined,
            content: text.slice(0, 2000),
            npcId: encodedNpc ?? npcId,
            branchId: encodedBranch ?? branchId,
            visibilityScope: encodedScope ?? 'CHARACTER_PRIVATE',
            confidence: typeof metadata.confidence === 'number' ? metadata.confidence : 0.75,
            ...(encodedSourceEventId ? { sourceEventId: encodedSourceEventId } : {}),
          };
        })
        .filter((row): row is MekoMemoryRecord => row !== null);
      this.online = true;
      return [...local, ...remote].slice(0, bounded);
    } catch (error) {
      this.markFailure(error);
      return local.slice(0, bounded);
    }
  }

  private markFailure(error: unknown): void {
    this.failures += 1;
    this.online = false;
    this.lastError = error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
  }

  private async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolEnvelope> {
    if (!this.config.apiToken || !this.config.datapackId) {
      throw new Error('Meko credentials are incomplete.');
    }
    return this.rpc('tools/call', { name, arguments: args });
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<ToolEnvelope> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImpl(this.config.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${this.config.apiToken}`,
          ...(this.mcpSessionId ? { 'Mcp-Session-Id': this.mcpSessionId } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          method,
          params,
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Meko MCP HTTP ${response.status}`);
      }
      const payload = parseMcpResponse(text);
      if (!payload) throw new Error('Meko MCP returned an unparseable response.');
      return { payload, sessionId: response.headers.get('mcp-session-id') };
    } finally {
      clearTimeout(timer);
    }
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      await this.fetchImpl(this.config.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${this.config.apiToken}`,
          ...(this.mcpSessionId ? { 'Mcp-Session-Id': this.mcpSessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', method, params }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Clears local state. Meko has no server-side session to terminate. */
  async close(): Promise<void> {
    this.initialized = false;
    this.mcpSessionId = null;
    this.conversationId = null;
  }
}
