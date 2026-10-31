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
}

export const STAGE5_DIALOGUE: Readonly<Record<string, DialogueScript>> = {
  sable: {
    scriptId: 'sable',
    displayName: 'Sable',
    role: 'Relay mechanic, Aster ward',
    choiceNodeId: 'node.sable.relay',
    lines: [
      {
        speaker: 'Sable',
        text: 'You came through the east gate. That makes you the only person who saw the street go dark.',
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
        speaker: 'Ivo',
        text: 'I was closing the stall when the runner came past. Ward coat, no sealed pouch, the slip open in their hand.',
      },
      {
        speaker: 'Rin',
        text: 'Could you read the destination?',
      },
      {
        speaker: 'Ivo',
        text: 'Relay seven. I saw it because the streetlights came back on while they were still reading it.',
      },
      {
        speaker: 'Ivo',
        text: 'If the ward asks where this came from, I would like my name to stay out of it.',
      },
    ],
    gate: 'Ivo keeps his hands under the counter. “You heard about a dispatch? Bring me the slip before you ask me to talk on record.”',
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
        text: 'Relay seven. Eight minutes unaccounted. A hand-written dispatch. One witness who wants to stay unnamed.',
      },
      {
        speaker: 'Ward line',
        text: 'The desk can take the account, or the line can go quiet. It will not take half of it.',
      },
    ],
    gate: 'The line clicks open, then holds. The desk will not take a partial account. Decide what happens to the log and to Ivo first.',
  },
};

export const ANCHOR_LABEL = 'Lamp post — Relay Street';

export const DISTRICT_TITLE = 'Aster — Relay Street';
