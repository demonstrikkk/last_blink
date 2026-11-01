/**
 * Seeds the curated Veyra archive into the configured Meko datapack.
 *
 * Run: npm run meko:seed
 *
 * The archive is advisory only. It never becomes a canonical game fact: ECHO
 * labels retrieved passages "ADVISORY: NOT CANONICAL" and the deterministic
 * engine keeps every ending, clue and clock value.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { MekoService, mekoConfigFromEnvironment } from '../src/services/mekoService.ts';

const POLL_ATTEMPTS = 20;
const POLL_DELAY_MS = 3_000;
const PENDING = new Set(['unknown', 'awaiting_upload', 'queued', 'pending', 'processing', 'indexing']);

async function waitForIngestion(
  meko: MekoService,
  key: string,
): Promise<string> {
  let status = 'unknown';
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    status = await meko.documentStatus(key);
    if (!PENDING.has(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
  }
  return status;
}

async function main(): Promise<void> {
  const config = mekoConfigFromEnvironment();
  if (config.offlineOnly) {
    throw new Error('MEKO_API_KEY and MEKO_DATAPACK_ID are required to seed the archive.');
  }

  const directory = fileURLToPath(new URL('../docs/archive', import.meta.url));
  const files = (await readdir(directory)).filter((file) => file.endsWith('.md')).sort();
  if (files.length === 0) throw new Error(`No archive documents found in ${directory}.`);

  const meko = new MekoService(config);
  const conversationId = await meko.ensureConversation('meko_archive_seed');
  const summary: Array<{ file: string; key: string; status: string; reused: boolean }> = [];

  for (const file of files) {
    const content = await readFile(join(directory, file));
    const receipt = await meko.ingestDocument({
      filename: file,
      content,
      contentHash: createHash('sha256').update(content).digest('hex'),
      conversationId,
    });
    const status = await waitForIngestion(meko, receipt.key);
    summary.push({
      file,
      key: receipt.key.slice(-12),
      status,
      reused: receipt.alreadyUploaded,
    });
    console.log(`${file} -> ${status}${receipt.alreadyUploaded ? ' (already uploaded)' : ''}`);
  }

  const failed = summary.filter((entry) => entry.status === 'failed' || entry.status === 'error');
  console.log(
    JSON.stringify(
      {
        datapack: config.datapackId,
        documents: summary.length,
        indexed: summary.filter((entry) => entry.status !== 'failed').length,
        failed: failed.length,
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(
    '[last-blink] Meko archive seed failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
