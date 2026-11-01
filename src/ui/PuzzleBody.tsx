import { useState } from 'react';
import type { GameState } from '../engine/index.js';
import type { WorldView } from '../world/worldView.js';
import type { WorldPuzzleId } from '../world/district.js';
import { puzzleArt } from './investigationArt.js';

export interface PuzzleBodyProps {
  readonly kind: WorldPuzzleId;
  readonly state: GameState;
  readonly view: WorldView;
  readonly onMakeCaseChoice: (nodeId: string, optionId: string) => void;
  readonly onCompleteChallenge: (params: {
    challengeId: string;
    challengeType: 'timeline_reconstruction' | 'contradiction_questioning';
    answer: { order: string[] } | { question: 'ask_route_seal' | 'declare_slip_definitive' };
  }) => void;
}

interface PuzzleMeta {
  readonly title: string;
  readonly location: string;
  readonly premise: string;
}

export const PUZZLE_META: Readonly<Record<WorldPuzzleId, PuzzleMeta>> = {
  signal: {
    title: 'Signal reconstruction',
    location: 'Nocturne Diner · north counter console',
    premise:
      'The guestbook margin names a ward drop frequency. The console will lock one channel and only one.',
  },
  timeline: {
    title: 'Timeline reconstruction',
    location: 'Ward dispatch board · depot apron',
    premise:
      'The dispatch slip, the Relay 7 hardware record and the vendor account disagree about order. Arrange what the record actually supports.',
  },
  contradiction: {
    title: 'Contradiction questioning',
    location: "Ivo's stall · east walk",
    premise:
      'Ivo says the route was sealed before the relay failed. The dispatch slip says otherwise. Test the contradiction instead of picking a winner.',
  },
  bomb: {
    title: 'Zeroing charge',
    location: 'Relay 7 basement',
    premise:
      'The depot schematic gives one safe cut sequence. A wrong order resets the attempt without spending the day.',
  },
};

const CUT_STEPS = [
  {
    id: 'isolate_carrier',
    label: 'Isolate the carrier',
    detail: 'Tune the console off 434.8 MHz so the charge cannot hear the trigger.',
  },
  {
    id: 'pull_optical_jumper',
    label: 'Pull the optical jumper',
    detail: 'Break the firing path in the West Alley conduit.',
  },
  {
    id: 'load_root_override',
    label: 'Load ROOT-BYPASS-008',
    detail: 'Close the relay against the zeroing token with the depot credential.',
  },
] as const;

const TIMELINE_SLOTS = [
  { id: 'before_reset', clock: '03:06', label: 'Carrier drift begins', hint: 'Before the clocks reset' },
  { id: 'at_reset', clock: '03:14', label: 'District clocks reset', hint: 'The shared reset moment' },
  { id: 'after_reset', clock: '03:22', label: 'Relay re-aligns', hint: 'After the clocks return' },
] as const;

/** Each card is timestamps from a record the player already holds. */
const TIMELINE_CARDS = [
  {
    id: 'relay_7_log',
    title: 'Relay 7 hardware log',
    stamp: 'drift logged 03:06',
    quote:
      '“EIGHT MINUTES UNACCOUNTED.” The relay drifts at 03:06 and keeps its own clock through the reset.',
    slot: 'before_reset',
    proof: 'the relay log opens before the reset and does not stop for it',
  },
  {
    id: 'ward_dispatch',
    title: 'Ward dispatch slip',
    stamp: 'stamped 03:14',
    quote: 'Handwritten, stamped 03:14, destination Relay 7. It is not in the electronic dispatch ledger.',
    slot: 'at_reset',
    proof: 'the slip is stamped at the exact reset minute',
  },
  {
    id: 'vendor_testimony',
    title: "Ivo's account",
    stamp: 'seen after the clocks returned',
    quote: '“The clocks came back. Then the runner left the desk, slip open in his hand.”',
    slot: 'after_reset',
    proof: 'Ivo places the departure after the clocks came back',
  },
] as const;

function collected(view: WorldView, evidenceId: string): boolean {
  return view.evidence.some((item) => item.evidenceId === evidenceId && item.collected);
}

/** Fair, plain-language requirement list for each puzzle. */
function lockedReasons(kind: WorldPuzzleId, view: WorldView): string[] {
  if (kind === 'signal') {
    return collected(view, 'clue_guestbook') ? [] : ['Diner guestbook (north counter)'];
  }
  if (kind === 'timeline') {
    return [
      ['relay_7_log', 'Relay 7 hardware log'],
      ['ward_dispatch', 'Ward dispatch slip'],
      ['vendor_testimony', 'Vendor testimony'],
    ]
      .filter(([id]) => !collected(view, id!))
      .map(([, label]) => label!);
  }
  if (kind === 'contradiction') {
    return [
      ['ward_dispatch', 'Ward dispatch slip'],
      ['vendor_testimony', 'Vendor testimony'],
    ]
      .filter(([id]) => !collected(view, id!))
      .map(([, label]) => label!);
  }
  if (view.attackPlan.disarmed) return [];
  const missing = [...view.attackPlan.missing];
  if (view.attackPlan.reconstructed && !view.attackPlan.disarmReady) {
    missing.push('ROOT-BYPASS-008 (depot override terminal)');
  }
  return missing;
}

export function PuzzleBody({
  kind,
  state,
  view,
  onMakeCaseChoice,
  onCompleteChallenge,
}: PuzzleBodyProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [signalAnswer, setSignalAnswer] = useState('');
  const [timelinePlacement, setTimelinePlacement] = useState<Record<string, string>>({});
  const [timelinePicked, setTimelinePicked] = useState<string | null>(null);
  const [draggedTimelineCard, setDraggedTimelineCard] = useState<string | null>(null);
  const [contradictionEvidence, setContradictionEvidence] = useState<string | null>(null);

  const meta = PUZZLE_META[kind];
  const locked = lockedReasons(kind, view);

  const signalChoice = state.choices.find((choice) => choice.nodeId === 'node.frequency.puzzle');
  const signalCompleted = Boolean(signalChoice);
  const signalTuned = signalChoice?.optionId === 'tune';
  const timelineCompleted = state.challengeResults.some(
    (result) => result.challengeId === 'challenge_timeline_relay7',
  );
  const contradictionCompleted = state.challengeResults.some(
    (result) => result.challengeId === 'challenge_dispatch_contradiction',
  );
  const bombChoice = state.choices.find((choice) => choice.nodeId === 'node.relay.disarm');
  const disarmed = view.attackPlan.disarmed;
  const disarmedDeclined = bombChoice?.optionId === 'hold';
  const cutReady = picked.length === CUT_STEPS.length;

  const placeTimelineCard = (cardId: string, slotId: string) => {
    setTimelinePlacement((current) => {
      const next = { ...current };
      for (const [existingCardId, existingSlotId] of Object.entries(next)) {
        if (existingSlotId === slotId) delete next[existingCardId];
      }
      next[cardId] = slotId;
      return next;
    });
    setTimelinePicked(null);
    setDraggedTimelineCard(null);
    setFeedback(null);
  };

  const chooseCut = (stepId: string) => {
    if (disarmed) return;
    if (picked.includes(stepId)) {
      setPicked((current) => current.filter((id) => id !== stepId));
      setFeedback(null);
      return;
    }
    const expected = CUT_STEPS[picked.length]?.id;
    if (stepId !== expected) {
      const correct = CUT_STEPS.find((step) => step.id === expected);
      setPicked([]);
      setFeedback(
        `That cut does not follow the schematic. Start again with ${correct?.label ?? 'the first isolation step'}.`,
      );
      return;
    }
    setPicked((current) => [...current, stepId]);
    setFeedback(null);
  };

  return (
    <div className={`puzzle-body puzzle-${kind}`}>
      <div className="puzzle-head">
        <img src={puzzleArt(kind)} alt="" width={56} height={56} loading="lazy" />
        <div>
          <p className="micro mono">PUZZLE · {meta.location}</p>
          <strong>{meta.title}</strong>
          <p>{meta.premise}</p>
        </div>
      </div>

      {kind === 'timeline' ? (
        <>
          {locked.length > 0 ? (
            <div className="puzzle-locked" role="status">
              <p>
                Some records are still missing. Arrange the records you have; the sequence can only
                be committed once every record is recovered. Find{' '}
                <strong>{locked.join(', ')}</strong>.
              </p>
              <p className="mono">LOCKED // {locked.join(' · ')}</p>
            </div>
          ) : null}
          {timelineCompleted ? (
            <p className="puzzle-success mono">
              ORDER RECORDED // sequence accepted; the eight-minute clock conflict remains open.
            </p>
          ) : (
            <>
              <p className="puzzle-hint">
                Read the three records and place each one on the clock. The slot is the minute the
                record itself describes — not the order you happened to find it in.
              </p>
              <ol className="timeline-rail">
                {TIMELINE_SLOTS.map((slot) => {
                  const placedId = Object.entries(timelinePlacement).find(
                    ([, slotId]) => slotId === slot.id,
                  )?.[0];
                  const placed = TIMELINE_CARDS.find((card) => card.id === placedId);
                  return (
                    <li key={slot.id} className={`timeline-slot${placed ? ' slot-filled' : ''}`}>
                      <div className="timeline-slot-head">
                        <span className="mono">{slot.clock}</span>
                        <strong>{slot.label}</strong>
                        <span className="micro mono">{slot.hint}</span>
                      </div>
                      {placed ? (
                        <button
                          type="button"
                          className="timeline-card card-placed"
                          onClick={() => {
                            setTimelinePlacement((current) => {
                              const next = { ...current };
                              delete next[placed.id];
                              return next;
                            });
                            setFeedback(null);
                          }}
                        >
                          <span className="card-title">{placed.title}</span>
                          <span className="card-stamp mono">{placed.stamp}</span>
                          <span className="micro mono">Click to return it to the pool</span>
                        </button>
                      ) : (
                        <div
                          className={`timeline-slot-target${draggedTimelineCard ? ' slot-drag-ready' : ''}`}
                          role="button"
                          tabIndex={timelinePicked === null ? -1 : 0}
                          aria-label={timelinePicked === null ? `${slot.label}: pick a record first` : `Place selected record at ${slot.label}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const cardId = event.dataTransfer.getData('text/plain') || draggedTimelineCard;
                            if (cardId) placeTimelineCard(cardId, slot.id);
                          }}
                          onClick={() => {
                            if (timelinePicked === null) return;
                            placeTimelineCard(timelinePicked, slot.id);
                          }}
                          onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && timelinePicked !== null) {
                              event.preventDefault();
                              placeTimelineCard(timelinePicked, slot.id);
                            }
                          }}
                        >
                          {timelinePicked === null
                            ? 'Pick a record below'
                            : `Place ${timelinePicked === 'ward_dispatch' ? 'the dispatch slip' : timelinePicked === 'relay_7_log' ? 'the relay log' : "Ivo's account"} here`}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="timeline-pool" role="group" aria-label="Records waiting to be placed">
                {TIMELINE_CARDS.filter((card) => timelinePlacement[card.id] === undefined).map(
                  (card) => {
                    const recovered = collected(view, card.id);
                    return (
                      <button
                        key={card.id}
                        type="button"
                        disabled={!recovered}
                        className={`timeline-card${timelinePicked === card.id ? ' card-picked' : ''}${recovered ? '' : ' card-locked'}`}
                        aria-pressed={timelinePicked === card.id}
                        onClick={() => {
                          if (recovered) setTimelinePicked(card.id);
                        }}
                        draggable={recovered}
                        onDragStart={(event) => {
                          if (!recovered) return;
                          event.dataTransfer.setData('text/plain', card.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggedTimelineCard(card.id);
                        }}
                        onDragEnd={() => setDraggedTimelineCard(null)}
                      >
                        <span className="card-title">{card.title}</span>
                        <span className="card-stamp mono">
                          {recovered ? card.stamp : 'RECORD NOT RECOVERED'}
                        </span>
                        <span className="card-quote">
                          {recovered
                            ? card.quote
                            : `Recover this record before placing it: ${card.title}.`}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>

              <button
                type="button"
                className="btn"
                disabled={
                  locked.length > 0 ||
                  Object.keys(timelinePlacement).length < TIMELINE_CARDS.length
                }
                onClick={() => {
                  if (locked.length > 0) {
                    setFeedback(
                      `The sequence cannot be committed yet. Recover ${locked.join(', ')} first.`,
                    );
                    return;
                  }
                  const wrong = TIMELINE_CARDS.find(
                    (card) => timelinePlacement[card.id] !== card.slot,
                  );
                  if (wrong) {
                    setFeedback(
                      `Not yet: ${wrong.title} sits in the wrong slot, because ${wrong.proof}.`,
                    );
                    return;
                  }
                  const order = TIMELINE_SLOTS.map(
                    (slot) =>
                      TIMELINE_CARDS.find((card) => timelinePlacement[card.id] === slot.id)?.id ?? '',
                  );
                  setFeedback(
                    'Order recorded: the relay log opens the window, the slip is stamped at the reset, and Ivo places the departure after the clocks return. This fixes sequence; it still does not name who altered the slip.',
                  );
                  onCompleteChallenge({
                    challengeId: 'challenge_timeline_relay7',
                    challengeType: 'timeline_reconstruction',
                    answer: { order },
                  });
                }}
              >
                {locked.length > 0
                  ? `Recover ${locked.length} record${locked.length === 1 ? '' : 's'} first`
                  : Object.keys(timelinePlacement).length < TIMELINE_CARDS.length
                    ? `Verify the order (${Object.keys(timelinePlacement).length}/${TIMELINE_CARDS.length})`
                    : 'Verify the order'}
              </button>
            </>
          )}
        </>
      ) : locked.length > 0 ? (
        <div className="puzzle-locked" role="status">
          <p>
            This console is dark until the record supports it. Find{' '}
            <strong>{locked.join(', ')}</strong>.
          </p>
          <p className="mono">LOCKED // {locked.join(' · ')}</p>
        </div>
      ) : kind === 'signal' ? (
        signalCompleted ? (
          <p className={`puzzle-success mono${signalTuned ? '' : ' puzzle-declined'}`}>
            {signalTuned
              ? 'CHANNEL LOCKED // 434.8 MHz · the depot locker now answers.'
              : 'CHANNEL LEFT DARK // the depot locker stays sealed on this timeline.'}
          </p>
        ) : (
          <>
            <div className="signal-console" role="group" aria-label="Frequency tuning console">
              <div className="signal-readout" aria-live="polite">
                <span className="micro mono">CARRIER</span>
                <strong>{signalAnswer || '---.-'} MHz</strong>
                <span className={signalAnswer === '434.8' ? 'signal-match' : undefined}>
                  {signalAnswer === '434.8' ? 'GUESTBOOK MATCH' : 'AWAITING TUNE'}
                </span>
              </div>
              <input
                className="signal-dial"
                aria-label="Tune carrier frequency"
                type="range"
                min="432"
                max="436"
                step="0.2"
                value={signalAnswer || '434'}
                onChange={(event) => setSignalAnswer(Number(event.currentTarget.value).toFixed(1))}
              />
              <div className="signal-scale mono"><span>432.0</span><span>434.0</span><span>434.8 MHz · guestbook mark</span><span>436.0</span></div>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (signalAnswer === '434.8') {
                  setFeedback(
                    'Correct: the guestbook fragment matches the console. This establishes the channel, not who issued the order.',
                  );
                  onMakeCaseChoice('node.frequency.puzzle', 'tune');
                } else {
                  setFeedback(
                    'Not established: compare the number in the guestbook again. The wrong frequency cannot identify the channel.',
                  );
                }
              }}
            >
              Lock the channel
            </button>
          </>
        )
      ) : kind === 'contradiction' ? (
        contradictionCompleted ? (
          <p className="puzzle-success mono">
            FOLLOW-UP RECORDED // the contradiction is tested, not resolved.
          </p>
        ) : (
          <div className="contradiction-console" role="group" aria-label="Cross-examine the dispatch claim">
            <p className="puzzle-hint">Pin the two conflicting records, then ask the question that tests the gap between them.</p>
            <div className="contradiction-records">
              <button type="button" className={`contradiction-record${contradictionEvidence === 'ward_dispatch' ? ' record-pinned' : ''}`} aria-pressed={contradictionEvidence === 'ward_dispatch'} onClick={() => setContradictionEvidence('ward_dispatch')}><span className="micro mono">RECORD A</span><strong>Ward dispatch slip</strong><span>Claims an authorised sealed route at 03:14.</span></button>
              <button type="button" className={`contradiction-record${contradictionEvidence === 'vendor_testimony' ? ' record-pinned' : ''}`} aria-pressed={contradictionEvidence === 'vendor_testimony'} onClick={() => setContradictionEvidence('vendor_testimony')}><span className="micro mono">RECORD B</span><strong>Ivo&apos;s account</strong><span>Places an unsealed runner after the clocks return.</span></button>
            </div>
            <div className="puzzle-choices">
            <button
              type="button"
              className="btn btn-quiet"
              disabled={contradictionEvidence === null}
              onClick={() => {
                setFeedback(
                  `Useful follow-up from ${contradictionEvidence === 'ward_dispatch' ? 'the dispatch claim' : 'Ivo’s account'}: ask who sealed the route and when. The testimony undermines the authorized-route claim, but does not establish who altered the slip.`,
                );
                onCompleteChallenge({
                  challengeId: 'challenge_dispatch_contradiction',
                  challengeType: 'contradiction_questioning',
                  answer: { question: 'ask_route_seal' },
                });
              }}
            >
              Ask who sealed the route
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() =>
                setFeedback(
                  'Weak inference: treating the dispatch slip as conclusive ignores the vendor testimony. Compare provenance before assigning blame.',
                )
              }
            >
              Declare the slip definitive
            </button>
            </div>
          </div>
        )
      ) : disarmed ? (
        <p className="puzzle-success mono">
          CHARGE INERT // carrier isolated · jumper pulled · ROOT-BYPASS-008 loaded
        </p>
      ) : disarmedDeclined ? (
        <p className="puzzle-hint">
          The charge was left armed on this timeline. BLINK or return at 08:00 and cut it.
        </p>
      ) : (
        <>
          <div className="brief-cut-grid">
            {CUT_STEPS.map((step) => {
              const order = picked.indexOf(step.id);
              return (
                <button
                  key={step.id}
                  type="button"
                  aria-pressed={order >= 0}
                  className={`btn btn-quiet puzzle-cut-btn${order >= 0 ? ' choice-active' : ''}`}
                  onClick={() => chooseCut(step.id)}
                >
                  <span className="mono">{order >= 0 ? `0${order + 1}` : '—'}</span>
                  <strong>{step.label}</strong>
                  <span>{step.detail}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="btn puzzle-confirm"
            disabled={!cutReady}
            onClick={() => {
              if (!cutReady) return;
              onMakeCaseChoice('node.relay.disarm', 'cut');
              setFeedback('Charge cut. The timeline is settled before 18:00.');
            }}
          >
            {cutReady ? 'Cut the charge' : `Cut sequence ${picked.length}/3`}
          </button>
        </>
      )}

      {feedback ? (
        <p className="challenge-feedback" role="status">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
