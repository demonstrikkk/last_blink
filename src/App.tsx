import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { type ActionResult, type DeterministicGameSession } from './engine/index.js';
import { createBrowserSession } from './session/runtime.js';
import { STAGE4_CONTENT } from './content/stage4Content.js';
import { ANCHOR_LABEL, DISTRICT_TITLE, SABLE_DIALOGUE } from './content/stage4Dialogue.js';
import { PhaserHost, type WorldHandle } from './game/PhaserHost.js';
import { WORLD_TARGETS, type WorldTarget } from './world/district.js';
import { deriveWorldView } from './world/worldView.js';
import type { MoveInput } from './world/movement.js';
import { DialogueSheet, type DialoguePhase } from './ui/DialogueSheet.js';
import { FieldNotes } from './ui/FieldNotes.js';
import { Ledger, type SaveState } from './ui/Ledger.js';
import { TouchControls } from './ui/TouchControls.js';

type DialogueState =
  | { phase: 'closed' }
  | { phase: 'lines'; index: number }
  | { phase: 'choice' }
  | { phase: 'resolved' };

const EMPTY_TOUCH: MoveInput = { up: false, down: false, left: false, right: false };

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
        <h1>Opening Relay Street</h1>
        <p className="boot-line" role="status">
          Loading contracts, content and the Aster district…
        </p>
      </main>
    );
  }

  return <GameScreen session={session} />;
}

function GameScreen({ session }: { session: DeterministicGameSession }) {
  const subscribe = useCallback(
    (onChange: () => void) => session.subscribe(() => onChange()),
    [session],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );
  const { state, hash } = snapshot;
  const view = deriveWorldView(state, STAGE4_CONTENT);

  const [dialogue, setDialogue] = useState<DialogueState>({ phase: 'closed' });
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [promptTargetId, setPromptTargetId] = useState<string | null>(null);
  const [worldReady, setWorldReady] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [touchActive, setTouchActive] = useState<Record<keyof MoveInput, boolean>>({ ...EMPTY_TOUCH });

  const viewRef = useRef(view);
  viewRef.current = view;
  const pausedRef = useRef(false);
  pausedRef.current = dialogue.phase !== 'closed';
  const touchRef = useRef<MoveInput>(EMPTY_TOUCH);
  const worldRef = useRef<WorldHandle | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const promptTarget = WORLD_TARGETS.find((target) => target.id === promptTargetId) ?? null;
  const paused = dialogue.phase !== 'closed';

  useEffect(() => {
    worldRef.current?.setMuted(muted);
  }, [muted, worldReady]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = useCallback((text: string) => {
    setToast(text);
    setAnnouncement(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5200);
  }, []);

  const describeRejection = (result: ActionResult): string => {
    const code = result.rejection?.code ?? 'engine_error';
    if (code === 'duplicate') return 'Already recorded. The engine refused a second write.';
    if (code === 'unknown_target') return 'That is not something this street can act on.';
    return `Engine rejected the action (${code}).`;
  };

  const openDialogue = useCallback(() => {
    setChoiceIndex(0);
    setDialogue({ phase: 'lines', index: 0 });
    worldRef.current?.playSfx('ui-open');
  }, []);

  const collectEvidence = useCallback(() => {
    const result = session.dispatch({
      actionType: 'evidence.collect',
      actorId: 'player_local',
      params: { evidenceId: 'relay_7_log' },
    });
    if (result.status === 'accepted') {
      worldRef.current?.playSfx('evidence-found');
      showToast('Evidence logged: Relay 7 maintenance log. The relay kept counting.');
    } else {
      showToast(describeRejection(result));
    }
  }, [session, showToast]);

  const recordAnchor = useCallback(() => {
    const result = session.recordAnchor(ANCHOR_LABEL);
    if (result.status === 'accepted') {
      worldRef.current?.playSfx('anchor-set');
      showToast('Anchor recorded. Canonical state is checkpointed at this tick.');
    } else {
      showToast(describeRejection(result));
    }
  }, [session, showToast]);

  const handleTarget = useCallback(
    (targetId: string) => {
      if (pausedRef.current) return;
      const target: WorldTarget | undefined = WORLD_TARGETS.find((item) => item.id === targetId);
      if (!target) return;

      if (target.kind === 'npc') {
        openDialogue();
      } else if (target.kind === 'evidence') {
        collectEvidence();
      } else {
        recordAnchor();
      }
    },
    [collectEvidence, openDialogue, recordAnchor],
  );

  const advanceDialogue = useCallback(() => {
    if (dialogue.phase !== 'lines') return;
    if (dialogue.index + 1 < SABLE_DIALOGUE.lines.length) {
      setDialogue({ phase: 'lines', index: dialogue.index + 1 });
      return;
    }
    setChoiceIndex(0);
    setDialogue(viewRef.current.choiceResolved ? { phase: 'resolved' } : { phase: 'choice' });
  }, [dialogue]);

  const choose = useCallback(
    (optionId: string) => {
      if (dialogue.phase !== 'choice') return;
      const result = session.dispatch({
        actionType: 'choice.make',
        actorId: 'player_local',
        params: { nodeId: SABLE_DIALOGUE.choiceNodeId, optionId },
      });
      if (result.status === 'accepted') {
        setDialogue({ phase: 'resolved' });
        worldRef.current?.playSfx('choice-lock');
        showToast('Decision committed to canonical state. The ward alert has changed.');
      } else {
        showToast(describeRejection(result));
      }
    },
    [dialogue.phase, session, showToast],
  );

  const closeDialogue = useCallback(() => setDialogue({ phase: 'closed' }), []);

  useEffect(() => {
    if (dialogue.phase === 'closed') return;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const onControl = Boolean(target?.closest('button, input, select, textarea'));

      if (event.key === 'Escape') {
        event.preventDefault();
        setDialogue({ phase: 'closed' });
        return;
      }

      if (dialogue.phase === 'lines') {
        const interact = event.key.toLowerCase() === 'e';
        if (interact || (!onControl && (event.key === ' ' || event.key === 'Enter'))) {
          event.preventDefault();
          advanceDialogue();
        }
        return;
      }

      if (dialogue.phase === 'choice') {
        const options = viewRef.current.choice?.options ?? [];
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          setChoiceIndex((current) => (current + delta + options.length) % Math.max(1, options.length));
          return;
        }
        if (/^[1-9]$/.test(event.key)) {
          const option = options[Number(event.key) - 1];
          if (option) {
            event.preventDefault();
            choose(option.optionId);
          }
          return;
        }
        const interact = event.key.toLowerCase() === 'e';
        if (interact || (!onControl && (event.key === 'Enter' || event.key === ' '))) {
          event.preventDefault();
          const option = options[choiceIndex];
          if (option) choose(option.optionId);
        }
        return;
      }

      if (dialogue.phase === 'resolved') {
        const interact = event.key.toLowerCase() === 'e';
        if (interact || (!onControl && (event.key === 'Enter' || event.key === ' '))) {
          event.preventDefault();
          setDialogue({ phase: 'closed' });
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advanceDialogue, choiceIndex, choose, dialogue.phase]);

  const setTouch = useCallback((direction: keyof MoveInput, pressed: boolean) => {
    touchRef.current = { ...touchRef.current, [direction]: pressed };
    setTouchActive((current) => ({ ...current, [direction]: pressed }));
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    worldRef.current?.setMuted(next);
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

  const restart = () => {
    if (window.confirm('Restart the street? All in-memory progress is lost.')) {
      window.location.reload();
    }
  };

  const objective = view.choiceResolved
    ? view.anchors.length > 0
      ? 'The street remembers your decision. Keep walking, or open the ledger to inspect canonical state.'
      : 'Set an anchor at the cyan lamp post on the south walk to checkpoint the decision.'
    : view.relayReady
      ? 'Talk to Sable beside the relay terminal on the south walk.'
      : 'Read the Relay 7 terminal on the north kerb, then talk to Sable.';

  return (
    <div className="game-shell">
      <header className="topbar">
        <div className="brand">
          <p className="micro">THE LAST BLINK / SECOND SETTLEMENT</p>
          <h1>Relay Street</h1>
        </div>
        <div className="topbar-right">
          <span className="timeline-chip">
            <span className="timeline-shape" aria-hidden="true" />
            V1
          </span>
          <span className="mono curfew">CURFEW {view.curfew?.toUpperCase() ?? '—'}</span>
          <button
            type="button"
            className="icon-btn sound-btn"
            onClick={toggleMute}
            aria-pressed={muted}
          >
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <button type="button" className="btn btn-quiet ledger-btn" onClick={() => setLedgerOpen(true)}>
            Ledger
          </button>
        </div>
      </header>

      <main className="play-layout">
        <section className="stage" aria-label="Playable district">
          <div className="world-frame">
            <PhaserHost
              getView={() => viewRef.current}
              isPaused={() => pausedRef.current}
              getTouchInput={() => touchRef.current}
              onPrompt={setPromptTargetId}
              onInteract={handleTarget}
              onReady={() => setWorldReady(true)}
              worldRef={worldRef}
            />

            {!worldReady ? (
              <div className="world-loading" role="status">
                <p className="micro">ASTER / RELAY STREET</p>
                <p>Baking the district…</p>
              </div>
            ) : null}

            {worldReady && promptTarget && !paused ? (
              <button
                type="button"
                className="interact-prompt"
                onClick={() => handleTarget(promptTarget.id)}
              >
                <span className="prompt-dot" aria-hidden="true" />
                <span>{promptTarget.prompt}</span>
                <kbd>E</kbd>
              </button>
            ) : null}

            {toast ? (
              <p className="toast" role="status">
                {toast}
              </p>
            ) : null}

            <p className="sr-only" role="status" aria-live="polite">
              {announcement}
            </p>
          </div>

          <TouchControls
            active={touchActive}
            onPress={setTouch}
            onInteract={() => promptTarget && handleTarget(promptTarget.id)}
            interactDisabled={!promptTarget || paused}
          />

          <p className="world-caption mono">
            V1 · {DISTRICT_TITLE.toUpperCase()} · STATE v{state.stateVersion} · TICK {state.tick}
          </p>
        </section>

        <FieldNotes view={view} objective={objective} />
      </main>

      {dialogue.phase !== 'closed' ? (
        <DialogueSheet
          phase={dialogue.phase as DialoguePhase}
          line={dialogue.phase === 'lines' ? (SABLE_DIALOGUE.lines[dialogue.index] ?? null) : null}
          lineIndex={dialogue.phase === 'lines' ? dialogue.index : 0}
          lineCount={SABLE_DIALOGUE.lines.length}
          view={view}
          choiceIndex={choiceIndex}
          onAdvance={advanceDialogue}
          onChoose={choose}
          onHighlight={setChoiceIndex}
          onClose={closeDialogue}
        />
      ) : null}

      <Ledger
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        state={state}
        hash={hash}
        events={session.getRecentEvents(20)}
        saveState={saveState}
        onSave={() => void save()}
        onRestart={restart}
      />

      <footer className="statusbar">
        <p className="mono">
          Arrow keys / WASD move · E or Space interact · 1 / 2 choose · Esc close
        </p>
        <p className="mono memory-note">
          In-memory session — refreshing restarts the street. No persistent save in Stage 4.
        </p>
      </footer>
    </div>
  );
}
