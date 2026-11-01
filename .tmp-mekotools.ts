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
  rpc: (method: string, params: Record<string, unknown>) => Promise<{ payload: unknown }>;
};
await anyMeko.initialize();
const tools = await anyMeko.rpc('tools/list', {});
const payload = tools.payload as {
  result?: { tools?: Array<{ name: string; inputSchema?: unknown }> };
};
const list = payload.result?.tools ?? [];
for (const name of ['knowledgebase_upload_document', 'knowledgebase_document_status', 'knowledgebase_search']) {
  const tool = list.find((candidate) => candidate.name === name);
  console.log(name, JSON.stringify(tool?.inputSchema));
}
