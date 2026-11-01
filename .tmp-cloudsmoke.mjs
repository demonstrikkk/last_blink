/**
 * End-to-end cloud check against the real server + YugabyteDB:
 * anonymous auth -> create session -> commit one versioned event -> read it back.
 */
const base = 'http://127.0.0.1:8791';

const auth = await fetch(`${base}/api/auth/anonymous`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ displayName: 'cloud-smoke' }),
});
if (!auth.ok) throw new Error(`auth ${auth.status}: ${await auth.text()}`);
const { token, playerId } = await auth.json();

const sessionId = `ses_smoke_${Date.now().toString(36)}`;
const create = await fetch(`${base}/api/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ scenarioId: 'relay_street', sessionId }),
});
if (!create.ok) throw new Error(`create ${create.status}: ${await create.text()}`);

const commit = await fetch(`${base}/api/sessions/${sessionId}/events`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    branchId: 'main',
    eventId: 'evt_smoke0001',
    sequenceNo: 1,
    stateVersion: 1,
    expectedVersion: 0,
    eventType: 'evidence_collected',
    eventJson: { smoke: true },
    idempotencyKey: 'smoke-idempotency-0001',
    stateHash: 'hash-smoke-000000001',
    snapshotJson: { tick: 60, smoke: true },
  }),
});
if (!commit.ok) throw new Error(`commit ${commit.status}: ${await commit.text()}`);

const events = await fetch(`${base}/api/sessions/${sessionId}/events?branchId=main`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!events.ok) throw new Error(`events ${events.status}: ${await events.text()}`);
const payload = await events.json();

const diagnostics = await fetch(`${base}/api/diagnostics/model`, {
  headers: { authorization: `Bearer ${token}` },
});
const model = await diagnostics.json();

console.log(JSON.stringify({
  playerId,
  sessionId,
  events: payload.events.length,
  eventType: payload.events[0]?.eventType,
  providers: model.configured,
  requests: model.requests,
}, null, 2));
