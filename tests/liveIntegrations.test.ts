import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MekoService } from '../src/services/mekoService.js';
import {
  ModelGateway,
  modelGatewayConfigFromEnvironment,
} from '../src/services/modelGateway.js';

/**
 * Opt-in live smoke tests. They are skipped by default so CI never needs
 * credentials. Run locally with:
 *   $env:RUN_LIVE='1'; npx vitest run tests/liveIntegrations.test.ts
 * Values are read from .env and never printed.
 */
const live = process.env.RUN_LIVE === '1';

function loadEnv(): Record<string, string> {
  if (!live) return {};
  try {
    return Object.fromEntries(
      readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Z0-9_]+=/.test(line))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
  } catch {
    return {};
  }
}

const env = loadEnv();

describe.skipIf(!live)('live provider and Meko integration', () => {
  it('returns a schema-valid line from the live model gateway', async () => {
    const config = modelGatewayConfigFromEnvironment(env);
    const gateway = new ModelGateway(config, {
      logger: { info: () => undefined, warn: () => undefined },
    });
    const schema = z.object({ line: z.string().min(1) });
    const response = await gateway.request({
      task: 'npc_dialogue',
      system: 'You write one terse line of dystopian municipal dialogue.',
      prompt: 'Orin greets the auditor at Relay 7. Respond as JSON {"line":"..."}',
      schema,
      sessionId: 'ses_live_smoke',
      requestId: `req_live_${Date.now()}`,
      fallback: () => ({ line: 'Relay 7 is closed. It has been closed for eight minutes.' }),
    });
    expect(response.value.line.length).toBeGreaterThan(0);
    expect(['groq', 'gemini', 'fallback']).toContain(response.provider);
    expect(response.fallback).toBe(false);
  }, 30_000);

  it('performs a live Meko search, memory write and scoped recall', async () => {
    const meko = new MekoService({
      apiToken: env.MEKO_API_KEY,
      datapackId: env.MEKO_DATAPACK_ID,
      endpointUrl: env.MEKO_ENDPOINT_URL,
      offlineOnly: false,
    });
    await meko.initialize();
    expect(meko.diagnostics().online).toBe(true);

    const search = await meko.searchKnowledgeBase('Relay 7 unaligned window', 'ses_live_meko');
    expect(search.query.length).toBeGreaterThan(0);

    const written = await meko.addNpcMemory(
      {
        content: 'Live smoke memory: Orin keeps the jumper in the diner booth.',
        npcId: 'npc_orin',
        branchId: 'main',
        visibilityScope: 'CHARACTER_PRIVATE',
        confidence: 1,
      },
      'ses_live_meko',
    );
    expect(written.success).toBe(true);

    const recalled = await meko.searchNpcMemories(
      'npc_orin',
      'main',
      'jumper diner booth',
      'ses_live_meko',
    );
    expect(recalled.some((memory) => memory.content.includes('jumper'))).toBe(true);
    await meko.close();
  }, 30_000);
});
