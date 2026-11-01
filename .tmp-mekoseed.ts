import { createHash } from 'node:crypto';
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

const config = mekoConfigFromEnvironment(env);
const meko = new MekoService(config);
const anyMeko = meko as unknown as {
  initialize: () => Promise<boolean>;
  ensureConversation: (id: string) => Promise<string>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ payload: unknown }>;
};
await anyMeko.initialize();
const conversationId = await anyMeko.ensureConversation('ses_seed_meko');

const text = `Veyra Civic Archive — Relay 7 incident digest.

Relay 7 recorded an unaligned eight-minute window during district cycle 03:14, while every other clock in Aster reset.

A dispatch runner left the ward desk at 03:14 for Relay 7. The slip was written by hand, not by the ward system.

Ward protocol 14-B authorises a preservation hold when a settlement cannot be attributed.

The Second Settlement is the scheduled re-attribution of Aster district after the outage.
`;

const bytes = Buffer.from(text, 'utf8');
const head = bytes.subarray(0, 3072);
const args = {
  filename: 'veyra-relay7-digest.md',
  size: bytes.length,
  content_hash: createHash('sha256').update(bytes).digest('hex'),
  content_head_base64: head.toString('base64'),
  conversation_id: conversationId,
  datapack_id: config.datapackId,
  agent_id: config.agentId,
};

const result = await anyMeko.callTool('knowledgebase_upload_document', args);
console.log('upload:', JSON.stringify(result.payload).slice(0, 1200));
