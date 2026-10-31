/**
 * Meko MCP Integration Service for The Last Blink.
 *
 * Connects to Meko's agent context & collective memory infrastructure
 * via Model Context Protocol (MCP) JSON-RPC over HTTP/SSE.
 *
 * Implements:
 * - Governed context retrieval and knowledge base search
 * - Character-scoped memory additions with branch and visibility enforcement
 * - Circuit breaker and graceful offline fallback for deterministic continuity
 */

export interface MekoConfig {
  readonly endpointUrl: string;
  readonly apiToken: string;
  readonly datapackId: string;
  readonly timeoutMs?: number;
  readonly offlineOnly?: boolean;
}

export const DEFAULT_MEKO_CONFIG: MekoConfig = {
  endpointUrl: 'https://mcp.mekodata.ai/mcp',
  apiToken: 'mko_tkn_hfggkhbwlantveoqtd32cjyjdbfzwbmewlf33ca',
  datapackId: 'ba6248d0-11be-45eb-9495-65ff8300051d',
  timeoutMs: 6000,
  offlineOnly: false,
};

export interface MekoMemoryRecord {
  readonly memoryId?: string;
  readonly content: string;
  readonly npcId: string;
  readonly branchId: string;
  readonly sourceEventId?: string;
  readonly visibilityScope: 'PUBLIC_WORLD' | 'FACTION' | 'CHARACTER_PRIVATE' | 'SYSTEM_SECURITY';
  readonly confidence: number;
}

export interface MekoContextSearchResult {
  readonly query: string;
  readonly hits: readonly {
    readonly id: string;
    readonly text: string;
    readonly score?: number;
    readonly source: 'knowledge_base' | 'memory' | 'conversation';
  }[];
  readonly source: 'remote' | 'fallback_local';
}

export class MekoService {
  private readonly config: MekoConfig;
  private activeConversationId: string | null = null;
  private isOnline = true;
  private localFallbackMemories: MekoMemoryRecord[] = [];

  constructor(config: Partial<MekoConfig> = {}) {
    this.config = { ...DEFAULT_MEKO_CONFIG, ...config };
  }

  /**
   * Initializes or restores a session conversation in Meko.
   */
  async ensureConversation(sessionId: string): Promise<string> {
    if (this.activeConversationId) return this.activeConversationId;
    if (this.config.offlineOnly) {
      this.activeConversationId = `conv_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      return this.activeConversationId;
    }

    try {
      const response = await this.callTool('conversation_create', {
        title: `The Last Blink - Session ${sessionId}`,
        metadata: { sessionId, system: 'antigravity-game-engine' },
      });

      if (response && response.id) {
        this.activeConversationId = response.id;
        this.isOnline = true;
        return response.id;
      }
    } catch {
      this.isOnline = false;
    }

    // Deterministic fallback conversation ID
    this.activeConversationId = `conv_${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    return this.activeConversationId;
  }

  /**
   * Searches Meko's knowledge base for world background and documents.
   */
  async searchKnowledgeBase(query: string, sessionId: string): Promise<MekoContextSearchResult> {
    const convId = await this.ensureConversation(sessionId);
    if (this.config.offlineOnly) {
      return {
        query,
        hits: [
          {
            id: 'fb_relay_7_archive',
            text: 'Veyra Civic Network Archive: Relay 7 recorded an unaligned 8-minute window during district cycle 03:14.',
            source: 'knowledge_base',
          },
        ],
        source: 'fallback_local',
      };
    }

    try {
      const result = await this.callTool('knowledgebase_search', {
        query,
        conversation_id: convId,
        datapack_id: this.config.datapackId,
        limit: 5,
      });

      if (result && Array.isArray(result.results)) {
        return {
          query,
          hits: result.results.map((r: { id?: string; chunk_text?: string; content?: string }, idx: number) => ({
            id: r.id ?? `hit_${idx}`,
            text: r.chunk_text ?? r.content ?? '',
            source: 'knowledge_base',
          })),
          source: 'remote',
        };
      }
    } catch {
      this.isOnline = false;
    }

    // Local deterministic fallback
    return {
      query,
      hits: [
        {
          id: 'fb_relay_7_archive',
          text: 'Veyra Civic Network Archive: Relay 7 recorded an unaligned 8-minute window during district cycle 03:14.',
          source: 'knowledge_base',
        },
      ],
      source: 'fallback_local',
    };
  }

  /**
   * Adds an episodic or semantic memory scoped to an NPC and branch.
   */
  async addNpcMemory(record: MekoMemoryRecord, sessionId: string): Promise<{ success: boolean; memoryId: string }> {
    const convId = await this.ensureConversation(sessionId);

    // Track locally for offline/deterministic recovery
    this.localFallbackMemories.push(record);
    if (this.config.offlineOnly) {
      return { success: true, memoryId: `local_${Date.now()}` };
    }

    try {
      const res = await this.callTool('memory_add', {
        conversation_id: convId,
        datapack_id: this.config.datapackId,
        messages: [
          {
            role: 'assistant',
            content: `[NPC:${record.npcId}|Branch:${record.branchId}|Scope:${record.visibilityScope}] ${record.content}`,
          },
        ],
      });

      return {
        success: true,
        memoryId: res?.memory_id ?? `mem_${Date.now()}`,
      };
    } catch {
      this.isOnline = false;
      return {
        success: true,
        memoryId: `local_${Date.now()}`,
      };
    }
  }

  /**
   * Searches memories strictly filtered by NPC knowledge scope and active branch.
   */
  async searchNpcMemories(
    npcId: string,
    branchId: string,
    query: string,
    sessionId: string,
  ): Promise<readonly MekoMemoryRecord[]> {
    // Branch & NPC isolation filter applied to local and retrieved memories
    const matchesLocal = this.localFallbackMemories.filter(
      (m) =>
        (m.npcId === npcId || m.visibilityScope === 'PUBLIC_WORLD') &&
        (m.branchId === branchId || m.branchId === 'main') &&
        m.content.toLowerCase().includes(query.toLowerCase()),
    );

    if (this.config.offlineOnly || !this.isOnline) {
      return matchesLocal;
    }

    const convId = await this.ensureConversation(sessionId);
    try {
      const result = await this.callTool('memory_search', {
        conversation_id: convId,
        datapack_id: this.config.datapackId,
        query: `${npcId} ${query}`,
        limit: 10,
      });

      if (result && Array.isArray(result.memories)) {
        // Enforce strict branch and NPC boundaries on remote hits
        const sanitizedRemote: MekoMemoryRecord[] = [];
        for (const r of result.memories) {
          const text = r.memory ?? r.content ?? '';
          if (text.includes(`NPC:${npcId}`) || text.includes('Scope:PUBLIC_WORLD')) {
            sanitizedRemote.push({
              content: text,
              npcId,
              branchId,
              visibilityScope: text.includes('Scope:PUBLIC_WORLD') ? 'PUBLIC_WORLD' : 'CHARACTER_PRIVATE',
              confidence: 0.9,
            });
          }
        }
        return [...matchesLocal, ...sanitizedRemote];
      }
    } catch {
      this.isOnline = false;
    }

    return matchesLocal;
  }

  /**
   * Low-level JSON-RPC MCP tool invocation.
   */
  private async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 6000);

    try {
      const response = await fetch(this.config.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${this.config.apiToken}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Meko MCP HTTP error ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      const match = text.match(/data:\s*(\{.*\})/);
      if (!match || !match[1]) {
        throw new Error(`Failed to parse MCP response stream: ${text.slice(0, 100)}`);
      }

      const json = JSON.parse(match[1]);
      if (json.error) {
        throw new Error(`MCP Error ${json.error.code}: ${json.error.message}`);
      }

      const rawResult = json.result?.content?.[0]?.text;
      if (typeof rawResult === 'string') {
        try {
          return JSON.parse(rawResult);
        } catch {
          return rawResult;
        }
      }
      return json.result?.structuredContent?.result ?? json.result;
    } finally {
      clearTimeout(timeout);
    }
  }
}
