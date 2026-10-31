import {
  CONTRACT_VERSION,
  gameContentSchema,
  type GameContent,
} from '../engine/index.js';

/**
 * Stage 4 story content. Trusted, versioned data: it declares the canonical
 * facts an evidence item or a choice may write. Action callers only name these
 * definitions; they never supply fact keys or values (ADR 0008).
 */
export const STAGE4_CONTENT: GameContent = gameContentSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  contentId: 'content.stage4.aster',
  gameVersion: '0.2.0',
  initialFacts: [
    {
      key: 'world.district',
      value: 'aster',
      kind: 'observed',
      sourceRef: 'content.stage4.aperture',
    },
    {
      key: 'world.curfew',
      value: 'active',
      kind: 'observed',
      sourceRef: 'content.stage4.aperture',
    },
    {
      key: 'story.relay_status',
      value: 'sealed',
      kind: 'observed',
      sourceRef: 'content.stage4.aperture',
    },
  ],
  rules: [
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_relay_log_recovered',
      description: 'Mark the relay log as in hand once its evidence fact exists.',
      priority: 30,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'evidence.relay_7', op: 'exists' },
          { kind: 'not', of: { kind: 'fact', key: 'story.relay_ready', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.relay_ready',
          value: true,
          confidence: 1,
          sourceRef: 'rule.rul_relay_log_recovered',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_relay_shared',
      description: 'Sharing the log raises the ward alert and relieves Sable.',
      priority: 20,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.relay_choice', op: 'eq', value: 'share' },
          { kind: 'not', of: { kind: 'fact', key: 'world.ward_alert', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'world.ward_alert',
          value: 'raised',
          confidence: 1,
          sourceRef: 'rule.rul_relay_shared',
        },
        {
          kind: 'assert_fact',
          key: 'npc.sable.stance',
          value: 'relieved',
          confidence: 1,
          sourceRef: 'rule.rul_relay_shared',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_relay_concealed',
      description: 'Concealing the log suppresses the alert and hardens Sable.',
      priority: 20,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.relay_choice', op: 'eq', value: 'conceal' },
          { kind: 'not', of: { kind: 'fact', key: 'world.ward_alert', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'world.ward_alert',
          value: 'suppressed',
          confidence: 1,
          sourceRef: 'rule.rul_relay_concealed',
        },
        {
          kind: 'assert_fact',
          key: 'npc.sable.stance',
          value: 'guarded',
          confidence: 1,
          sourceRef: 'rule.rul_relay_concealed',
        },
      ],
    },
  ],
  evidence: [
    {
      evidenceId: 'relay_7_log',
      factKey: 'evidence.relay_7',
      label: 'Relay 7 maintenance log',
      summary:
        'Eight minutes of the outage were recorded by the relay when every other clock in Aster reset.',
      value: {
        relay: 7,
        fragment: 'EIGHT MINUTES UNACCOUNTED',
        loggedBy: 'sable',
        integrity: 'partial',
      },
      sourceRef: 'record.relay_7.terminal',
      confidence: 0.9,
    },
  ],
  choices: [
    {
      nodeId: 'node.sable.relay',
      prompt: 'The ward will ask for the log either way. What do you do with it?',
      options: [
        {
          optionId: 'share',
          label: 'Share the log with the ward',
          detail: 'The gap becomes public. Patrols will move on Relay 7 tonight.',
          effects: [
            { key: 'story.relay_choice', value: 'share' },
            { key: 'story.relay_choice_resolved', value: true },
          ],
          consequenceKeys: ['world.ward_alert', 'npc.sable.stance'],
        },
        {
          optionId: 'conceal',
          label: 'Conceal the log',
          detail: 'Only you and Sable keep the eight minutes. The ward learns nothing.',
          effects: [
            { key: 'story.relay_choice', value: 'conceal' },
            { key: 'story.relay_choice_resolved', value: true },
          ],
          consequenceKeys: ['world.ward_alert', 'npc.sable.stance'],
        },
      ],
    },
  ],
});
