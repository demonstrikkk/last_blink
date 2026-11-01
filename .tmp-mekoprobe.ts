import { readFileSync } from 'node:fs';
import { MekoService, mekoConfigFromEnvironment } from './src/services/mekoService.ts';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const meko = new MekoService(mekoConfigFromEnvironment(env));
const anyMeko = meko as unknown as {
  initialize: () => Promise<boolean>;
  ensureConversation: (id: string) => Promise<string>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ payload: unknown }>;
};
await anyMeko.initialize();
const conversationId = await anyMeko.ensureConversation('ses_smoke_mvxajivj');

const search = await anyMeko.callTool('knowledgebase_search', {
  query: 'relay',
  conversation_id: conversationId,
  datapack_id: mekoConfigFromEnvironment(env).datapackId,
  agent_id: mekoConfigFromEnvironment(env).agentId,
  limit: 3,
});
console.log('search raw:', JSON.stringify(search.payload).slice(0, 1500));

const list = await anyMeko.callTool('datapack_list', { conversation_id: conversationId, limit: 10 });
console.log('datapack_list raw:', JSON.stringify(list.payload).slice(0, 1500));
