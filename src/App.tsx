import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  type ActionResult,
  type DeterministicGameSession,
  type GameEvent,
} from './engine/index.js';
import { createBrowserSession } from './session/runtime.js';
import { PhaserHost, type WorldStatus } from './game/PhaserHost.js';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function App() {
  const [session, setSession] = useState<DeterministicGameSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createBrowserSession()
      .then((created) => {
        if (!cancelled) setSession(created);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="boot boot-error">
        <p className="micro">ENGINE FAULT</p>
        <h1>Session could not start</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="boot">
        <p className="micro">SECOND SETTLEMENT</p>
        <h1>Initialising deterministic engine</h1>
        <p className="boot-line" role="status">
          Loading contracts, content and mock persistence…
        </p>
      </main>
    );
  }

  return <SessionConsole session={session} />;
}

function SessionConsole({ session }: { session: DeterministicGameSession }) {
  const subscribe = useCallback(
    (onChange: () => void) => session.subscribe(() => onChange()),
    [session],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );

  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const { state, hash } = snapshot;
  const currentBranch =
    state.branches.find((branch) => branch.branchId === state.branchId) ?? state.branches[0];
  const facts = Object.entries(state.facts).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const evidence = facts.filter(([key]) => key.startsWith('evidence.'));
  const latestAnchor = state.anchors.at(-1);
  const events = [...session.getRecentEvents(8)].reverse();

  const readStatus = useCallback((): WorldStatus => {
    const current = session.getSnapshot();
    const branch = current.state.branches.find(
      (candidate) => candidate.branchId === current.state.branchId,
    );
    return {
      tick: current.state.tick,
      stateVersion: current.state.stateVersion,
      hash: current.hash,
      branchLabel: branch?.label ?? 'unknown',
    };
  }, [session]);

  const run = (action: () => ActionResult) => {
    try {
      setLastResult(action());
      setSaveState('idle');
    } catch (cause) {
      setLastResult(null);
      setSaveState('error');
      console.error('[last-blink] action failed', cause);
    }
  };

  const scan = () => {
    const counter = state.facts['debug.counter']?.value;
    const next = typeof counter === 'number' ? counter + 1 : 1;
    run(() =>
      session.dispatch({
        actionType: 'fact.assert',
        actorId: 'player_local',
        params: { key: 'debug.counter', value: next, sourceRef: 'ui.scan' },
      }),
    );
  };

  const save = async () => {
    setSaveState('saving');
    try {
      await session.save();
      setSaveState('saved');
    } catch (cause) {
      console.error('[last-blink] save failed', cause);
      setSaveState('error');
    }
  };

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <p className="micro">THE LAST BLINK / SECOND SETTLEMENT</p>
          <h1>Engineering foundation</h1>
          <p className="lede">
            The engine is authoritative. This build proves contracts, determinism and ports — it has
            no map, movement or dialogue yet.
          </p>
        </div>
        <div className="engine-state">
          <span className="chip">
            <span className="dot" aria-hidden="true" />
            ENGINE ONLINE
          </span>
          <p className="micro mono">{state.sessionId}</p>
        </div>
      </header>

      <main className="console">
        <section className="panel panel-state" aria-labelledby="state-heading">
          <div className="panel-head">
            <h2 id="state-heading">Canonical state</h2>
            <span className="chip chip-quiet">v{state.stateVersion}</span>
          </div>

          <dl className="stats">
            <Stat label="Tick" value={String(state.tick).padStart(3, '0')} />
            <Stat label="Branch" value={currentBranch?.label ?? 'unknown'} />
            <Stat label="Facts" value={String(facts.length)} />
            <Stat label="Evidence" value={String(evidence.length)} />
            <Stat label="Anchors" value={String(state.anchors.length)} />
            <Stat label="Timelines" value={String(state.branches.length)} />
          </dl>

          <div className="hash-block">
            <p className="micro">STATE HASH</p>
            <p className="mono hash">{hash}</p>
            <p className="micro">LAST EVENT</p>
            <p className="mono hash">{state.lastEventId ?? 'none'}</p>
          </div>

          <div className="fact-list">
            <h3>Facts</h3>
            {facts.length === 0 ? (
              <p className="empty">No facts asserted.</p>
            ) : (
              <ul>
                {facts.map(([key, fact]) => (
                  <li key={key}>
                    <span className="mono fact-key">{key}</span>
                    <span className="mono fact-value">{JSON.stringify(fact.value)}</span>
                    <span className="fact-kind">{fact.kind}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel panel-world" aria-labelledby="world-heading">
          <div className="panel-head">
            <h2 id="world-heading">World layer</h2>
            <span className="chip chip-quiet">PHASER BOOT</span>
          </div>
          <PhaserHost readStatus={readStatus} />
          <p className="canvas-mirror mono">
            V1 · tick {state.tick} · state v{state.stateVersion} · branch {currentBranch?.label}
          </p>
          <p className="note">
            The canvas is decorative in Stage 3. Everything above is mirrored in text for assistive
            technology, and the canvas is hidden from the accessibility tree.
          </p>
        </section>

        <section className="panel panel-controls" aria-labelledby="controls-heading">
          <div className="panel-head">
            <h2 id="controls-heading">Session controls</h2>
            <span className="chip chip-quiet">MOCK PORTS</span>
          </div>

          <div className="button-row">
            <button type="button" onClick={() => run(() => session.advanceTick(1))}>
              Advance tick <span className="key">+1</span>
            </button>
            <button type="button" onClick={scan}>
              Assert scan <span className="key">debug</span>
            </button>
            <button
              type="button"
              onClick={() => run(() => session.recordAnchor(`Checkpoint ${state.tick}`))}
            >
              Record anchor
            </button>
            <button
              type="button"
              disabled={!latestAnchor}
              onClick={() => {
                if (!latestAnchor) return;
                run(() =>
                  session.forkBranch(latestAnchor.anchorId, `Timeline ${state.branches.length + 1}`),
                );
              }}
            >
              Fork timeline
            </button>
            <button type="button" onClick={() => void save()} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Saving…' : 'Save snapshot'}
            </button>
          </div>

          <p className="result" role="status" aria-live="polite">
            {lastResult
              ? `${lastResult.status.toUpperCase()} · ${lastResult.actionType} · ${
                  lastResult.rejection
                    ? lastResult.rejection.code
                    : `${lastResult.eventIds.length} event(s)`
                }`
              : 'No action dispatched yet.'}
          </p>
          <p className="save-line mono">
            {saveState === 'saved'
              ? 'SaveEnvelope written to InMemoryPersistence.'
              : saveState === 'error'
                ? 'Save failed — see console.'
                : 'Persistence is in-memory; refreshing resets the session.'}
          </p>

          <div className="anchors">
            <h3>Anchors</h3>
            {state.anchors.length === 0 ? (
              <p className="empty">None recorded. Anchors are immutable checkpoints.</p>
            ) : (
              <ul>
                {state.anchors.map((anchor) => (
                  <li key={anchor.anchorId}>
                    <span className="mono">{anchor.label}</span>
                    <span className="mono anchor-hash">{anchor.stateHash}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel panel-log" aria-labelledby="log-heading">
          <div className="panel-head">
            <h2 id="log-heading">Event log</h2>
            <span className="chip chip-quiet">NEWEST FIRST</span>
          </div>
          {events.length === 0 ? (
            <p className="empty">No events yet.</p>
          ) : (
            <ol className="event-list">
              {events.map((event) => (
                <EventRow key={event.eventId} event={event} />
              ))}
            </ol>
          )}
        </section>
      </main>

      <footer className="footer">
        <p className="micro">
          DETERMINISTIC CORE · ZOD BOUNDARIES · NO LLM · NO DATABASE · STAGE 3 GATE
        </p>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}

function EventRow({ event }: { event: GameEvent }) {
  return (
    <li>
      <span className="mono event-seq">{String(event.sequenceNo).padStart(3, '0')}</span>
      <span className="event-type">{event.type}</span>
      <span className="mono event-meta">
        t{event.tick} · {event.sourceId}
      </span>
    </li>
  );
}
