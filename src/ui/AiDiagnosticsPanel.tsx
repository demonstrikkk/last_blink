import { useState } from 'react';

interface Diagnostics {
  readonly configured?: { readonly groq: boolean; readonly gemini: boolean };
  readonly gameplayCalls?: boolean;
  readonly note?: string;
  readonly requests?: number;
  readonly successes?: number;
  readonly failures?: number;
  readonly failureCategories?: Readonly<Record<string, number>>;
  readonly fallbacks?: number;
  readonly cacheHits?: number;
  readonly averageLatencyMs?: number;
}

interface MekoDiagnostics {
  readonly configured?: boolean;
  readonly online?: boolean;
  readonly datapackId?: string | null;
  readonly conversationId?: string | null;
  readonly failures?: number;
  readonly lastError?: string | null;
  readonly note?: string;
}

export function AiDiagnosticsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [meko, setMeko] = useState<MekoDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const refresh = async () => {
    setError(null);
    try {
      const apiBase = (import.meta.env.VITE_GAME_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';
      const auth = await fetch(`${apiBase}/api/auth/anonymous`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'diagnostics' }),
      });
      if (!auth.ok) throw new Error(`Diagnostics authentication returned ${auth.status}`);
      const authBody = (await auth.json()) as { token?: string };
      if (!authBody.token) throw new Error('Diagnostics authentication returned no token');
      const headers = { authorization: `Bearer ${authBody.token}` };
      const [response, mekoResponse] = await Promise.all([
        fetch(`${apiBase}/api/diagnostics/model`, { headers }),
        fetch(`${apiBase}/api/diagnostics/meko`, { headers }),
      ]);
      if (!response.ok) throw new Error(`Diagnostics endpoint returned ${response.status}`);
      setData((await response.json()) as Diagnostics);
      setMeko(mekoResponse.ok ? ((await mekoResponse.json()) as MekoDiagnostics) : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="echo-layer">
      <button type="button" className="ledger-backdrop" aria-label="Close AI diagnostics" onClick={onClose} />
      <aside className="echo-panel" role="dialog" aria-modal="true" aria-labelledby="ai-diagnostics-title">
        <header className="ledger-head">
          <div><p className="micro">DEVELOPER // AI RUNTIME</p><h2 id="ai-diagnostics-title">Provider diagnostics</h2></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close diagnostics">✕</button>
        </header>
        <p className="echo-intro">Configuration presence and request counters only. Secrets and prompts are never exposed.</p>
        <button type="button" className="btn echo-ask" onClick={() => void refresh()}>Read server diagnostics</button>
        {error ? <p className="echo-error mono">{error}</p> : null}
        {data ? (
          <dl className="diagnostics-grid">
            <div><dt>Groq configured</dt><dd>{data.configured?.groq ? 'YES' : 'NO'}</dd></div>
            <div><dt>Gemini configured</dt><dd>{data.configured?.gemini ? 'YES' : 'NO'}</dd></div>
            <div><dt>Gameplay calls</dt><dd>{data.gameplayCalls ? 'ACTIVE' : 'DETERMINISTIC'}</dd></div>
            <div><dt>Requests</dt><dd>{data.requests ?? 0}</dd></div>
            <div><dt>Successes</dt><dd>{data.successes ?? 0}</dd></div>
            <div><dt>Provider failures</dt><dd>{data.failures ?? 0}</dd></div>
            <div><dt>Failure classes</dt><dd>{Object.entries(data.failureCategories ?? {}).map(([key, count]) => `${key}: ${count}`).join(', ') || 'NONE'}</dd></div>
            <div><dt>Fallbacks</dt><dd>{data.fallbacks ?? 0}</dd></div>
            <div><dt>Cache hits</dt><dd>{data.cacheHits ?? 0}</dd></div>
            <div><dt>Average latency</dt><dd>{data.averageLatencyMs ?? 0} ms</dd></div>
          </dl>
        ) : <p className="echo-empty mono">No server diagnostic snapshot loaded.</p>}
        {meko ? (
          <dl className="diagnostics-grid">
            <div><dt>Meko configured</dt><dd>{meko.configured ? 'YES' : 'NO'}</dd></div>
            <div><dt>Meko online</dt><dd>{meko.online ? 'YES' : 'FALLBACK'}</dd></div>
            <div><dt>Datapack</dt><dd>{meko.datapackId ?? 'NONE'}</dd></div>
            <div><dt>Conversation</dt><dd>{meko.conversationId ?? 'NONE'}</dd></div>
            <div><dt>Meko failures</dt><dd>{meko.failures ?? 0}</dd></div>
            <div><dt>Last Meko error</dt><dd>{meko.lastError ?? 'NONE'}</dd></div>
          </dl>
        ) : (
          <p className="echo-empty mono">Meko diagnostics unavailable (server route not loaded).</p>
        )}
        {data?.note ? <p className="note-muted">{data.note}</p> : null}
        {meko?.note ? <p className="note-muted">{meko.note}</p> : null}
      </aside>
    </div>
  );
}
