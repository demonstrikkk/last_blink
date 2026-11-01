import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerConfig } from './config.ts';
import { createYugabyteRepository } from './yugabyteRepository.ts';
import { YugabyteGameRepository } from './yugabyteRepository.ts';

async function main(): Promise<void> {
  const config = loadServerConfig();
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required. Refusing to run migrations without a database.');
  }
  const repository = await createYugabyteRepository(config);
  if (!(repository instanceof YugabyteGameRepository)) {
    throw new Error('Migrations require the YugabyteDB repository.');
  }
  try {
    const migrationsDir = fileURLToPath(new URL('../../db/migrations', import.meta.url));
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

    await repository.withTransaction(async (client) => {
      await client.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           version TEXT PRIMARY KEY,
           applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      );
    });

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      await repository.withTransaction(async (client) => {
        const existing = await client.query(
          'SELECT version FROM schema_migrations WHERE version = $1',
          [version],
        );
        if (existing.rowCount) {
          console.log(`migration ${version} already applied`);
          return;
        }
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
        console.log(`migration ${version} applied`);
      });
    }
  } finally {
    await repository.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    '[last-blink] migration failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
