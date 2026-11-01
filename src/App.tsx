import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  CITY_ROSTER,
  MorrowController,
  NpcCognitionController,
  buildMorrowPlan,
  createSystemClock,
  priorLoopsFromBranches,
  type ActionResult,
  type BranchId,
  type DeterministicGameSession,
  type GameEventId,
  type GameState,
  type MorrowModelPort,
  type PersistencePort,
} from './engine/index.js';
import { createBrowserSession, type BrowserSessionResult } from './session/runtime.js';
import { syncDurableSession, type CloudSyncOutcome } from './session/cloudRuntime.js';
import { STAGE5_CONTENT } from './content/stage5Content.js';
import { STAGE9_NPC_LIST } from './content/npcContent.js';
import {
  ANCHOR_LABEL,
  getDialogueScript,
  type DialogueScript,
} from './content/stage5Dialogue.js';
import { PhaserHost, type WorldHandle } from './game/PhaserHost.js';
import { ALL_WORLD_TARGETS, SPAWN, TILE, type WorldTarget, type WorldPuzzleId } from './world/district.js';
import { deriveWorldView } from './world/worldView.js';
import { buildPulseReadout } from './world/pulse.js';
import type { MoveInput } from './world/movement.js';
import { shapeTestimonyLine } from './world/testimony.js';
import { DialogueSheet, type DialoguePhase } from './ui/DialogueSheet.js';
import { CatastropheOverlay } from './ui/CatastropheOverlay.js';
import { CaseBrief } from './ui/CaseBrief.js';
import { PuzzleSheet } from './ui/PuzzleSheet.js';
import { Ledger, type SaveState } from './ui/Ledger.js';
import { BlinkPanel } from './ui/BlinkPanel.js';
import { EchoPanel } from './ui/EchoPanel.js';
import { NpcPanel } from './ui/NpcPanel.js';
import { TouchControls } from './ui/TouchControls.js';
import { HudTopBar } from './ui/hud/HudTopBar.js';
import { ObjectivesCard } from './ui/hud/ObjectivesCard.js';
import { MorrowCard } from './ui/hud/MorrowCard.js';
import { EchoCard } from './ui/hud/EchoCard.js';
import { BranchCard } from './ui/hud/BranchCard.js';
import { Minimap } from './ui/Minimap.js';
import { AiDiagnosticsPanel } from './ui/AiDiagnosticsPanel.js';

type DialogueState =
  | { phase: 'closed' }
  | { phase: 'lines'; scriptId: string; index: number }
  | { phase: 'choice'; scriptId: string }
  | { phase: 'blocked'; scriptId: string }
  | { phase: 'resolved'; scriptId: string };

const EMPTY_TOUCH: MoveInput = { up: false, down: false, left: false, right: false };

export function App() {
  const [sessionData, setSessionData] = useState<BrowserSessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createBrowserSession()
      .then((data) => {
        if (!cancelled) setSessionData(data);
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

  if (!sessionData) {
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

  return (
    <GameScreen
      session={sessionData.session}
      persistence={sessionData.persistence}
      initialRestored={sessionData.restoredFromSave}
    />
  );
}

type CloudState = 'idle' | 'syncing' | 'synced' | 'local' | 'error';

function GameScreen({
  session,
  persistence,
  initialRestored = false,
}: {
  session: DeterministicGameSession;
  persistence: PersistencePort;
  initialRestored?: boolean;
}) {
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
  const [presentedEvidenceId, setPresentedEvidenceId] = useState<string | null>(null);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [promptTargetId, setPromptTargetId] = useState<string | null>(null);
  const [playerTile, setPlayerTile] = useState({
    x: Math.floor(SPAWN.x / TILE),
    y: Math.floor(SPAWN.y / TILE),
  });
  const [worldReady, setWorldReady] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [puzzle, setPuzzle] = useState<WorldPuzzleId | null>(null);
  const [introOpen, setIntroOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('last_blink_intro_seen') !== '1';
    } catch {
      return true;
    }
  });
  const [blinkOpen, setBlinkOpen] = useState(false);
  const [echoOpen, setEchoOpen] = useState(false);
  const [npcOpen, setNpcOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [showObjectives, setShowObjectives] = useState(true);
  const [showMorrow, setShowMorrow] = useState(true);
  const [showBranch] = useState(true);
  const [morrowNotice, setMorrowNotice] = useState<string | null>(null);
  const [npcNotice, setNpcNotice] = useState<string | null>(null);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const [timeMode, setTimeMode] = useState<'day' | 'night'>(() => {
    try {
      return window.localStorage.getItem('last-blink-time-mode') === 'day' ? 'day' : 'night';
    } catch {
      return 'night';
    }
  });
  const [blinkGlitch, setBlinkGlitch] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(initialRestored ? 'restored' : 'idle');
  const [cloudState, setCloudState] = useState<CloudState>('idle');
  const [lastCloudAt, setLastCloudAt] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSaveId, setLastSaveId] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [touchActive, setTouchActive] = useState<Record<keyof MoveInput, boolean>>({ ...EMPTY_TOUCH });

  const viewRef = useRef(view);
  viewRef.current = view;
  const paused =
    dialogue.phase !== 'closed' ||
    introOpen ||
    blinkOpen ||
    echoOpen ||
    npcOpen ||
    ledgerOpen ||
    puzzle !== null ||
    view.catastrophe.status === 'occurred';
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const touchRef = useRef<MoveInput>(EMPTY_TOUCH);
  const worldRef = useRef<WorldHandle | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const cloudOfflineRef = useRef(false);
  const autoSaveVersionRef = useRef(state.stateVersion);

  const promptTarget = ALL_WORLD_TARGETS.find((target) => target.id === promptTargetId) ?? null;
  const activeScript: DialogueScript | null =
    dialogue.phase === 'closed'
      ? null
      : getDialogueScript(dialogue.scriptId, state, view);
  const activeNode = activeScript
    ? view.choices.find((node) => node.nodeId === activeScript.choiceNodeId) ?? null
    : null;
  const activeDialogueLine =
    dialogue.phase === 'lines' ? (activeScript?.lines[dialogue.index] ?? null) : null;
  const presentedLine = shapeTestimonyLine(
    activeDialogueLine,
    activeScript?.scriptId ?? '',
    state,
  );

  /**
   * MORROW opens every loop with a bounded plan. The engine is the authority on
   * the three-mind ceiling and the one-plan-per-loop rule; if a provider later
   * proposes something else, it still passes through this same dispatch.
   */
  useEffect(() => {
    const current = session.getState();
    if (
      current.morrowPlan !== null ||
      current.catastrophe.status !== 'pending' ||
      current.endingId !== null
    ) {
      return;
    }
    const collected = Object.values(current.facts)
      .filter((fact) => fact.key.startsWith('evidence.'))
      .map((fact) => fact.key.slice('evidence.'.length));
    const focus = [
      ...collected,
      'ward_dispatch',
      'relay_7_log',
      'vendor_testimony',
      'surveillance_frequency',
    ].filter((id, index, all) => all.indexOf(id) === index);
    const plan = buildMorrowPlan({
      sessionId: String(current.sessionId),
      branchId: String(current.branchId),
      loopIndex: current.loop.index,
      tick: current.tick,
      seed: `${current.sessionId}:${current.loop.index}`,
      roster: CITY_ROSTER,
      focus,
      collected,
      priorLoops: priorLoopsFromBranches(session.listBranches()),
    });
    session.dispatch({
      actionType: 'morrow.plan',
      actorId: 'system_morrow',
      params: { plan },
    });
  }, [
    session,
    state.loop.index,
    state.branchId,
    state.morrowPlan,
    state.catastrophe.status,
    state.endingId,
  ]);

  useEffect(() => {
    worldRef.current?.setMuted(muted);
  }, [muted, worldReady]);

  useEffect(() => {
    worldRef.current?.setTimeMode(timeMode);
    try {
      window.localStorage.setItem('last-blink-time-mode', timeMode);
    } catch {
      // Presentation preference is optional; gameplay remains canonical.
    }
  }, [timeMode, worldReady]);

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

  const morrow = useMemo(() => {
    let token: string | null = null;
    const apiBase = (import.meta.env.VITE_GAME_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';
    const model: MorrowModelPort = {
      async propose(observation) {
        if (!token) {
          const auth = await fetch(`${apiBase}/api/auth/anonymous`, { method: 'POST', body: '{}' });
          if (!auth.ok) throw new Error(`AI authentication failed (${auth.status})`);
          token = ((await auth.json()) as { token: string }).token;
        }
        const response = await fetch(`${apiBase}/api/ai/morrow`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ observation, requestId: `morrow_${observation.observationId}` }),
        });
        if (!response.ok) throw new Error(`MORROW provider bridge failed (${response.status})`);
        return (await response.json() as { proposal: Awaited<ReturnType<MorrowModelPort['propose']>> }).proposal;
      },
    };
    return new MorrowController(session, { clock: createSystemClock(), model });
  }, [session]);

  const runMorrow = useCallback(
    async (eventId?: GameEventId) => {
      const turn = await morrow.runAsync({ triggerEventId: eventId ?? null });
      if (!turn) return;
      worldRef.current?.playSfx('ui-error');
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
      try {
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
      } catch (cause) {
        console.warn(`[last-blink] NPC turn error for ${definition.displayName}:`, cause);
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
        void runMorrow(result.eventIds[result.eventIds.length - 1] as GameEventId | undefined);
        runNpcs();
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

  const updateCaseLink = useCallback((params: {
    linkId: string;
    leftEvidenceId: string;
    rightEvidenceId: string;
    relation: 'supports' | 'contradicts' | 'corroborates' | 'uncertain';
    note: string;
  }) => {
    const result = session.dispatch({ actionType: 'case.link', actorId: 'player_local', params });
    showToast(result.status === 'accepted' ? 'Case connection saved to this timeline.' : describeRejection(result));
  }, [session, showToast]);

  const updateHypothesis = useCallback((params: {
    hypothesisId: string;
    text: string;
    supportingEvidenceIds: string[];
    opposingEvidenceIds: string[];
  }) => {
    const result = session.dispatch({ actionType: 'case.hypothesis', actorId: 'player_local', params });
    showToast(result.status === 'accepted' ? 'Hypothesis revision saved to this timeline.' : describeRejection(result));
  }, [session, showToast]);

  const makeCaseChoice = useCallback((nodeId: string, optionId: string) => {
    const result = session.dispatch({ actionType: 'choice.make', actorId: 'player_local', params: { nodeId, optionId } });
    showToast(result.status === 'accepted' ? 'Challenge result committed to the canonical record.' : describeRejection(result));
  }, [session, showToast]);

  const completeChallenge = useCallback((params: {
    challengeId: string;
    challengeType: 'timeline_reconstruction' | 'contradiction_questioning';
    answer: { order: string[] } | { question: 'ask_route_seal' | 'declare_slip_definitive' };
  }) => {
    const result = session.dispatch({ actionType: 'challenge.complete', actorId: 'player_local', params });
    showToast(result.status === 'accepted' ? 'Validated challenge result recorded on this timeline.' : describeRejection(result));
  }, [session, showToast]);

  const resetDay = useCallback(() => {
    const result = session.resetLoop('Return to 08:00');
    if (result.status === 'accepted') {
      setDialogue({ phase: 'closed' });
      setChoiceIndex(0);
      setPresentedEvidenceId(null);
      worldRef.current?.triggerTimelineShift();
      showToast('Loop reset. The failed timeline is preserved; MORROW carries its lesson forward.');
    } else {
      showToast(describeRejection(result));
    }
  }, [session, showToast]);

  const openDialogue = useCallback(
    (scriptId: string) => {
      const script = getDialogueScript(scriptId, session.getState(), viewRef.current);
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
            void runMorrow(result.eventIds[result.eventIds.length - 1] as GameEventId | undefined);
            runNpcs();
            worldRef.current?.playSfx('evidence-found');
            showToast(`Testimony recorded: ${evidence.label}.`);
          } else {
            showToast(describeRejection(result));
          }
        }
      }

      setChoiceIndex(0);
      setPresentedEvidenceId(null);
      setDialogue({ phase: 'lines', scriptId, index: 0 });
      worldRef.current?.playSfx('ui-open');
    },
    [runMorrow, runNpcs, session, showToast],
  );

  const handleTarget = useCallback(
    (targetId: string) => {
      if (pausedRef.current) return;
      const target: WorldTarget | undefined = ALL_WORLD_TARGETS.find((item) => item.id === targetId);
      if (!target) return;

      if (target.kind === 'evidence') {
        collectEvidence(target.id);
        openDialogue(target.id);
      } else if (target.kind === 'anchor') {
        recordAnchor();
      } else if (target.kind === 'puzzle') {
        if (!target.puzzle) return;
        setPuzzle(target.puzzle);
        worldRef.current?.playSfx('ui-open');
      } else {
        openDialogue(target.id);
      }
    },
    [collectEvidence, openDialogue, recordAnchor],
  );

  const advanceDialogue = useCallback(() => {
    if (dialogue.phase !== 'lines') return;
    const script = getDialogueScript(dialogue.scriptId, session.getState(), viewRef.current);
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
  }, [dialogue, session]);

  const choose = useCallback(
    (optionId: string) => {
      if (dialogue.phase !== 'choice') return;
      const script = getDialogueScript(dialogue.scriptId, session.getState(), viewRef.current);
      if (!script) return;
      const result = session.dispatch({
        actionType: 'choice.make',
        actorId: 'player_local',
        params: { nodeId: script.choiceNodeId, optionId },
      });
      if (result.status === 'accepted') {
        void runMorrow(result.eventIds[result.eventIds.length - 1] as GameEventId | undefined);
        runNpcs();
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

  const closeIntro = useCallback(() => {
    setIntroOpen(false);
    try {
      window.localStorage.setItem('last_blink_intro_seen', '1');
    } catch {
      // Storage can be unavailable; the brief simply reappears next session.
    }
  }, []);

  const presentEvidence = useCallback((evidenceId: string) => {
    const evidence = viewRef.current.evidence.find((item) => item.evidenceId === evidenceId);
    if (!evidence?.collected) return;
    setPresentedEvidenceId(evidenceId);
    const scriptName = activeScript?.displayName ?? 'The witness';
    const response = scriptName === 'Ivo' && evidenceId === 'ward_dispatch'
      ? 'Ivo studies the slip, then points to the missing seal. “That is what the ward says. It is not what I saw.”'
      : scriptName === 'Sable' && evidenceId === 'relay_7_log'
        ? 'Sable leans over the hardware count. “Now you have a reading, not a rumor. Ask me about the eight minutes.”'
        : `${scriptName} acknowledges ${evidence.label}. The record is now part of the question, not proof of the conclusion.`;
    setNpcNotice(response);
  }, [activeScript]);

  const branches = session.listBranches();
  const loopSnapshots: readonly GameState[] = branches
    .map((branch) => session.getBranchState(branch.branchId))
    .filter((snapshot): snapshot is GameState => snapshot !== null);
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
      worldRef.current?.triggerBlinkWarp();
      setBlinkGlitch(true);
      window.setTimeout(() => setBlinkGlitch(false), 420);
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
      worldRef.current?.triggerTimelineShift();
      showToast(`Timeline switched. Canonical hash ${result.stateHash}.`);
    },
    [morrow, session, showToast],
  );

  const triggerPulse = useCallback(() => {
    const readout = buildPulseReadout(view, playerTile);
    worldRef.current?.triggerInvestigativePulse();
    showToast(readout.summary);
  }, [playerTile, showToast, view]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      worldRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const toggleQuality = useCallback(() => {
    setQuality((current) => {
      const next = current === 'high' ? 'low' : 'high';
      worldRef.current?.setQuality(next);
      showToast(`Atmosphere visual effects: ${next.toUpperCase()}`);
      return next;
    });
  }, [showToast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const onControl = Boolean(target?.closest('button, input, select, textarea'));

      if (event.key === 'Escape') {
        event.preventDefault();
        if (dialogue.phase !== 'closed') {
          setDialogue({ phase: 'closed' });
          return;
        }
        if (introOpen) {
          closeIntro();
          return;
        }
        if (puzzle !== null) {
          setPuzzle(null);
          return;
        }
        if (blinkOpen) {
          setBlinkOpen(false);
          return;
        }
        if (echoOpen) {
          setEchoOpen(false);
          return;
        }
        if (npcOpen) {
          setNpcOpen(false);
          return;
        }
        if (ledgerOpen) {
          setLedgerOpen(false);
          return;
        }
        return;
      }

      if (dialogue.phase !== 'closed') {
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
          const currentScript = getDialogueScript(scriptId, session.getState(), viewRef.current);
          const options = viewRef.current.choices.find(
            (candidate) => candidate.nodeId === currentScript?.choiceNodeId,
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
        return;
      }

      // Hotkeys when exploration is active
      if (
        !onControl &&
        !introOpen &&
        puzzle === null &&
        !blinkOpen &&
        !echoOpen &&
        !npcOpen &&
        !ledgerOpen
      ) {
        const k = event.key.toLowerCase();
        if (k === 'q') {
          event.preventDefault();
          triggerPulse();
        } else if (k === 'b') {
          event.preventDefault();
          setBlinkOpen(true);
        } else if (k === 'c') {
          event.preventDefault();
          setEchoOpen(true);
        } else if (k === 'l') {
          event.preventDefault();
          setLedgerOpen(true);
        } else if (k === 'n') {
          event.preventDefault();
          setNpcOpen(true);
        } else if (k === 'm') {
          event.preventDefault();
          toggleMute();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    advanceDialogue,
    blinkOpen,
    choiceIndex,
    choose,
    closeIntro,
    dialogue.phase,
    dialogue,
    echoOpen,
    introOpen,
    ledgerOpen,
    npcOpen,
    puzzle,
    toggleMute,
    triggerPulse,
  ]);

  const setTouch = useCallback((direction: keyof MoveInput, pressed: boolean) => {
    touchRef.current = { ...touchRef.current, [direction]: pressed };
    setTouchActive((current) => ({ ...current, [direction]: pressed }));
  }, []);

  const syncCloud = useCallback(async (): Promise<CloudSyncOutcome | null> => {
    setCloudState('syncing');
    const outcome = await syncDurableSession(persistence, session.getState().sessionId);
    if (outcome.status === 'synced' || outcome.status === 'pulled') {
      setCloudState('synced');
      setLastCloudAt(new Date().toLocaleTimeString());
      cloudOfflineRef.current = false;
    } else if (outcome.status === 'conflict' || outcome.status === 'error') {
      setCloudState('error');
      cloudOfflineRef.current = true;
    } else {
      setCloudState('local');
      cloudOfflineRef.current = true;
    }
    return outcome;
  }, [persistence, session]);

  useEffect(() => {
    if (state.stateVersion <= autoSaveVersionRef.current) return;
    autoSaveVersionRef.current = state.stateVersion;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await session.save();
        } catch (cause) {
          console.error('[last-blink] autosave failed', cause);
          return;
        }
        if (!cloudOfflineRef.current) await syncCloud();
      })();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [session, state.stateVersion, syncCloud]);

  const save = async () => {
    setSaveState('saving');
    setSaveErrorMessage(null);
    cloudOfflineRef.current = false;
    try {
      const envelope = await session.save();
      setSaveState('saved');
      setLastSavedAt(new Date(envelope.savedAt).toLocaleTimeString());
      setLastSaveId(envelope.saveId);
      showToast(
        `Saved to IndexedDB (${envelope.saveId}). Uploading this timeline to Yugabyte…`,
      );
      void syncCloud().then((cloud) => {
        if (!cloud) return;
        if (cloud.status === 'synced' || cloud.status === 'pulled') {
          showToast(
            `Cloud ${cloud.status === 'pulled' ? 'is ahead' : 'synced'} · ${cloud.message}`,
          );
        } else if (cloud.status === 'conflict' || cloud.status === 'error') {
          showToast(`Local save kept. Cloud did not accept it: ${cloud.message}`);
        } else {
          showToast(`Local save kept. ${cloud.message}`);
        }
      });
    } catch (cause) {
      console.error('[last-blink] save failed', cause);
      const msg = cause instanceof Error ? cause.message : String(cause);
      setSaveState('error');
      setSaveErrorMessage(msg);
      showToast(`Save failed: ${msg}`);
    }
  };

  const restart = () => {
    if (window.confirm('Restart and start a new session? Current saved progress will be reset.')) {
      indexedDB.deleteDatabase('the_last_blink_db');
      window.location.reload();
    }
  };

  return (
      <div className="game-shell">
      <div className={`game-theme game-theme-${timeMode}`} data-time-mode={timeMode}>
      <HudTopBar
        view={view}
        showObjectives={showObjectives}
        showMorrow={showMorrow}
        showEcho={echoOpen}
        showLedger={ledgerOpen}
        quality={quality}
        muted={muted}
        saveState={saveState}
        cloudState={cloudState}
        lastCloudAt={lastCloudAt}
        lastSavedAt={lastSavedAt}
        onToggleObjectives={() => setShowObjectives((v) => !v)}
        onToggleMorrow={() => setShowMorrow((v) => !v)}
        onToggleEcho={() => setEchoOpen(true)}
        onToggleLedger={() => setLedgerOpen((v) => !v)}
        onToggleQuality={toggleQuality}
        onToggleMute={toggleMute}
        onSave={() => void save()}
        onOpenBlink={() => setBlinkOpen(true)}
         onPulse={triggerPulse}
         timeMode={timeMode}
         onToggleTimeMode={() => setTimeMode((mode) => (mode === 'night' ? 'day' : 'night'))}
         onOpenDiagnostics={() => setDiagnosticsOpen(true)}
         onOpenBrief={() => setIntroOpen(true)}
       />

      <div className="game-viewport">
        <div className={`world-frame${blinkGlitch ? ' world-frame-blink-glitch' : ''}`}>
          <PhaserHost
            getView={() => viewRef.current}
            isPaused={() => pausedRef.current}
            getTouchInput={() => touchRef.current}
            onPrompt={setPromptTargetId}
            onInteract={handleTarget}
            onPlayerTile={(x, y) => setPlayerTile({ x, y })}
            onReady={() => setWorldReady(true)}
            worldRef={worldRef}
            quality={quality}
            timeMode={timeMode}
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

          {view.ending && dialogue.phase === 'closed' ? (
            <div className="ending-stage-banner" role="status">
              <p className="micro">INVESTIGATION CONCLUDED</p>
              <h2>{view.ending.title}</h2>
              <p>{view.ending.summary}</p>
              <div className="ending-stage-actions">
                <button type="button" className="btn btn-quiet" onClick={() => setBlinkOpen(true)}>
                  BLINK Timeline (Fork / Rewind)
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setEchoOpen(true)}>
                  ECHO Provenance
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setLedgerOpen(true)}>
                  Save to Ledger
                </button>
              </div>
            </div>
          ) : null}

          {toast ? (
            <p className="toast" role="status">
              {toast}
            </p>
          ) : null}

          {morrowNotice ? (
            <div className="morrow-callout-banner" role="alert">
              <div className="morrow-tape" aria-hidden="true" />
              <div className="morrow-content">
                <div className="morrow-badge">
                  <span className="morrow-icon" aria-hidden="true">▲</span>
                  <span className="micro morrow-tag">SURVEILLANCE DIRECTIVE // MORROW OVERSIGHT</span>
                </div>
                <p className="morrow-message">{morrowNotice}</p>
              </div>
            </div>
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
          onPulse={triggerPulse}
        />
      </div>

      {/* ---- Floating HUD Cards ---- */}
      {showObjectives ? <ObjectivesCard view={view} /> : null}

      {worldReady ? <Minimap playerTile={playerTile} view={view} /> : null}

      {showMorrow ? (
        <MorrowCard
          view={view}
          notice={morrowNotice}
          onTriggerReview={() => {
            void runMorrow();
            worldRef.current?.playSfx('ui-error');
          }}
        />
      ) : null}

      {worldReady ? <EchoCard view={view} onOpenEcho={() => setEchoOpen(true)} /> : null}

      {showBranch ? (
        <BranchCard
          view={view}
          totalBranches={branches.length}
          onOpenBlink={() => setBlinkOpen(true)}
        />
      ) : null}

      {/* ---- Dialogue overlay ---- */}
      {dialogue.phase !== 'closed' && activeScript ? (
        <DialogueSheet
          phase={dialogue.phase as DialoguePhase}
          script={activeScript}
          line={presentedLine}
          lineIndex={dialogue.phase === 'lines' ? dialogue.index : 0}
          lineCount={activeScript.lines.length}
          node={activeNode}
          view={view}
          choiceIndex={choiceIndex}
          onAdvance={advanceDialogue}
          onChoose={choose}
          onHighlight={setChoiceIndex}
          onClose={closeDialogue}
          presentedEvidenceId={presentedEvidenceId}
          onPresentEvidence={presentEvidence}
        />
      ) : null}

      {/* ---- Map-anchored puzzles ---- */}
      <PuzzleSheet
        open={puzzle !== null}
        puzzle={puzzle}
        onClose={() => setPuzzle(null)}
        state={state}
        view={view}
        context={
          puzzle
            ? getDialogueScript(
                puzzle === 'signal'
                  ? 'frequency_console'
                  : puzzle === 'timeline'
                    ? 'ward_dispatch'
                    : puzzle === 'contradiction'
                      ? 'ivo'
                      : 'relay_disarm',
                state,
                view,
              )
            : null
        }
        onMakeCaseChoice={makeCaseChoice}
        onCompleteChallenge={completeChallenge}
      />

      {/* ---- Intro / storyline brief ---- */}
      <CaseBrief open={introOpen} onClose={closeIntro} view={view} />

      {/* ---- 18:00 catastrophe ---- */}
      {view.catastrophe.status === 'occurred' && !echoOpen && !blinkOpen ? (
        <CatastropheOverlay
          view={view}
          onReset={resetDay}
          onOpenEcho={() => setEchoOpen(true)}
        />
      ) : null}

      {/* ---- Full-screen modal panels ---- */}
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
        view={view}
        hash={hash}
        events={session.getLineageEvents()}
        branches={branches}
        loopSnapshots={loopSnapshots}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        lastSaveId={lastSaveId}
        saveErrorMessage={saveErrorMessage}
        isDurable={true}
        onSave={() => void save()}
        onRestart={restart}
        onOpenEcho={() => {
          setLedgerOpen(false);
          setEchoOpen(true);
        }}
        onUpdateCaseLink={updateCaseLink}
        onUpdateHypothesis={updateHypothesis}
        onMakeCaseChoice={makeCaseChoice}
        onCompleteChallenge={completeChallenge}
      />

      <AiDiagnosticsPanel open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />

      {/* ---- Keyboard hints overlay ---- */}
      <div className="hud-keyhints mono" aria-hidden="true">
        WASD move · E interact · Q Pulse Scan · B BLINK · C ECHO · N NPCs · L Ledger · Esc close
      </div>
      </div>
    </div>
  );
}
