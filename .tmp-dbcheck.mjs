import { readFileSync } from 'node:fs';
import pg from 'pg';

const sessionId = process.argv[2];
const ca = readFileSync(process.env.DATABASE_SSL_CA, 'utf8');
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { ca, rejectUnauthorized: true },
});
await client.connect();
const session = await client.query('select session_id, player_id from game_sessions where session_id = $1', [sessionId]);
const events = await client.query('select event_type, state_version from game_events where session_id = $1', [sessionId]);
const snapshot = await client.query('select state_hash from branch_snapshots where session_id = $1', [sessionId]);
console.log('session rows:', session.rowCount, session.rows[0] ? 'ok' : 'missing');
console.log('event rows:', events.rowCount, events.rows.map((row) => row.event_type).join(','));
console.log('snapshot rows:', snapshot.rowCount, snapshot.rows.map((row) => row.state_hash).join(','));
await client.end();
