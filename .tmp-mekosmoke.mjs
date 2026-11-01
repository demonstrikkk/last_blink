const base = 'http://127.0.0.1:8791';
const auth = await fetch(`${base}/api/auth/anonymous`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ displayName: 'meko-smoke' }),
});
const { token } = await auth.json();
const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

const context = await fetch(`${base}/api/context/meko`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    sessionId: 'ses_smoke_mvxajivj',
    branchId: 'main',
    query: 'relay seven maintenance log second settlement',
    npcId: 'npc_orin',
  }),
});
const body = await context.json();
const diag = await (await fetch(`${base}/api/diagnostics/meko`, { headers })).json();

console.log(JSON.stringify({
  status: context.status,
  source: body.source,
  advisory: body.advisory,
  canonical: body.canonical,
  hits: Array.isArray(body.hits) ? body.hits.length : null,
  memories: Array.isArray(body.memories) ? body.memories.length : null,
  configured: diag.configured,
  online: diag.online,
  datapackId: Boolean(diag.datapackId),
}, null, 2));
