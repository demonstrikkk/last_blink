import { MekoService, mekoConfigFromEnvironment } from './src/services/mekoService.ts';

const meko = new MekoService(mekoConfigFromEnvironment());
for (const query of ['Relay 7 eight minute window', 'ward protocol preservation hold', 'freight optical jumper bench book']) {
  const started = Date.now();
  const result = await meko.searchKnowledgeBase(query, 'ses_archive_check', 3);
  console.log(
    JSON.stringify({
      query,
      ms: Date.now() - started,
      source: result.source,
      hits: result.hits.map((hit) => hit.text.slice(0, 90)),
    }),
  );
}
