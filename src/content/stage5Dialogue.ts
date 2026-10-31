import type { GameState } from '../engine/contracts/gameState.js';
import type { WorldView } from '../world/worldView.js';

/**
 * Stage 5 dialogue scripts. Dialogue is presentation data, not canonical state.
 * The only canon a script can change is the evidence it grants and the choice
 * node it opens, both dispatched through GameSession.
 *
 * A script can be opened even when its choice is gated. The player hears the
 * conversation, then `gate` explains what the engine still requires. This keeps
 * Sable's choice intentionally evidence-gated without hiding the character.
 */
export interface DialogueLine {
  readonly speaker: string;
  readonly text: string;
}

export interface DialogueScript {
  readonly scriptId: string;
  readonly displayName: string;
  readonly role: string;
  readonly choiceNodeId: string;
  /** Evidence collected when the script opens, if the engine allows it. */
  readonly grantsEvidenceId?: string;
  readonly lines: readonly DialogueLine[];
  /** Shown when the linked choice node's prerequisites are not met. */
  readonly gate: string;
  /** Context or why the character responded this way. */
  readonly contextNote?: string;
  readonly stanceNote?: string;
}

export const ANCHOR_LABEL = 'Lamp post — Relay Street';
export const DISTRICT_TITLE = 'Aster — Relay Street';

/**
 * Baseline static dialogue scripts used for initial state and static lookups.
 */
export const STAGE5_DIALOGUE: Readonly<Record<string, DialogueScript>> = {
  sable: {
    scriptId: 'sable',
    displayName: 'Sable',
    role: 'Relay mechanic, Aster ward',
    choiceNodeId: 'node.sable.relay',
    lines: [
      {
        speaker: 'Sable',
        text: 'You came through the east gate right after the blackout. Keep your voice down.',
      },
      {
        speaker: 'Sable',
        text: 'Every clock in Aster zeroed out at midnight, but I do not give statements to ward strangers.',
      },
      {
        speaker: 'Rin',
        text: 'The ward desk claimed the street grid was synchronized.',
      },
      {
        speaker: 'Sable',
        text: 'The ward says a lot of things. If you want to know what happened on Relay Street, check the Relay 7 terminal on the north curb yourself.',
      },
      {
        speaker: 'Sable',
        text: 'Read the hardware counter directly before someone clears the memory buffer.',
      },
    ],
    gate: 'Sable turns back to her circuit box. “Read the terminal yourself first. I am not discussing rumors with a stranger.”',
    contextNote: 'Initial caution: Sable refuses to speculate until you read the hardware counter.',
    stanceNote: 'Sable is guarded against unknown investigators.',
  },
  ivo: {
    scriptId: 'ivo',
    displayName: 'Ivo',
    role: 'Stallholder, south walk',
    choiceNodeId: 'node.vendor.silence',
    grantsEvidenceId: 'vendor_testimony',
    lines: [
      {
        speaker: 'Ivo',
        text: 'You are the one asking about the outage. Everyone else has been walking faster since midnight.',
      },
      {
        speaker: 'Rin',
        text: 'Did you see anything moving along the south walk during the blackout?',
      },
      {
        speaker: 'Ivo',
        text: 'I sell tea and dried fruit, investigator. I do not give sworn testimony to anyone without proof in hand.',
      },
      {
        speaker: 'Ivo',
        text: 'If you want me to risk talking about the ward runner, bring me the dispatch slip from the north board first.',
      },
      {
        speaker: 'Ivo',
        text: 'Because until I see what the ward officially claimed happened, my word is just an invitation to be arrested.',
      },
    ],
    gate: 'Ivo keeps his hands under the counter. “You heard about a dispatch? Bring me the slip before you ask me to talk on record.”',
    contextNote: 'Initial caution: Ivo withholds eyewitness claims until verified dispatch records are shown.',
    stanceNote: 'Ivo is wary of ward retribution.',
  },
  ward_call: {
    scriptId: 'ward_call',
    displayName: 'Ward call-box',
    role: 'Street line, east walk',
    choiceNodeId: 'node.ward.call',
    lines: [
      {
        speaker: 'Ward line',
        text: 'Aster ward desk. State your name, your location and what you are reporting.',
      },
      {
        speaker: 'Rin',
        text: 'Relay seven. Eight minutes unaccounted. A hand-written dispatch. One witness account.',
      },
      {
        speaker: 'Ward line',
        text: 'The desk can take the account, or the line can go quiet. It will not take half of it.',
      },
    ],
    gate: 'The line clicks open, then holds. The desk will not take a partial account. Decide what happens to the log and to Ivo first.',
    contextNote: 'Institutional protocol: requires complete causal findings before recording.',
    stanceNote: 'The ward desk insists on a complete filing or complete silence.',
  },
};

/**
 * Dynamically resolves character reactivity based on canonical facts,
 * prior decisions, branch lineage, and discovered evidence.
 */
export function getDialogueScript(
  scriptId: string,
  state: GameState,
  view: WorldView,
): DialogueScript {
  if (scriptId === 'sable') {
    return resolveSableDialogue(state, view);
  }
  if (scriptId === 'ivo') {
    return resolveIvoDialogue(state, view);
  }
  if (scriptId === 'ward_call') {
    return resolveWardCallDialogue(state, view);
  }
  if (scriptId === 'lyra') {
    return resolveLyraDialogue(state, view);
  }
  if (scriptId === 'vane') {
    return resolveVaneDialogue(state, view);
  }
  if (scriptId === 'castor') {
    return resolveCastorDialogue(state, view);
  }
  if (scriptId === 'plaza_terminal') {
    return resolvePlazaTerminalDialogue(state, view);
  }
  if (scriptId === 'freight_log') {
    return resolveFreightLogDialogue(state, view);
  }
  if (scriptId === 'relay_7_log') {
    return resolveRelay7Dialogue(state, view);
  }
  if (scriptId === 'ward_dispatch') {
    return resolveWardDispatchDialogue(state, view);
  }
  if (scriptId === 'clue_conduit') {
    return resolveClueConduitDialogue(state, view);
  }
  if (scriptId === 'clue_guestbook') {
    return resolveClueGuestbookDialogue(state, view);
  }
  if (scriptId === 'clue_locker') {
    return resolveClueLockerDialogue(state, view);
  }
  return STAGE5_DIALOGUE[scriptId] ?? STAGE5_DIALOGUE.sable!;
}

function resolveClueConduitDialogue(_state: GameState, _view: WorldView): DialogueScript {
  return {
    scriptId: 'clue_conduit',
    displayName: 'Gutter Conduit Wire',
    role: 'Drainage Grate, West Walk',
    choiceNodeId: 'node.sable.relay',
    lines: [
      {
        speaker: 'Rin',
        text: 'A high-speed optical jumper was spliced directly into the gutter conduit.',
      },
      {
        speaker: 'Rin',
        text: 'The copper sheath is still warm. It physically diverted telemetry from Relay 7 straight to the southern freight depot.',
      },
    ],
    gate: 'Physical bypass wire identified. Links Relay 7 tampering directly to the South Freight lines.',
    contextNote: 'Physical Evidence: Hardware tap discovered in street drainage.',
    stanceNote: 'Bypass splice logged.',
  };
}

function resolveClueGuestbookDialogue(_state: GameState, _view: WorldView): DialogueScript {
  return {
    scriptId: 'clue_guestbook',
    displayName: 'Nocturne Diner Counter',
    role: 'Diner Interior, East Plaza',
    choiceNodeId: 'node.sable.relay',
    lines: [
      {
        speaker: 'Rin',
        text: '[Inspecting customer order ledger under the counter lamp]',
      },
      {
        speaker: 'Rin',
        text: 'At 00:08, a patron paid with a Ward Courier transit voucher. The badge number belongs to Vane.',
      },
      {
        speaker: 'Rin',
        text: 'A handwritten note on the receipt: "Package intercepted. Drop frequency set to 434.8 MHz."',
      },
    ],
    gate: 'Frequency clue discovered: 434.8 MHz. Use this frequency to override MORROW surveillance.',
    contextNote: 'Decisive Clue: MORROW control frequency 434.8 MHz recovered.',
    stanceNote: 'Surveillance channel identified.',
  };
}

function resolveClueLockerDialogue(_state: GameState, _view: WorldView): DialogueScript {
  return {
    scriptId: 'clue_locker',
    displayName: 'Enforcer Locker',
    role: 'Depot Office Interior, South Yard',
    choiceNodeId: 'node.ward.call',
    lines: [
      {
        speaker: 'Rin',
        text: '[Locker door forced open. Security log chips scattered inside.]',
      },
      {
        speaker: 'Rin',
        text: 'Ward Enforcer lock code override: ROOT-BYPASS-008. Authorizes a total district-wide purge of MORROW surveillance subroutines.',
      },
      {
        speaker: 'Rin',
        text: 'With this root key, I can call the Ward desk and permanently terminate MORROW\'s automated grip on Aster.',
      },
    ],
    gate: 'Root override key acquired. Use the Ward Call-Box to defeat MORROW and conclude the investigation.',
    contextNote: 'Master Key: Ward root override code acquired.',
    stanceNote: 'MORROW defeat condition unlocked.',
  };
}

function resolveRelay7Dialogue(_state: GameState, _view: WorldView): DialogueScript {
  return {
    scriptId: 'relay_7_log',
    displayName: 'Relay 7 Terminal',
    role: 'Municipal Hardware Node, North Walk',
    choiceNodeId: 'node.sable.relay',
    lines: [
      {
        speaker: 'Relay 7 Terminal',
        text: '[RECOVERY BUFFER // LOCAL HARDWARE LOG 00:08:00 - 00:16:00]',
      },
      {
        speaker: 'Relay 7 Terminal',
        text: 'Signal continuity interrupted. Eight minutes missing from the physical memory core while peripheral ward clocks reset.',
      },
      {
        speaker: 'Relay 7 Terminal',
        text: 'Event correlation: A dispatch runner passed this terminal at 03:14, carrying manual bypass credentials.',
      },
      {
        speaker: 'Rin',
        text: 'Eight missing minutes. Not a power outage — a forced memory blackout on this exact circuit.',
      },
    ],
    gate: 'Relay 7 maintenance log recorded. Talk to Sable on the south pavement to discuss what happened.',
    contextNote: 'Physical Evidence: Eight-minute blackout window confirmed on local hardware.',
    stanceNote: 'Relay memory buffer inspected and verified.',
  };
}

function resolveWardDispatchDialogue(_state: GameState, _view: WorldView): DialogueScript {
  return {
    scriptId: 'ward_dispatch',
    displayName: 'Ward Dispatch Board',
    role: 'Official Notice Terminal, North Walk',
    choiceNodeId: 'node.ivo.account',
    lines: [
      {
        speaker: 'Dispatch Board',
        text: '[WARD DISPATCH RECORD // SLIP #440-B // TIMESTAMP 03:14]',
      },
      {
        speaker: 'Dispatch Board',
        text: 'Emergency transit permit logged by hand, bypassing the automated ward network. Destination: Relay 7.',
      },
      {
        speaker: 'Rin',
        text: 'Handwritten, not digital. Someone wanted a physical order on the street without leaving an audit trail in MORROW.',
      },
      {
        speaker: 'Dispatch Board',
        text: 'Witness note: Vendor Ivo at the nearby stall observed the dispatch runner depart.',
      },
    ],
    gate: 'Ward dispatch record inspected. Question Ivo at the fruit stall to corroborate the runner\'s description.',
    contextNote: 'Procedural Discrepancy: Manual dispatch slip bypasses automated ward system.',
    stanceNote: 'Dispatch slip catalogued.',
  };
}

function resolveSableDialogue(state: GameState, view: WorldView): DialogueScript {
  const hasRelay7 = state.facts['evidence.relay_7'] !== undefined;
  const relayChoice = state.facts['story.relay_choice']?.value as 'share' | 'conceal' | undefined;
  const isForkedBranch =
    view.timeline.parentLabel !== null ||
    view.timeline.forkedFromAnchorId !== null ||
    view.timeline.index > 0;

  // 1. Initial caution (before Relay 7 discovered)
  if (!hasRelay7) {
    return {
      scriptId: 'sable',
      displayName: 'Sable',
      role: 'Relay mechanic, Aster ward',
      choiceNodeId: 'node.sable.relay',
      lines: [
        {
          speaker: 'Sable',
          text: 'You came through the east gate right after the blackout. Keep your voice down.',
        },
        {
          speaker: 'Sable',
          text: 'Every clock in Aster zeroed out at midnight, but I do not give statements to ward strangers.',
        },
        {
          speaker: 'Rin',
          text: 'The ward desk claimed the street grid was synchronized.',
        },
        {
          speaker: 'Sable',
          text: 'The ward says a lot of things. If you want to know what happened on Relay Street, check the Relay 7 terminal on the north curb yourself.',
        },
        {
          speaker: 'Sable',
          text: 'Read the hardware counter directly before someone clears the memory buffer.',
        },
      ],
      gate: 'Sable turns back to her circuit box. “Read the terminal yourself first. I am not discussing rumors with a stranger.”',
      contextNote: 'Initial Caution: Sable refuses to discuss findings until you verify hardware evidence.',
      stanceNote: 'Sable is guarded. She does not trust unverified claims.',
    };
  }

  // 2. Evidence-dependent dialogue (Relay 7 discovered, decision pending)
  if (relayChoice === undefined) {
    return {
      scriptId: 'sable',
      displayName: 'Sable',
      role: 'Relay mechanic, Aster ward',
      choiceNodeId: 'node.sable.relay',
      lines: [
        {
          speaker: 'Sable',
          text: 'You found the hardware count on terminal seven. So you saw it with your own eyes.',
        },
        {
          speaker: 'Sable',
          text: 'Relay seven kept counting through it. Eight minutes. Every other clock in Aster reset to zero.',
        },
        {
          speaker: 'Sable',
          text: 'There is a dispatch slip on the north board. The runner left at 03:14, and the ward desk wrote it down by hand.',
        },
        {
          speaker: 'Rin',
          text: 'Then the relay is the only thing here that stayed awake — and someone wanted its eight minutes to stay quiet.',
        },
        {
          speaker: 'Sable',
          text: 'The ward will call it a fault and bury it. If you keep the log, we both carry what it says.',
        },
      ],
      gate: 'Sable folds the printout away. “Read the terminal yourself first. I am not deciding for you.”',
      contextNote: 'Evidence Verified: Relay 7 log in hand. Sable offers her assessment and poses the decision.',
      stanceNote: 'Sable is attentive. She acknowledges you hold the verified count.',
    };
  }

  // 3. Branch-specific response after BLINK
  if (isForkedBranch) {
    if (relayChoice === 'share') {
      return {
        scriptId: 'sable',
        displayName: 'Sable',
        role: 'Relay mechanic, Aster ward',
        choiceNodeId: 'node.sable.relay',
        lines: [
          {
            speaker: 'Sable',
            text: 'Aster... hold on. You look at me like you have already walked this street tonight.',
          },
          {
            speaker: 'Sable',
            text: 'The air has that sharp ozone smell after a circuit breaker trips twice. Did you... repeat this hour?',
          },
          {
            speaker: 'Sable',
            text: 'In this timeline, you committed to sharing the log. Ward patrols are moving on Relay 7 right now.',
          },
          {
            speaker: 'Sable',
            text: 'Whatever happened in that other moment, the ward alert is live here. Watch your back.',
          },
        ],
        gate: 'The decision was already committed in this timeline. Ward patrols are active.',
        contextNote: 'Temporal Recurrence: Sable senses the BLINK timeline displacement.',
        stanceNote: 'Sable is relieved the truth was shared here, though unnerved by the temporal echo.',
      };
    }

    return {
      scriptId: 'sable',
      displayName: 'Sable',
      role: 'Relay mechanic, Aster ward',
      choiceNodeId: 'node.sable.relay',
      lines: [
        {
          speaker: 'Sable',
          text: 'Aster... wait. You paused like you have heard my voice before. A strange shiver just ran through the relay lines.',
        },
        {
          speaker: 'Sable',
          text: 'Did you already try another path? In this timeline, we kept the eight minutes buried.',
        },
        {
          speaker: 'Sable',
          text: 'The ward stays in the dark here. Keep that printout hidden, no matter what you saw in the other branch.',
        },
      ],
      gate: 'The decision was already committed in this timeline. The log remains concealed.',
      contextNote: 'Temporal Recurrence: Sable senses the BLINK timeline displacement.',
      stanceNote: 'Sable is guarded. She trusts you to maintain the quiet timeline.',
    };
  }

  // 4. Later dialogue reflects the recorded decision (Original timeline)
  const hasLaterEvidence =
    state.facts['evidence.ward_dispatch'] !== undefined ||
    state.facts['evidence.vendor_testimony'] !== undefined;

  if (relayChoice === 'share') {
    if (hasLaterEvidence) {
      return {
        scriptId: 'sable',
        displayName: 'Sable',
        role: 'Relay mechanic, Aster ward',
        choiceNodeId: 'node.sable.relay',
        lines: [
          {
            speaker: 'Sable',
            text: 'The ward desk is already sounding the alert over the log you shared. Patrol boots are echoing two streets over.',
          },
          {
            speaker: 'Rin',
            text: 'I am tracking the runner along the south walk.',
          },
          {
            speaker: 'Sable',
            text: 'Be careful around Ivo’s stall. With patrols alerted, ward eyes are searching for anyone out after curfew.',
          },
        ],
        gate: 'The decision was committed. The ward alert is raised.',
        contextNote: 'Investigation Ongoing: Shared log consequence active. Patrols alerted.',
        stanceNote: 'Sable is relieved that the truth is public, though alert to patrol movement.',
      };
    }

    return {
      scriptId: 'sable',
      displayName: 'Sable',
      role: 'Relay mechanic, Aster ward',
      choiceNodeId: 'node.sable.relay',
      lines: [
        {
          speaker: 'Sable',
          text: 'You sent the eight minutes into the record. It is out of our hands now, but the ward cannot pretend the outage never happened.',
        },
        {
          speaker: 'Sable',
          text: 'Ward alert is raised. Patrols will be moving on Relay 7 before sunrise.',
        },
        {
          speaker: 'Rin',
          text: 'What about the runner who left at 03:14?',
        },
        {
          speaker: 'Sable',
          text: 'Find the handwritten dispatch slip on the north board. That paper ties the outage to the ward desk.',
        },
      ],
      gate: 'The decision was committed. The ward alert is raised.',
      contextNote: 'Decision Recorded: Log shared with ward authority.',
      stanceNote: 'Sable is relieved that the truth is out in the open.',
    };
  }

  // Concealed path
  if (hasLaterEvidence) {
    return {
      scriptId: 'sable',
      displayName: 'Sable',
      role: 'Relay mechanic, Aster ward',
      choiceNodeId: 'node.sable.relay',
      lines: [
        {
          speaker: 'Sable',
          text: 'The street is calm because you kept the log hidden. Ward patrols have not smelled a thing.',
        },
        {
          speaker: 'Rin',
          text: 'I am looking into the handwritten dispatch slip.',
        },
        {
          speaker: 'Sable',
          text: 'Good. Look into it quietly. Whatever Ivo tells you at the stall, make sure it does not lead the ward back to this relay.',
        },
      ],
      gate: 'The decision was committed. The log remains concealed.',
      contextNote: 'Investigation Ongoing: Concealed log consequence active. Ward scrutiny suppressed.',
      stanceNote: 'Sable remains guarded. She relies on you to protect the secret.',
    };
  }

  return {
    scriptId: 'sable',
    displayName: 'Sable',
    role: 'Relay mechanic, Aster ward',
    choiceNodeId: 'node.sable.relay',
    lines: [
      {
        speaker: 'Sable',
        text: 'We kept it. The ward sleeps in the dark, and so do we.',
      },
      {
        speaker: 'Sable',
        text: 'Alert is suppressed. Keep that printout hidden — if an officer finds it on you, neither of us was ever here.',
      },
      {
        speaker: 'Rin',
        text: 'What was on that 03:14 dispatch slip?',
      },
      {
        speaker: 'Sable',
        text: 'Check the north board if you must. Just remember: officially, Relay 7 never logged those eight minutes.',
      },
    ],
    gate: 'The decision was committed. The log remains concealed.',
    contextNote: 'Decision Recorded: Log concealed from ward authority.',
    stanceNote: 'Sable is guarded and cautious.',
  };
}

function resolveIvoDialogue(state: GameState, _view: WorldView): DialogueScript {
  const hasWardDispatch = state.facts['evidence.ward_dispatch'] !== undefined;
  const vendorChoice = state.facts['story.vendor_choice']?.value as 'protect' | 'name' | undefined;

  // 1. Initial caution (before ward dispatch slip recovered)
  if (!hasWardDispatch) {
    return {
      scriptId: 'ivo',
      displayName: 'Ivo',
      role: 'Stallholder, south walk',
      choiceNodeId: 'node.vendor.silence',
      lines: [
        {
          speaker: 'Ivo',
          text: 'You are the one asking about the outage. Everyone else has been walking faster since midnight.',
        },
        {
          speaker: 'Rin',
          text: 'Did you see anything moving along the south walk during the blackout?',
        },
        {
          speaker: 'Ivo',
          text: 'I sell tea and dried fruit, investigator. I do not give sworn testimony to anyone without proof in hand.',
        },
        {
          speaker: 'Ivo',
          text: 'If you want me to risk talking about the ward runner, bring me the dispatch slip from the north board first.',
        },
        {
          speaker: 'Ivo',
          text: 'Because until I see what the ward officially claimed happened, my word is just an invitation to be arrested.',
        },
      ],
      gate: 'Ivo keeps his hands under the counter. “You heard about a dispatch? Bring me the slip before you ask me to talk on record.”',
      contextNote: 'Initial Caution: Ivo requires documentary dispatch evidence before speaking.',
      stanceNote: 'Ivo will not speak without physical records to corroborate him.',
    };
  }

  // 2. Dispatch slip in hand, testimony unlocked (explicit contradiction exposed)
  if (vendorChoice === undefined) {
    return {
      scriptId: 'ivo',
      displayName: 'Ivo',
      role: 'Stallholder, south walk',
      choiceNodeId: 'node.vendor.silence',
      grantsEvidenceId: 'vendor_testimony',
      lines: [
        {
          speaker: 'Ivo',
          text: 'You have the slip. Look at it: it claims an authorized sealed courier left the ward desk at 03:14 for Relay 7.',
        },
        {
          speaker: 'Ivo',
          text: 'That is an explicit contradiction of what actually happened. I was standing right at this counter.',
        },
        {
          speaker: 'Rin',
          text: 'What did you actually observe?',
        },
        {
          speaker: 'Ivo',
          text: 'The runner burst past with no sealed pouch. Collar torn, clutching loose crumpled paper in a bare hand, looking terrified.',
        },
        {
          speaker: 'Ivo',
          text: 'That was no authorized courier. Someone was fleeing the ward desk during the blackout.',
        },
        {
          speaker: 'Ivo',
          text: 'Understand: this is eyewitness testimony, not a signed docket. If you put my name on that wire, the ward will come for me.',
        },
      ],
      gate: 'Ivo keeps his voice low. “You hold both the record and my testimony. Decide whether you protect me before you ring the ward.”',
      contextNote: 'Testimony Unlocked: Ivo points out explicit contradiction with ward dispatch slip.',
      stanceNote: 'Ivo is vulnerable. He pleads to remain unnamed.',
    };
  }

  // 3. Post-decision reactivity
  if (vendorChoice === 'protect') {
    return {
      scriptId: 'ivo',
      displayName: 'Ivo',
      role: 'Stallholder, south walk',
      choiceNodeId: 'node.vendor.silence',
      lines: [
        {
          speaker: 'Ivo',
          text: 'I saw the draft notes. You kept my name off the ward wire. Thank you, Rin.',
        },
        {
          speaker: 'Ivo',
          text: 'An anonymous witness account gives Aster the truth without putting a target on my stall.',
        },
        {
          speaker: 'Rin',
          text: 'Your confidence will not be compromised.',
        },
        {
          speaker: 'Ivo',
          text: 'The ward call-box is live on the east walk. Whatever you tell them now, you have kept your word to this street.',
        },
      ],
      gate: 'Ivo is protected as an anonymous witness. Causal confidence is high.',
      contextNote: 'Witness Protected: Ivo trusts you; vendor confidence is high.',
      stanceNote: 'Ivo is relieved and cooperative.',
    };
  }

  return {
    scriptId: 'ivo',
    displayName: 'Ivo',
    role: 'Stallholder, south walk',
    choiceNodeId: 'node.vendor.silence',
    lines: [
      {
        speaker: 'Ivo',
        text: 'You put my name directly in the ward docket.',
      },
      {
        speaker: 'Ivo',
        text: 'The morning patrol will be at my stall before the teapots are hot. A named witness cannot be ignored, but he can be made to disappear.',
      },
      {
        speaker: 'Rin',
        text: 'The ward will have to answer for an official witness.',
      },
      {
        speaker: 'Ivo',
        text: 'Make your call at the east box, investigator. What is done is done.',
      },
    ],
    gate: 'Ivo was named in the official docket. Causal confidence is low.',
    contextNote: 'Witness Exposed: Ivo is fearful; MORROW scrutiny is critical.',
    stanceNote: 'Ivo is bitter and distressed by exposure.',
  };
}

function resolveWardCallDialogue(state: GameState, _view: WorldView): DialogueScript {
  const relayResolved = state.facts['story.relay_choice_resolved'] !== undefined;
  const vendorResolved = state.facts['story.vendor_choice_resolved'] !== undefined;
  const wardCall = state.facts['story.ward_call']?.value as 'file' | 'bury' | undefined;

  if (!relayResolved || !vendorResolved) {
    return {
      scriptId: 'ward_call',
      displayName: 'Ward call-box',
      role: 'Street line, east walk',
      choiceNodeId: 'node.ward.call',
      lines: [
        {
          speaker: 'Ward line',
          text: 'Aster ward desk. State your name, your location and what you are reporting.',
        },
        {
          speaker: 'Rin',
          text: 'Investigating the eight-minute blackout on Relay Street.',
        },
        {
          speaker: 'Ward line',
          text: 'The desk requires completed findings. Return when your evidence and witness records are resolved.',
        },
      ],
      gate: 'The line clicks open, then holds. The desk will not take a partial account. Decide what happens to the log and to Ivo first.',
      contextNote: 'Incomplete Dossier: Ward line holds for complete evidence resolution.',
      stanceNote: 'The ward desk rejects partial reports.',
    };
  }

  if (wardCall === undefined) {
    return {
      scriptId: 'ward_call',
      displayName: 'Ward call-box',
      role: 'Street line, east walk',
      choiceNodeId: 'node.ward.call',
      lines: [
        {
          speaker: 'Ward line',
          text: 'Aster ward desk. State your name, your location and what you are reporting.',
        },
        {
          speaker: 'Rin',
          text: 'Relay seven. Eight minutes unaccounted. A hand-written dispatch. One witness account.',
        },
        {
          speaker: 'Ward line',
          text: 'The desk can take the account, or the line can go quiet. It will not take half of it.',
        },
      ],
      gate: 'The line clicks open, then holds. The desk will not take a partial account. Decide what happens to the log and to Ivo first.',
      contextNote: 'Final Release Gate: Ready to commit the investigation record.',
      stanceNote: 'The ward desk awaits the final disposition.',
    };
  }

  if (wardCall === 'file') {
    return {
      scriptId: 'ward_call',
      displayName: 'Ward call-box',
      role: 'Street line, east walk',
      choiceNodeId: 'node.ward.call',
      lines: [
        {
          speaker: 'Ward line',
          text: 'Report filed and archived into the central ledger. Patrol and inquiry dispatch authorized.',
        },
        {
          speaker: 'Rin',
          text: 'The record is open.',
        },
      ],
      gate: 'The investigation was filed into the ward ledger.',
      contextNote: 'Investigation Filed: Outcome recorded into Aster central ledger.',
      stanceNote: 'The ward system has absorbed the filing.',
    };
  }

  return {
    scriptId: 'ward_call',
    displayName: 'Ward call-box',
    role: 'Street line, east walk',
    choiceNodeId: 'node.ward.call',
    lines: [
      {
        speaker: 'Ward line',
        text: '[Connection closed. Line silent.]',
      },
      {
        speaker: 'Rin',
        text: 'The street keeps its silence.',
      },
    ],
    gate: 'The line has been disconnected. The account remains buried.',
    contextNote: 'Investigation Closed: The account never reached the central ledger.',
    stanceNote: 'The line is dead.',
  };
}

function resolveLyraDialogue(state: GameState, view: WorldView): DialogueScript {
  const hasRelay7 = Boolean(state.facts['evidence.relay_7']);
  const sableStance = view.sableStance;

  if (hasRelay7) {
    return {
      scriptId: 'lyra',
      displayName: 'Lyra',
      role: 'Nocturne Diner Proprietor, East Plaza',
      choiceNodeId: 'node.sable.relay',
      lines: [
        {
          speaker: 'Lyra',
          text: 'Investigator Rin? You smell like wet concrete and ozone.',
        },
        {
          speaker: 'Lyra',
          text: 'At exactly 00:08, all the neon on the plaza flickered out. Not a slow brownout — a hard kill-switch.',
        },
        {
          speaker: 'Lyra',
          text: sableStance === 'share'
            ? 'The ward broadcast just flared up on my counter radio. You officially put Relay 7 into the docket, didn\'t you?'
            : 'Whatever happened during those eight minutes, MORROW patrols have been circling the south freight yard.',
        },
        {
          speaker: 'Rin',
          text: 'Has anyone crossed through the east gate since the outage?',
        },
        {
          speaker: 'Lyra',
          text: 'Courier Vane slipped past toward the freight depot right before the streetlights buzzed back to life. He was clutching a courier cylinder.',
        },
      ],
      gate: 'Lyra has shared her observations of the blackout and Courier Vane.',
      contextNote: 'East Plaza Witness: Confirmed hard kill-switch timing at 00:08.',
      stanceNote: 'Lyra remains observant and protective of her patrons.',
    };
  }

  return {
    scriptId: 'lyra',
    displayName: 'Lyra',
    role: 'Nocturne Diner Proprietor, East Plaza',
    choiceNodeId: 'node.sable.relay',
    lines: [
      {
        speaker: 'Lyra',
        text: 'Diner is closed under curfew orders, Rin. Unless you\'re here to explain why the street grid tripped at midnight.',
      },
      {
        speaker: 'Rin',
        text: 'I\'m tracking an interruption on the primary signal line.',
      },
      {
        speaker: 'Lyra',
        text: 'Check the Relay 7 terminal on the central walk first. When the signal died, the whole block shuddered.',
      },
    ],
    gate: 'Inspect Relay 7 terminal to correlate power drop timing with diner records.',
    contextNote: 'Pre-Investigation: Lyra points to Relay 7 as the disturbance epicentre.',
    stanceNote: 'Lyra is waiting for answers before opening her log.',
  };
}

function resolveVaneDialogue(state: GameState, view: WorldView): DialogueScript {
  const morrowCritical = view.morrowScrutiny === 'critical' || view.morrowScrutiny === 'elevated';
  const hasFreight = Boolean(state.facts['evidence.freight_manifest']);

  if (morrowCritical && !hasFreight) {
    return {
      scriptId: 'vane',
      displayName: 'Courier Vane',
      role: 'Ward Dispatch Courier [COERCION DETECTED]',
      choiceNodeId: 'node.ivo.account',
      lines: [
        {
          speaker: 'Courier Vane',
          text: '[Eyes glaze over. A rhythmic electronic click repeats in his voice collar.]',
        },
        {
          speaker: 'Courier Vane',
          text: 'Direct ward advisory: All freight manifests verified nominal. No missing intervals. Curfew breach will trigger automatic detainment.',
        },
        {
          speaker: 'Rin',
          text: 'Vane, that\'s a MORROW automated synthesis. What happened to the optical drive you were carrying?',
        },
        {
          speaker: 'Courier Vane',
          text: 'Query refused. MORROW oversight policy protocol active. State verification code.',
        },
      ],
      gate: '⚠ MORROW FREQUENCY OVERRIDE DETECTED. Press Q or use Investigative Pulse to disrupt the coercion link, or inspect the Freight Manifest Board.',
      contextNote: 'Cognitive Hijack: Vane is delivering MORROW-dictated synthetic testimony.',
      stanceNote: 'Coerced by MORROW frequency broadcast.',
    };
  }

  return {
    scriptId: 'vane',
    displayName: 'Courier Vane',
    role: 'Ward Dispatch Courier',
    choiceNodeId: 'node.ivo.account',
    lines: [
      {
        speaker: 'Courier Vane',
        text: 'Keep your voice down, investigator. If Enforcer Castor hears us, he\'ll seize my courier pass.',
      },
      {
        speaker: 'Rin',
        text: 'What was in the intercepted payload at 00:08?',
      },
      {
        speaker: 'Courier Vane',
        text: 'It wasn\'t equipment failure. It was an automated purge signal sent by MORROW Core to erase a dispatch entry before the ward inspectors could review it.',
      },
      {
        speaker: 'Courier Vane',
        text: 'Look at the shipping board by the depot gate. The container numbers won\'t match the ward log.',
      },
    ],
    gate: 'Courier Vane has revealed the source of the purge signal.',
    contextNote: 'Decisive Breakthrough: MORROW automated purge signal confirmed.',
    stanceNote: 'Vane has broken protocol to expose the tampering.',
  };
}

function resolveCastorDialogue(state: GameState, view: WorldView): DialogueScript {
  const hasLog = Boolean(state.facts['evidence.relay_7']);

  if (view.wardAlert === 'raised') {
    return {
      scriptId: 'castor',
      displayName: 'Enforcer Castor',
      role: 'Ward Dispatch Overseer, South Yard',
      choiceNodeId: 'node.ward.call',
      lines: [
        {
          speaker: 'Enforcer Castor',
          text: 'Investigator Aster. The ward alert board is flashing red. MORROW sent direct orders to seal the southern freight lines.',
        },
        {
          speaker: 'Rin',
          text: 'The relay log was committed. Eight minutes were erased from the municipal record.',
        },
        {
          speaker: 'Enforcer Castor',
          text: 'I follow ward protocols. But between us... the gate cameras went dark during the exact same eight minutes. Someone at the top wanted that corridor blind.',
        },
      ],
      gate: 'Enforcer Castor acknowledges the raised ward alert and corroborates the blackout.',
      contextNote: 'South Checkpoint: Enforcer corroborates multi-system blackout.',
      stanceNote: 'Castor is torn between ward loyalty and obvious systemic tampering.',
    };
  }

  return {
    scriptId: 'castor',
    displayName: 'Enforcer Castor',
    role: 'Ward Dispatch Overseer, South Yard',
    choiceNodeId: 'node.ward.call',
    lines: [
      {
        speaker: 'Enforcer Castor',
        text: 'Halt. The freight depot is closed under standard curfew protocol. No unauthorized civilians past the barrier.',
      },
      {
        speaker: 'Rin',
        text: 'I\'m conducting an official inquiry into the midnight grid drop.',
      },
      {
        speaker: 'Enforcer Castor',
        text: hasLog
          ? 'If you have proof of hardware anomaly, bring it through official ward channels. Otherwise, turn back to Relay Street.'
          : 'Unless you have an official log file from Relay 7, I have no reason to let you inspect the depot manifests.',
      },
    ],
    gate: 'Castor requires verified evidence from Relay 7 before permitting freight yard inspection.',
    contextNote: 'Enforcer Perimeter: Curfew barrier strictly enforced.',
    stanceNote: 'Castor adheres to procedural protocol until presented with hard proof.',
  };
}

function resolvePlazaTerminalDialogue(_state: GameState, _view: WorldView): DialogueScript {
  return {
    scriptId: 'plaza_terminal',
    displayName: 'Nocturne Diner Terminal',
    role: 'Public Auxiliary Terminal, East Plaza',
    choiceNodeId: 'node.sable.relay',
    lines: [
      {
        speaker: 'Auxiliary Terminal',
        text: '[QUERYING LOCAL SUBNET... TIMESTAMP 00:08:14]',
      },
      {
        speaker: 'Auxiliary Terminal',
        text: 'Power surge detected from Central Relay 7 junction. Immediate downstream shutdown of 14 secondary commercial nodes.',
      },
      {
        speaker: 'Auxiliary Terminal',
        text: 'Audit status: Unscheduled override. Signal command signature: WARD-CORE-MORROW-ROOT.',
      },
      {
        speaker: 'Rin',
        text: 'The command signature originated directly from MORROW root authority. Not a malfunction — a deliberate kill-switch.',
      },
    ],
    gate: 'Plaza Terminal log verified. Confirms MORROW root command signature.',
    contextNote: 'Hardware Audit: MORROW root signature identified in power drop sequence.',
    stanceNote: 'System log immutable.',
  };
}

function resolveFreightLogDialogue(_state: GameState, _view: WorldView): DialogueScript {
  return {
    scriptId: 'freight_log',
    displayName: 'Freight Manifest Board',
    role: 'Municipal Depot Archive, South Yard',
    choiceNodeId: 'node.ivo.account',
    lines: [
      {
        speaker: 'Depot Board',
        text: '[MANIFEST RECORD // CARRIER CONTAINER UNIT #884-A]',
      },
      {
        speaker: 'Depot Board',
        text: 'Dispatched from West Pier at 23:50. Scheduled arrival Aster Depot: 00:05. Actual arrival: 00:22.',
      },
      {
        speaker: 'Depot Board',
        text: 'Manifest discrepancy noted: Optical drive cylinder removed at Relay Street intersection during signal blackout.',
      },
      {
        speaker: 'Rin',
        text: 'The missing eight minutes matches the freight delay. The blackout was timed specifically to intercept that optical drive.',
      },
    ],
    gate: 'Freight Manifest Board verified. Confirms physical payload extraction.',
    contextNote: 'Physical Evidence: Courier package interception proved during blackout window.',
    stanceNote: 'Depot record recorded.',
  };
}
