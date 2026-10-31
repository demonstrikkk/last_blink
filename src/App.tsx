import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  MorrowController,
  NpcCognitionController,
  createSystemClock,
  type ActionResult,
  type BranchId,
  type DeterministicGameSession,
  type GameEventId,
} from './engine/index.js';
import { createBrowserSession } from './session/runtime.js';
import { STAGE5_CONTENT } from './content/stage5Content.js';
import { STAGE9_NPC_LIST } from './content/npcContent.js';
import {
  ANCHOR_LABEL,
  DISTRICT_TITLE,
  STAGE5_DIALOGUE,
  type DialogueScript,
} from './content/stage5Dialogue.js';
import { PhaserHost, type WorldHandle } from './game/PhaserHost.js';
import { WORLD_TARGETS, type WorldTarget } from './world/district.js';
import { deriveWorldView } from './world/worldView.js';
import type { MoveInput } from './world/movement.js';
import { DialogueSheet, type DialoguePhase } from './ui/DialogueSheet.js';
import { FieldNotes } from './ui/FieldNotes.js';
import { Ledger, type SaveState } from './ui/Ledger.js';
import { BlinkPanel } from './ui/BlinkPanel.js';
import { EchoPanel } from './ui/EchoPanel.js';
import { NpcPanel } from './ui/NpcPanel.js';
import { TouchControls } from './ui/TouchControls.js';

type DialogueState =
  | { phase: 'closed' }
  | { phase: 'lines'; scriptId: string; index: number }
  | { phase: 'choice'; scriptId: string }
  | { phase: 'blocked'; scriptId: string }
  | { phase: 'resolved'; scriptId: string };

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
  const view = deriveWorldView(state, STAGE5_CONTENT);

  const [dialogue, setDialogue] = useState<DialogueState>({ phase: 'closed' });
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [promptTargetId, setPromptTargetId] = useState<string | null>(null);
  const [worldReady, setWorldReady] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [blinkOpen, setBlinkOpen] = useState(false);
  const [echoOpen, setEchoOpen] = useState(false);
  const [npcOpen, setNpcOpen] = useState(false);
  const [morrowNotice, setMorrowNotice] = useState<string | null>(null);
  const [npcNotice, setNpcNotice] = useState<string | null>(null);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
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
  const activeScript: DialogueScript | null =
    dialogue.phase === 'closed' ? null : STAGE5_DIALOGUE[dialogue.scriptId] ?? null;
  const activeNode = activeScript
    ? view.choices.find((node) => node.nodeId === activeScript.choiceNodeId) ?? null
    : null;

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

  const morrow = useMemo(
    () => new MorrowController(session, { clock: createSystemClock() }),
    [session],
  );

  const runMorrow = useCallback(
    (eventId?: GameEventId) => {
      const turn = morrow.run({ triggerEventId: eventId ?? null });
      if (!turn) return;
      if (turn.result.status === 'accepted') {
        setMorrowNotice(
          `MORROW ${turn.proposal.response.toUpperCase()} · ${turn.proposal.reasonCodes.join(', ')}.`,
        );
      } else {
        setMorrowNotice(
          `MORROW ${turn.proposal.response.toUpperCase()} · refused by the engine (${turn.result.rejection?.code ?? 'unknown'}).`,
        );
      }
    },
    [morrow],
  );

  const npc = useMemo(
    () => new NpcCognitionController(session, { clock: createSystemClock() }),
    [session],
  );

  const runNpcs = useCallback(() => {
    const lines: string[] = [];
    for (const definition of STAGE9_NPC_LIST) {
      const turn = npc.run(definition.npcId);
      if (!turn || !turn.proposal) continue;
      if (turn.result?.status === 'accepted') {
        lines.push(
          `${definition.displayName}: ${turn.proposal.rationale} (${turn.fallback ? 'fallback' : 'accepted'})`,
        );
      } else {
        lines.push(
          `${definition.displayName}: proposal refused (${turn.result?.rejection?.code ?? 'unknown'}).`,
        );
      }
    }
    if (lines.length > 0) setNpcNotice(lines.join(' '));
  }, [npc]);

  const describeRejection = (result: ActionResult): string => {
    const code = result.rejection?.code ?? 'engine_error';
    if (code === 'duplicate') return 'Already recorded. The engine refused a second write.';
    if (code === 'unknown_target') return 'That is not something this street can act on.';
    if (code === 'invalid_action') return 'The engine refused: a prerequisite is not met.';
    return `Engine rejected the action (${code}).`;
  };

  const collectEvidence = useCallback(
    (evidenceId: string) => {
      const label = viewRef.current.evidence.find((item) => item.evidenceId === evidenceId)?.label;
      const result = session.dispatch({
        actionType: 'evidence.collect',
        actorId: 'player_local',
        params: { evidenceId },
      });
      if (result.status === 'accepted') {
        runMorrow(result.eventIds[result.eventIds.length - 1] as GameEventId | undefined);
        worldRef.current?.playSfx('evidence-found');
        showToast(`Evidence logged: ${label ?? evidenceId}.`);
      } else {
        showToast(describeRejection(result));
      }
    },
    [runMorrow, runNpcs, session, showToast],
  );

  const recordAnchor = useCallback(() => {
    const result = session.recordAnchor(ANCHOR_LABEL);
    if (result.status === 'accepted') {
      worldRef.current?.playSfx('anchor-set');
      showToast('Anchor recorded. Canonical state is checkpointed at this tick.');
    } else {
      showToast(describeRejection(result));
    }
  }, [session, showToast]);

  const openDialogue = useCallback(
    (scriptId: string) => {
      const script = STAGE5_DIALOGUE[scriptId];
      if (!script) return;

      if (script.grantsEvidenceId) {
        const evidence = viewRef.current.evidence.find(
          (item) => item.evidenceId === script.grantsEvidenceId,
        );
        if (evidence?.available) {
          const result = session.dispatch({
            actionType: 'evidence.collect',
            actorId: 'player_local',
            params: { evidenceId: script.grantsEvidenceId },
          });
          if (result.status === 'accepted') {
            runMorrow(result.eventIds[result.eventIds.length - 1] as GameEventId | undefined);
            worldRef.current?.playSfx('evidence-found');
            showToast(`Testimony recorded: ${evidence.label}.`);
          } else {
            showToast(describeRejection(result));
          }
        }
      }

      setChoiceIndex(0);
      setDialogue({ phase: 'lines', scriptId, index: 0 });
      worldRef.current?.playSfx('ui-open');
    },
    [runMorrow, runNpcs, session, showToast],
  );

  const handleTarget = useCallback(
    (targetId: string) => {
      if (pausedRef.current) return;
      const target: WorldTarget | undefined = WORLD_TARGETS.find((item) => item.id === targetId);
      if (!target) return;

      if (target.kind === 'evidence') {
        collectEvidence(target.id);
      } else if (target.kind === 'anchor') {
        recordAnchor();
      } else {
        openDialogue(target.id);
      }
    },
    [collectEvidence, openDialogue, recordAnchor],
  );

  const advanceDialogue = useCallback(() => {
    if (dialogue.phase !== 'lines') return;
    const script = STAGE5_DIALOGUE[dialogue.scriptId];
    if (!script) return;
    if (dialogue.index + 1 < script.lines.length) {
      setDialogue({ phase: 'lines', scriptId: dialogue.scriptId, index: dialogue.index + 1 });
      return;
    }
    const node = viewRef.current.choices.find(
      (candidate) => candidate.nodeId === script.choiceNodeId,
    );
    setChoiceIndex(0);
    if (!node) {
      setDialogue({ phase: 'blocked', scriptId: dialogue.scriptId });
    } else if (node.resolvedOptionId !== null) {
      setDialogue({ phase: 'resolved', scriptId: dialogue.scriptId });
    } else if (node.available) {
      setDialogue({ phase: 'choice', scriptId: dialogue.scriptId });
    } else {
      setDialogue({ phase: 'blocked', scriptId: dialogue.scriptId });
    }
  }, [dialogue]);

  const choose = useCallback(
    (optionId: string) => {
      if (dialogue.phase !== 'choice') return;
      const script = STAGE5_DIALOGUE[dialogue.scriptId];
      if (!script) return;
      const result = session.dispatch({
        actionType: 'choice.make',
        actorId: 'player_local',
        params: { nodeId: script.choiceNodeId, optionId },
      });
      if (result.status === 'accepted') {
        runMorrow(result.eventIds[result.eventIds.length - 1] as GameEventId | undefined);
        setDialogue({ phase: 'resolved', scriptId: dialogue.scriptId });
        const fresh = deriveWorldView(session.getState(), STAGE5_CONTENT);
        if (fresh.ending) {
          worldRef.current?.playSfx('ending-sting');
          showToast(`Ending reached: ${fresh.ending.title}.`);
        } else {
          worldRef.current?.playSfx('choice-lock');
          showToast('Decision committed to canonical state. The street has answered.');
        }
      } else {
        showToast(describeRejection(result));
      }
    },
    [dialogue, runMorrow, runNpcs, session, showToast],
  );

  const closeDialogue = useCallback(() => setDialogue({ phase: 'closed' }), []);

  const branches = session.listBranches();
  const comparison =
    compareTargetId && compareTargetId !== state.branchId
      ? session.compareBranches(state.branchId, compareTargetId as BranchId)
      : null;

  const forkFromAnchor = useCallback(
    (anchorId: string) => {
      const anchor = viewRef.current.anchors.find((item) => item.anchorId === anchorId);
      const label = `Blink ${new Date().toISOString().slice(11, 19)}`;
      const fork = session.forkTimeline(anchorId, label);
      if (fork.result.status !== 'accepted' || !fork.branchId) {
        showToast(describeRejection(fork.result));
        return;
      }
      const switched = session.switchBranch(fork.branchId);
      if (switched.status !== 'switched') {
        showToast(switched.message ?? 'The new timeline could not be activated.');
        return;
      }
      setCompareTargetId(fork.branchId);
      morrow.reset(fork.branchId);
      setMorrowNotice(null);
      worldRef.current?.playSfx('blink');
      showToast(
        `BLINK complete. New timeline active from ${anchor?.label ?? 'the checkpoint'}. V1 is preserved.`,
      );
    },
    [morrow, session, showToast],
  );

  const switchBranch = useCallback(
    (branchId: string) => {
      const result = session.switchBranch(branchId as BranchId);
      if (result.status !== 'switched') {
        showToast(result.message ?? 'Timeline switch refused.');
        return;
      }
      setCompareTargetId(null);
      morrow.reset(branchId as BranchId);
      setMorrowNotice(null);
      worldRef.current?.playSfx('timeline-shift');
      showToast(`Timeline switched. Canonical hash ${result.stateHash}.`);
    },
    [morrow, session, showToast],
  );

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
        const scriptId = dialogue.scriptId;
        const options = viewRef.current.choices.find(
          (candidate) => candidate.nodeId === STAGE5_DIALOGUE[scriptId]?.choiceNodeId,
        )?.options ?? [];
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

      if (dialogue.phase === 'resolved' || dialogue.phase === 'blocked') {
        const interact = event.key.toLowerCase() === 'e';
        if (interact || (!onControl && (event.key === 'Enter' || event.key === ' '))) {
          event.preventDefault();
          setDialogue({ phase: 'closed' });
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advanceDialogue, choiceIndex, choose, dialogue.phase, dialogue]);

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

  const objective = view.ending
    ? `The account is closed: ${view.ending.title}.`
    : view.currentObjective
      ? `${view.currentObjective.label} — ${view.currentObjective.detail}`
      : 'The record is complete. Set an anchor or open the ledger to inspect canonical state.';

  return (
    <div className="game-shell">
      <header className="topbar">
        <div className="brand">
          <p className="micro">THE LAST BLINK / SECOND SETTLEMENT</p>
          <h1>Relay Street</h1>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="timeline-chip timeline-button"
            onClick={() => setBlinkOpen(true)}
            aria-label={`BLINK — open timeline control. Active timeline V${view.timeline.index + 1}.`}
          >
            <span className="timeline-shape" aria-hidden="true" />
            V{view.timeline.index + 1}
            <span className="timeline-count mono">/{view.timeline.total}</span>
          </button>
          <span className="mono curfew">CURFEW {view.curfew?.toUpperCase() ?? '—'}</span>
          <span className="mono phase-chip">PHASE {view.phase?.toUpperCase() ?? '—'}</span>
          <button
            type="button"
            className="icon-btn sound-btn"
            onClick={toggleMute}
            aria-pressed={muted}
          >
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <button type="button" className="btn btn-quiet blink-btn" onClick={() => setBlinkOpen(true)}>
            BLINK
          </button>
          <button type="button" className="btn btn-quiet echo-btn" onClick={() => setEchoOpen(true)}>
            ECHO
          </button>
          <button type="button" className="btn btn-quiet npc-btn" onClick={() => setNpcOpen(true)}>
            NPCs
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

            {morrowNotice ? (
              <p className="morrow-callout" role="status">
                <span className="micro">MORROW</span>
                <span>{morrowNotice}</span>
              </p>
            ) : null}

            {npcNotice ? (
              <p className="npc-callout" role="status">
                <span className="micro">NPC</span>
                <span>{npcNotice}</span>
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
            V{view.timeline.index + 1} · {DISTRICT_TITLE.toUpperCase()} · STATE v{state.stateVersion} ·
            TICK {state.tick} · {hash}
          </p>
        </section>

        <FieldNotes view={view} objective={objective} />
      </main>

      {dialogue.phase !== 'closed' && activeScript ? (
        <DialogueSheet
          phase={dialogue.phase as DialoguePhase}
          script={activeScript}
          line={dialogue.phase === 'lines' ? (activeScript.lines[dialogue.index] ?? null) : null}
          lineIndex={dialogue.phase === 'lines' ? dialogue.index : 0}
          lineCount={activeScript.lines.length}
          node={activeNode}
          view={view}
          choiceIndex={choiceIndex}
          onAdvance={advanceDialogue}
          onChoose={choose}
          onHighlight={setChoiceIndex}
          onClose={closeDialogue}
        />
      ) : null}

      <BlinkPanel
        open={blinkOpen}
        onClose={() => setBlinkOpen(false)}
        view={view}
        branches={branches}
        activeBranchId={state.branchId}
        comparison={comparison}
        compareTargetId={compareTargetId}
        onCompare={setCompareTargetId}
        onFork={forkFromAnchor}
        onSwitch={switchBranch}
      />

      <EchoPanel
        open={echoOpen}
        onClose={() => setEchoOpen(false)}
        session={session}
        content={STAGE5_CONTENT}
        branches={branches}
        activeBranchId={state.branchId}
      />

      <NpcPanel
        open={npcOpen}
        onClose={() => setNpcOpen(false)}
        controller={npc}
        definitions={STAGE9_NPC_LIST}
        activeBranchId={String(state.branchId)}
      />

      <Ledger
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        state={state}
        hash={hash}
        events={session.getLineageEvents()}
        branches={branches}
        saveState={saveState}
        onSave={() => void save()}
        onRestart={restart}
      />

      <footer className="statusbar">
        <p className="mono">
          Arrow keys / WASD move · E or Space interact · 1 / 2 choose · Esc close · BLINK forks a timeline
        </p>
        <p className="mono memory-note">
          In-memory session — refreshing restarts the street. Branch snapshots live in memory only.
        </p>
      </footer>
    </div>
  );
}

