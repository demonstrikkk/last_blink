import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { MekoService } from '../src/services/mekoService.js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

describe('meko debug', () => {
  it('debugs', async () => {
    const meko = new MekoService({
      apiToken: env.MEKO_API_KEY,
      datapackId: env.MEKO_DATAPACK_ID,
      endpointUrl: env.MEKO_ENDPOINT_URL,
      offlineOnly: false,
    });
    console.log('init', await meko.initialize(), meko.diagnostics());
    const search = await meko.searchKnowledgeBase('Relay 7', 'ses_dbg');
    console.log('kb', search.source, search.hits.length);
    const written = await meko.addNpcMemory(
      {
        content: 'Debug memory: Orin hides the optical jumper in booth four.',
        npcId: 'npc_orin',
        branchId: 'main',
        visibilityScope: 'CHARACTER_PRIVATE',
        confidence: 1,
      },
      'ses_dbg',
    );
    console.log('write', written, meko.diagnostics());
    const recalled = await meko.searchNpcMemories('npc_orin', 'main', 'optical jumper booth', 'ses_dbg');
    console.log('recall', recalled.length, JSON.stringify(recalled).slice(0, 1200));
    console.log('diag', meko.diagnostics());
  }, 60_000);
});
