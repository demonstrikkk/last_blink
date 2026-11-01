import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MekoService, mekoConfigFromEnvironment, unwrapToolResult } from './src/services/mekoService.ts';

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

const text = 'probe document for the last blink archive. relay seven.';
const bytes = Buffer.from(text, 'utf8');
const result = unwrapToolResult(
  (
    await anyMeko.callTool('knowledgebase_upload_document', {
      filename: 'probe.md',
      size: bytes.length,
      content_hash: createHash('sha256').update(bytes).digest('hex'),
      content_head_base64: bytes.toString('base64'),
      conversation_id: conversationId,
      datapack_id: config.datapackId,
      agent_id: config.agentId,
    })
  ).payload,
) as Record<string, unknown>;

console.log('keys:', Object.keys(result).join(','));
const fields = result.fields as Record<string, string> | undefined;
console.log('field names:', fields ? Object.keys(fields).join(',') : '(none)');
console.log('url host:', typeof result.url === 'string' ? new URL(result.url).host : '(none)');
console.log('document key:', String(result.key ?? result.document_key ?? '(none)').slice(0, 80));
