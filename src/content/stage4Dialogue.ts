/**
 * Scripted conversation for Stage 4. Dialogue is presentation data, not
 * canonical state; the only canon it can change is the choice it unlocks,
 * which is dispatched through GameSession.
 */
export interface DialogueLine {
  readonly speaker: 'Sable' | 'Rin';
  readonly text: string;
}

export const SABLE_DIALOGUE = {
  npcId: 'npc_sable',
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
      speaker: 'Rin',
      text: 'Then the relay is the only thing here that stayed awake.',
    },
    {
      speaker: 'Sable',
      text: 'The ward will call it a fault and bury it. If you keep the log, we both carry what it says.',
    },
  ],
} as const satisfies {
  readonly npcId: string;
  readonly displayName: string;
  readonly role: string;
  readonly choiceNodeId: string;
  readonly lines: readonly DialogueLine[];
};

export const ANCHOR_LABEL = 'Lamp post — Relay 7';

export const DISTRICT_TITLE = 'Aster — Relay Street';
