import { describe, expect, it } from 'vitest';
import {
  MekoService,
  parseMcpResponse,
  unwrapToolResult,
  type MekoConfig,
} from '../src/services/mekoService.js';

const onlineConfig: Partial<MekoConfig> = {
  apiToken: 'meko-test-token',
  datapackId: 'dp_test_0001',
  offlineOnly: false,
  endpointUrl: 'https://meko.invalid/mcp',
  timeoutMs: 1000,
};

function sse(payload: unknown, sessionId = 'mcp-session-1'): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Mcp-Session-Id': sessionId,
    },
  });
}

function toolText(value: unknown) {
  return {
    jsonrpc: '2.0',
    id: 2,
    result: { content: [{ type: 'text', text: JSON.stringify(value) }] },
  };
}

interface Call {
  method: string;
  tool?: string;
  args?: Record<string, unknown>;
  headers: Headers;
}

function fakeMeko(overrides: Partial<Record<string, unknown>> = {}): {
  fetchImpl: typeof fetch;
  calls: Call[];
  uploads: FormData[];
} {
  const calls: Call[] = [];
  const uploads: FormData[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.body instanceof FormData) {
      uploads.push(init.body);
      calls.push({ method: 's3-upload', headers: new Headers(init?.headers) });
      return new Response(null, { status: 204 });
    }
    const body = JSON.parse(String(init?.body)) as {
      method: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    const headers = new Headers(init?.headers);
    calls.push({
      method: body.method,
      tool: body.params?.name,
      args: body.params?.arguments,
      headers,
    });
    if (body.method === 'initialize') {
      return sse({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2025-03-26', serverInfo: { name: 'Meko MCP', version: '3.2.4' } },
      });
    }
    if (body.method === 'notifications/initialized') {
      return new Response('', { status: 202 });
    }
    if (body.method === 'tools/call') {
      switch (body.params?.name) {
        case 'conversation_create':
          return sse(toolText({ id: 'conv_live_1' }));
        case 'knowledgebase_search':
          return sse(
            toolText(
              overrides.knowledgebase ?? {
                results: [
                  { id: 'kb_1', chunk_text: 'Relay 7 lost eight minutes.', score: 0.91 },
                  { id: 'kb_2', chunk_text: 'Ward protocol 14-B preserves records.', score: 0.72 },
                ],
              },
            ),
          );
        case 'knowledgebase_upload_document':
          return sse(
            toolText(
              overrides.upload ?? {
                url: 'https://upload.invalid/presigned',
                fields: { key: 'archive/veyra.md', policy: 'policy-value' },
                key: 'doc_key_001',
                already_uploaded: false,
              },
            ),
          );
        case 'knowledgebase_document_status':
          return sse(toolText(overrides.documentStatus ?? { status: 'indexed' }));
        case 'memory_add':
          return sse(toolText({ results: [{ id: 'mem_live_1' }] }));
        case 'memory_search':
          return sse(
            toolText(
              overrides.memory ?? {
                results: [
                  {
                    id: 'mem_live_1',
                    memory: '[NPC:npc_sable|Branch:brn_main|Scope:CHARACTER_PRIVATE] saw the gap',
                    metadata: { confidence: 0.9 },
                  },
                  {
                    id: 'mem_live_2',
                    memory: '[NPC:npc_ivo|Branch:brn_main|Scope:CHARACTER_PRIVATE] should not leak',
                    metadata: {},
                  },
                  {
                    id: 'mem_live_3',
                    memory: '[NPC:system|Branch:brn_main|Scope:PUBLIC_WORLD] curfew announced',
                    metadata: {},
                  },
                ],
              },
            ),
          );
        default:
          return sse({ jsonrpc: '2.0', id: 3, result: {} });
      }
    }
    return new Response('', { status: 202 });
  }) as typeof fetch;
  return { fetchImpl, calls, uploads };
}

describe('Meko MCP client', () => {
  it('runs the initialize lifecycle once and sends the bearer token', async () => {
    const { fetchImpl, calls } = fakeMeko();
    const meko = new MekoService(onlineConfig, { fetchImpl });
    const result = await meko.searchKnowledgeBase('Relay 7', 'ses_1');
    expect(result.source).toBe('remote');
    expect(result.hits.length).toBe(2);
    expect(calls.filter((call) => call.method === 'initialize')).toHaveLength(1);
    expect(calls.some((call) => call.method === 'notifications/initialized')).toBe(true);
    expect(calls.every((call) => call.headers.get('authorization') === 'Bearer meko-test-token')).toBe(true);
  });

  it('passes conversation and datapack ids to knowledgebase_search', async () => {
    const { fetchImpl, calls } = fakeMeko();
    const meko = new MekoService(onlineConfig, { fetchImpl });
    await meko.searchKnowledgeBase('Relay 7', 'ses_2', 3);
    const search = calls.find((call) => call.tool === 'knowledgebase_search');
    expect(search?.args).toMatchObject({
      conversation_id: 'conv_live_1',
      datapack_id: 'dp_test_0001',
      limit: 3,
    });
  });

  it('encodes scope metadata on write and filters cross-NPC memory on read', async () => {
    const { fetchImpl, calls } = fakeMeko();
    const meko = new MekoService(onlineConfig, { fetchImpl });
    const written = await meko.addNpcMemory(
      {
        content: 'saw the gap',
        npcId: 'npc_sable',
        branchId: 'brn_main',
        visibilityScope: 'CHARACTER_PRIVATE',
        confidence: 0.9,
      },
      'ses_3',
    );
    expect(written.remote).toBe(true);
    const add = calls.find((call) => call.tool === 'memory_add');
    expect(String(add?.args?.text)).toContain('[NPC:npc_sable|Branch:brn_main|Scope:CHARACTER_PRIVATE]');

    const memories = await meko.searchNpcMemories('npc_sable', 'brn_main', 'gap', 'ses_3');
    expect(memories.some((memory) => memory.content.includes('saw the gap'))).toBe(true);
    expect(memories.some((memory) => memory.content.includes('should not leak'))).toBe(false);
    expect(memories.some((memory) => memory.content.includes('curfew announced'))).toBe(true);
  });

  it('bounds retrieval to the configured maximum', async () => {
    const { fetchImpl } = fakeMeko({
      knowledgebase: {
        results: Array.from({ length: 20 }, (_, index) => ({
          id: `kb_${index}`,
          chunk_text: `record ${index}`,
        })),
      },
    });
    const meko = new MekoService(onlineConfig, { fetchImpl });
    const result = await meko.searchKnowledgeBase('records', 'ses_4', 500);
    expect(result.hits.length).toBeLessThanOrEqual(8);
    expect(result.truncated).toBe(true);
  });

  it('deduplicates repeated knowledge-base chunks', async () => {
    const { fetchImpl } = fakeMeko({
      knowledgebase: {
        results: [
          { id: 'kb_a', chunk_text: 'Relay 7 lost eight minutes.' },
          { id: 'kb_b', chunk_text: 'Relay 7 lost eight minutes.' },
          { id: 'kb_c', chunk_text: 'Ward protocol 14-B preserves records.' },
        ],
      },
    });
    const meko = new MekoService(onlineConfig, { fetchImpl });
    const result = await meko.searchKnowledgeBase('Relay 7', 'ses_dedupe', 3);
    expect(result.hits.map((hit) => hit.text)).toEqual([
      'Relay 7 lost eight minutes.',
      'Ward protocol 14-B preserves records.',
    ]);
  });

  it('uploads a curated document and reads its ingestion status', async () => {
    const { fetchImpl, calls, uploads } = fakeMeko();
    const meko = new MekoService(onlineConfig, { fetchImpl });
    const content = new TextEncoder().encode('# Archive\n\nRelay 7 lost eight minutes.\n');
    const receipt = await meko.ingestDocument({
      filename: 'veyra.md',
      content,
      contentHash: 'a'.repeat(64),
      conversationId: 'conv_live_1',
    });

    expect(receipt).toEqual({ key: 'doc_key_001', alreadyUploaded: false });
    const presign = calls.find((call) => call.tool === 'knowledgebase_upload_document');
    expect(presign?.args).toMatchObject({
      filename: 'veyra.md',
      size: content.byteLength,
      datapack_id: 'dp_test_0001',
      conversation_id: 'conv_live_1',
    });
    expect(uploads).toHaveLength(1);
    const uploaded = uploads[0]!;
    expect(uploaded.get('key')).toBe('archive/veyra.md');
    expect(uploaded.get('file')).toBeInstanceOf(File);

    await expect(meko.documentStatus('doc_key_001', 'conv_live_1')).resolves.toBe('indexed');
  });

  it('falls back deterministically on transport failure and reports offline diagnostics', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const meko = new MekoService(onlineConfig, { fetchImpl });
    const result = await meko.searchKnowledgeBase('Relay 7', 'ses_5');
    expect(result.source).toBe('fallback_local');
    expect(result.hits.length).toBeGreaterThan(0);
    expect(meko.diagnostics().online).toBe(false);
    expect(meko.diagnostics().failures).toBeGreaterThan(0);
  });

  it('stays offline when credentials or datapack are missing', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('', { status: 200 });
    }) as typeof fetch;
    const meko = new MekoService({ apiToken: '', datapackId: '', offlineOnly: true }, { fetchImpl });
    const result = await meko.searchKnowledgeBase('Relay 7', 'ses_6');
    expect(result.source).toBe('fallback_local');
    expect(called).toBe(false);
  });

  it('parses SSE and plain JSON MCP envelopes', () => {
    expect(parseMcpResponse('data: {"jsonrpc":"2.0","id":1,"result":{}}\n')).toMatchObject({
      id: 1,
    });
    expect(parseMcpResponse('{"jsonrpc":"2.0","id":2,"result":{}}')).toMatchObject({ id: 2 });
    expect(parseMcpResponse('event: ping\ndata: {}\n')).toBeNull();
    expect(unwrapToolResult(toolText({ ok: true }))).toEqual({ ok: true });
  });
});
