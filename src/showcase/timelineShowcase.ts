/**
 * Deterministic timeline showcase.
 *
 * Three complete "played" timelines are re-simulated through the real engine at
 * read time. Nothing here is a screenshot, a mock or a static paragraph: each
 * card is the result of dispatching the same canonical actions a player would
 * dispatch, then projecting the resulting branch through `deriveWorldView`.
 *
 * This is also a regression check for the content: if a route stops resolving,
 * its card reports the refused action instead of pretending it finished.
 */
import {
  CONTRACT_VERSION,
  DeterministicGameSession,
  FixedClock,
  InMemoryLogger,
  InMemoryPersistence,
  StaticContentPort,
  allowAllPolicy,
  type GameAction,
  type PlayerProfile,
  type SessionId,
} from '../engine/index.js';
import { STAGE5_CONTENT } from '../content/stage5Content.js';
import { deriveWorldView } from '../world/worldView.js';

export interface ShowcaseAction {
  readonly label: string;
  readonly action: GameAction;
}

export interface ShowcaseTimeline {
  readonly id: string;
  readonly name: string;
  readonly premise: string;
  readonly proves: string;
  readonly endingTitle: string;
  readonly endingSummary: string;
  readonly clockLabel: string;
  readonly tick: number;
  readonly evidence: readonly string[];
  readonly decisions: readonly string[];
  readonly challenges: readonly string[];
  readonly committed: boolean;
  readonly notes: readonly string[];
}

const PLAYER: PlayerProfile = {
  schemaVersion: CONTRACT_VERSION,
  playerId: 'ply_showcase' as PlayerProfile['playerId'],
  displayName: 'Aster Investigator',
  createdAt: '2026-01-01T00:00:00.000Z',
  consent: { telemetry: false, npcMemory: true },
  behaviouralSignals: { explorationStyle: 'thorough', decisionLatencyBand: 'measured' },
  progress: { choicesMade: 0, evidenceFound: 0, anchorsReached: 0 },
};

function collect(evidenceId: string, label: string): ShowcaseAction {
  return {
    label,
    action: {
      actionType: 'evidence.collect',
      actorId: 'player_local' as GameAction['actorId'],
      params: { evidenceId },
    },
  };
}

function choose(nodeId: string, optionId: string, label: string): ShowcaseAction {
  return {
    label,
    action: {
      actionType: 'choice.make',
      actorId: 'player_local' as GameAction['actorId'],
      params: { nodeId, optionId },
    },
  };
}

interface ShowcaseDefinition {
  readonly id: string;
  readonly name: string;
  readonly premise: string;
  readonly proves: string;
  readonly script: readonly ShowcaseAction[];
}

const TIMELINES: readonly ShowcaseDefinition[] = [
  {
    id: 'settlement',
    name: 'Timeline A · Second Settlement',
    premise:
      'Spend the day on the relay mechanism and the root key, then sever MORROW before the ward can file its own account.',
    proves:
      'The physical chain can end the day without a ward call. The ending is produced by the engine rules, not by the panel.',
    script: [
      collect('relay_7_log', 'Read the Relay 7 hardware log'),
      choose('node.sable.relay', 'share', 'Share the log with the ward'),
      collect('depot_terminal', 'Recover ROOT-BYPASS-008'),
      collect('plaza_terminal', 'Scan the plaza civic terminal'),
      collect('archive_record', 'Read the archive incident ledger'),
      choose('node.morrow.analysis', 'correlate', 'Correlate the MORROW mechanism'),
      collect('human_cost', 'Examine the held medical order'),
      collect('freight_log', 'Inspect the shipping manifest'),
      choose('node.morrow.terminate', 'terminate', 'Sever MORROW from the district relay'),
    ],
  },
  {
    id: 'inquiry',
    name: 'Timeline B · Ward Inquiry',
    premise:
      'File a truthful account and name the witness. The ward gets a case it cannot dismiss, and a witness it can find.',
    proves:
      'The same evidence can produce a slower institutional ending. Naming Ivo is a real cost, not a dialogue flavour.',
    script: [
      collect('relay_7_log', 'Read the Relay 7 hardware log'),
      choose('node.sable.relay', 'share', 'Share the log with the ward'),
      collect('ward_dispatch', 'Read the dispatch record'),
      collect('vendor_testimony', "Hear Ivo's account"),
      choose('node.vendor.silence', 'name', 'Name Ivo to the ward'),
      choose('node.ward.call', 'file', 'File the full account'),
    ],
  },
  {
    id: 'dawn',
    name: 'Timeline C · Disarmed Dawn',
    premise:
      'Tune the diner console, recover the depot key, reconstruct the zeroing device and cut it before 18:00.',
    proves:
      'The diner frequency console and the zeroing charge both commit canonical facts. A player can win the physical route and still leave the political question open.',
    script: [
      collect('clue_guestbook', 'Search the diner guestbook'),
      collect('clue_conduit', 'Inspect the optical jumper'),
      collect('clue_locker', 'Crack the enforcer locker'),
      collect('depot_terminal', 'Recover ROOT-BYPASS-008'),
      collect('archive_record', 'Read the archive incident ledger'),
      collect('zeroing_order', 'Read the sealed zeroing order'),
      collect('detonator_schematic', 'Recover the charge schematic'),
      choose('node.frequency.puzzle', 'tune', 'Lock the 434.8 MHz channel'),
      choose('node.relay.disarm', 'cut', 'Isolate, pull, override'),
    ],
  },
];

async function play(definition: ShowcaseDefinition): Promise<ShowcaseTimeline> {
  const session = await DeterministicGameSession.create(
    {
      sessionId: `ses_showcase_${definition.id}` as SessionId,
      player: PLAYER,
      seed: `showcase-${definition.id}`,
    },
    {
      clock: new FixedClock(),
      policy: allowAllPolicy,
      persistence: new InMemoryPersistence(),
      logger: new InMemoryLogger(),
      content: new StaticContentPort(STAGE5_CONTENT),
    },
  );

  const notes: string[] = [];
  let committed = true;
  for (const step of definition.script) {
    const result = session.dispatch(step.action);
    if (result.status !== 'accepted') {
      committed = false;
      notes.push(`Refused: ${step.label} (${result.status}).`);
    }
  }

  const state = session.getState();
  const view = deriveWorldView(state, STAGE5_CONTENT);
  const evidence = view.collectedEvidence.map((item) => item.label);
  const decisions = view.choices
    .filter((choice) => choice.resolvedOptionId !== null)
    .map((choice) => `${choice.prompt} → ${choice.resolvedOptionLabel}`);

  if (!view.ending) {
    committed = false;
    notes.push('This route did not resolve an ending inside the canonical day.');
  }

  return {
    id: definition.id,
    name: definition.name,
    premise: definition.premise,
    proves: definition.proves,
    endingTitle: view.ending?.title ?? 'No ending recorded',
    endingSummary: view.ending?.summary ?? 'The day ended without a settlement.',
    clockLabel: view.clock.label,
    tick: state.tick,
    evidence,
    decisions,
    challenges: view.challengeResults.map((result) => result.challengeType),
    committed,
    notes,
  };
}

let cache: Promise<readonly ShowcaseTimeline[]> | null = null;

/** Runs the three authored routes once per browser session. */
export function loadTimelineShowcase(): Promise<readonly ShowcaseTimeline[]> {
  cache ??= Promise.all(TIMELINES.map((definition) => play(definition)));
  return cache;
}
