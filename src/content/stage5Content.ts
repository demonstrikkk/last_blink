import {
  CONTRACT_VERSION,
  gameContentSchema,
  type GameContent,
} from '../engine/index.js';

/**
 * Stage 5 story content. Trusted, versioned data: it declares every canonical
 * fact an evidence item, a choice or a rule may write. Action callers only name
 * a content id; they never supply fact keys or values (ADR 0008, ADR 0009).
 *
 * Causal model: docs/CAUSAL_MODEL.md. Narrative plan: docs/STAGE_5_PLAN.md.
 */
export const STAGE5_CONTENT: GameContent = gameContentSchema.parse({
  schemaVersion: CONTRACT_VERSION,
  contentId: 'content.stage5.aster',
  gameVersion: '0.3.0',
  initialFacts: [
    {
      key: 'world.district',
      value: 'aster',
      kind: 'observed',
      sourceRef: 'content.stage5.aperture',
    },
    {
      key: 'world.curfew',
      value: 'active',
      kind: 'observed',
      sourceRef: 'content.stage5.aperture',
    },
    {
      key: 'story.relay_status',
      value: 'sealed',
      kind: 'observed',
      sourceRef: 'content.stage5.aperture',
    },
    {
      key: 'story.phase',
      value: 'arrival',
      kind: 'observed',
      sourceRef: 'content.stage5.aperture',
    },
    {
      key: 'npc.sable.trust',
      value: 'wary',
      kind: 'observed',
      sourceRef: 'content.stage5.aperture',
    },
    {
      key: 'world.dispatch_continuity',
      value: 'unknown',
      kind: 'observed',
      sourceRef: 'content.stage5.aperture',
    },
    {
      key: 'world.vendor_confidence',
      value: 'unknown',
      kind: 'observed',
      sourceRef: 'content.stage5.aperture',
    },
    {
      key: 'world.morrow_scrutiny',
      value: 'low',
      kind: 'observed',
      sourceRef: 'content.stage5.aperture',
    },
  ],
  rules: [
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_relay_log_recovered',
      description: 'Mark the relay log as in hand once its evidence fact exists.',
      priority: 88,
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

    // Phase is monotonic. Highest reached phase wins within one rule pass; the
    // `in` guards list only earlier phases so a lower rule cannot regress it.
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_phase_resolved',
      description: 'The ward call closes the investigation.',
      priority: 95,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          {
            kind: 'fact',
            key: 'story.phase',
            op: 'in',
            value: ['arrival', 'investigation', 'decision', 'accounting'],
          },
          { kind: 'fact', key: 'story.ward_call', op: 'exists' },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.phase',
          value: 'resolved',
          confidence: 1,
          sourceRef: 'rule.rul_phase_resolved',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_phase_accounting',
      description: 'Naming or protecting Ivo opens the accounting phase.',
      priority: 94,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          {
            kind: 'fact',
            key: 'story.phase',
            op: 'in',
            value: ['arrival', 'investigation', 'decision'],
          },
          { kind: 'fact', key: 'story.vendor_choice_resolved', op: 'exists' },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.phase',
          value: 'accounting',
          confidence: 1,
          sourceRef: 'rule.rul_phase_accounting',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_phase_decision',
      description: 'Resolving the relay decision opens the decision phase.',
      priority: 93,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          {
            kind: 'fact',
            key: 'story.phase',
            op: 'in',
            value: ['arrival', 'investigation'],
          },
          { kind: 'fact', key: 'story.relay_choice_resolved', op: 'exists' },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.phase',
          value: 'decision',
          confidence: 1,
          sourceRef: 'rule.rul_phase_decision',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_phase_investigation',
      description: 'Reading the relay log opens the investigation phase.',
      priority: 92,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.phase', op: 'in', value: ['arrival'] },
          { kind: 'fact', key: 'evidence.relay_7', op: 'exists' },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.phase',
          value: 'investigation',
          confidence: 1,
          sourceRef: 'rule.rul_phase_investigation',
        },
      ],
    },

    // Relay 7 decision. Both rules fire once, when the alert is still absent.
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_relay_shared',
      description: 'Sharing the log raises the ward alert and earns Sable trust.',
      priority: 85,
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
        {
          kind: 'assert_fact',
          key: 'npc.sable.trust',
          value: 'trusted',
          confidence: 1,
          sourceRef: 'rule.rul_relay_shared',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_relay_concealed',
      description: 'Concealing the log suppresses the alert and hardens Sable.',
      priority: 85,
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
        {
          kind: 'assert_fact',
          key: 'npc.sable.trust',
          value: 'wary',
          confidence: 1,
          sourceRef: 'rule.rul_relay_concealed',
        },
      ],
    },

    // Delayed consequence. The dispatch slip is collected later; only then can
    // the earlier relay decision resolve the continuity of the ward record.
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_dispatch_unbroken',
      description: 'A shared log keeps the dispatch chain intact once the slip is found.',
      priority: 75,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'evidence.ward_dispatch', op: 'exists' },
          { kind: 'fact', key: 'story.relay_choice', op: 'eq', value: 'share' },
          { kind: 'fact', key: 'world.dispatch_continuity', op: 'eq', value: 'unknown' },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'world.dispatch_continuity',
          value: 'unbroken',
          confidence: 0.9,
          sourceRef: 'rule.rul_dispatch_unbroken',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_dispatch_severed',
      description: 'A concealed log leaves the dispatch chain severed once the slip is found.',
      priority: 75,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'evidence.ward_dispatch', op: 'exists' },
          { kind: 'fact', key: 'story.relay_choice', op: 'eq', value: 'conceal' },
          { kind: 'fact', key: 'world.dispatch_continuity', op: 'eq', value: 'unknown' },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'world.dispatch_continuity',
          value: 'severed',
          confidence: 0.9,
          sourceRef: 'rule.rul_dispatch_severed',
        },
      ],
    },

    // Vendor decision and its conditional institutional response.
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_vendor_protected',
      description: 'Keeping Ivo unnamed protects him and steadies his confidence.',
      priority: 65,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.vendor_choice', op: 'eq', value: 'protect' },
          { kind: 'not', of: { kind: 'fact', key: 'npc.ivo.stance', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'npc.ivo.stance',
          value: 'protected',
          confidence: 1,
          sourceRef: 'rule.rul_vendor_protected',
        },
        {
          kind: 'assert_fact',
          key: 'world.vendor_confidence',
          value: 'high',
          confidence: 1,
          sourceRef: 'rule.rul_vendor_protected',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_vendor_named',
      description: 'Naming Ivo exposes him and lowers his confidence.',
      priority: 65,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.vendor_choice', op: 'eq', value: 'name' },
          { kind: 'not', of: { kind: 'fact', key: 'npc.ivo.stance', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'npc.ivo.stance',
          value: 'exposed',
          confidence: 1,
          sourceRef: 'rule.rul_vendor_named',
        },
        {
          kind: 'assert_fact',
          key: 'world.vendor_confidence',
          value: 'low',
          confidence: 1,
          sourceRef: 'rule.rul_vendor_named',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_scrutiny_critical',
      description: 'A named witness puts MORROW scrutiny at critical.',
      priority: 64,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.vendor_choice', op: 'eq', value: 'name' },
          { kind: 'fact', key: 'world.morrow_scrutiny', op: 'neq', value: 'critical' },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'world.morrow_scrutiny',
          value: 'critical',
          confidence: 1,
          sourceRef: 'rule.rul_scrutiny_critical',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_scrutiny_elevated',
      description: 'Protecting Ivo after sharing the log still raises scrutiny.',
      priority: 64,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.vendor_choice', op: 'eq', value: 'protect' },
          { kind: 'fact', key: 'story.relay_choice', op: 'eq', value: 'share' },
          { kind: 'fact', key: 'world.morrow_scrutiny', op: 'neq', value: 'elevated' },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'world.morrow_scrutiny',
          value: 'elevated',
          confidence: 1,
          sourceRef: 'rule.rul_scrutiny_elevated',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_scrutiny_low',
      description: 'Protecting Ivo after concealing the log keeps scrutiny low.',
      priority: 64,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.vendor_choice', op: 'eq', value: 'protect' },
          { kind: 'fact', key: 'story.relay_choice', op: 'eq', value: 'conceal' },
          { kind: 'fact', key: 'world.morrow_scrutiny', op: 'neq', value: 'low' },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'world.morrow_scrutiny',
          value: 'low',
          confidence: 1,
          sourceRef: 'rule.rul_scrutiny_low',
        },
      ],
    },

    // Ending rules. They only match once the ward call exists, and the
    // `story.ending_id` guard stops them re-evaluating after the ending lands.
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_ending_sealed_street',
      description: 'Burying the account seals the street.',
      priority: 52,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.ward_call', op: 'eq', value: 'bury' },
          { kind: 'not', of: { kind: 'fact', key: 'story.ending_id', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.ending_id',
          value: 'ending.sealed_street',
          confidence: 1,
          sourceRef: 'rule.rul_ending_sealed_street',
        },
        { kind: 'set_ending', endingId: 'ending.sealed_street' },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_ending_open_record',
      description: 'A filed account with an intact chain and a protected witness opens the record.',
      priority: 51,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.ward_call', op: 'eq', value: 'file' },
          { kind: 'fact', key: 'world.dispatch_continuity', op: 'eq', value: 'unbroken' },
          { kind: 'fact', key: 'npc.ivo.stance', op: 'eq', value: 'protected' },
          { kind: 'not', of: { kind: 'fact', key: 'story.ending_id', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.ending_id',
          value: 'ending.open_record',
          confidence: 1,
          sourceRef: 'rule.rul_ending_open_record',
        },
        { kind: 'set_ending', endingId: 'ending.open_record' },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_ending_ward_inquiry',
      description: 'A filed account with a broken chain, an exposed witness or critical scrutiny becomes an inquiry.',
      priority: 50,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.ward_call', op: 'eq', value: 'file' },
          {
            kind: 'any',
            of: [
              { kind: 'fact', key: 'world.dispatch_continuity', op: 'eq', value: 'severed' },
              { kind: 'fact', key: 'npc.ivo.stance', op: 'eq', value: 'exposed' },
              { kind: 'fact', key: 'world.morrow_scrutiny', op: 'eq', value: 'critical' },
            ],
          },
          { kind: 'not', of: { kind: 'fact', key: 'story.ending_id', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.ending_id',
          value: 'ending.ward_inquiry',
          confidence: 1,
          sourceRef: 'rule.rul_ending_ward_inquiry',
        },
        { kind: 'set_ending', endingId: 'ending.ward_inquiry' },
      ],
    },
    // Clue-chain correlation. Each rule only adds a derived fact; the player
    // still has to make the explicit decision at the console.
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_optical_depot_link',
      description: 'The jumper, manifest and diner voucher agree on one relay-to-depot route.',
      priority: 72,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'evidence.optical_jumper', op: 'exists' },
          { kind: 'fact', key: 'evidence.freight_manifest', op: 'exists' },
          { kind: 'fact', key: 'evidence.diner_guestbook', op: 'exists' },
          { kind: 'not', of: { kind: 'fact', key: 'story.relay_depot_link', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.relay_depot_link',
          value: 'confirmed',
          confidence: 0.94,
          sourceRef: 'rule.rul_optical_depot_link',
        },
      ],
    },
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_frequency_match',
      description: 'The tuned 434.8 MHz channel matches the frequency found in the depot locker.',
      priority: 71,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'evidence.surveillance_frequency', op: 'exists' },
          { kind: 'fact', key: 'evidence.depot_locker', op: 'exists' },
          { kind: 'not', of: { kind: 'fact', key: 'story.frequency_match', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.frequency_match',
          value: '434.8MHz',
          confidence: 0.95,
          sourceRef: 'rule.rul_frequency_match',
        },
      ],
    },

    // The fourth, additive ending. It requires the termination decision and
    // never competes with the three ward-call endings.
    {
      schemaVersion: CONTRACT_VERSION,
      ruleId: 'rul_ending_second_settlement',
      description: 'Severing MORROW with the root key while holding the human-cost record settles the street differently.',
      priority: 53,
      enabled: true,
      condition: {
        kind: 'all',
        of: [
          { kind: 'fact', key: 'story.morrow_terminated', op: 'eq', value: true },
          { kind: 'not', of: { kind: 'fact', key: 'story.ending_id', op: 'exists' } },
        ],
      },
      effects: [
        {
          kind: 'assert_fact',
          key: 'story.ending_id',
          value: 'ending.second_settlement',
          confidence: 1,
          sourceRef: 'rule.rul_ending_second_settlement',
        },
        { kind: 'set_ending', endingId: 'ending.second_settlement' },
      ],
    },
  ],
  evidence: [
    {
      evidenceId: 'relay_7_log',
      factKey: 'evidence.relay_7',
      label: 'Relay 7 maintenance log',
      summary:
        'Eight minutes of the outage were recorded by the relay when every other clock in Aster reset. A dispatch runner passed at 03:14.',
      value: {
        relay: 7,
        fragment: 'EIGHT MINUTES UNACCOUNTED',
        loggedBy: 'sable',
        runnerAt: '03:14',
        integrity: 'partial',
      },
      sourceRef: 'record.relay_7.terminal',
      sourceKind: 'record',
      confidence: 0.9,
      requires: [],
    },
    {
      evidenceId: 'ward_dispatch',
      factKey: 'evidence.ward_dispatch',
      label: 'Ward dispatch slip',
      summary:
        'The 03:14 dispatch was logged by hand, not by the ward system. The slip names Relay 7 as its destination.',
      value: {
        dispatch: '03:14',
        destination: 'relay_7',
        loggedBy: 'ward_desk',
        integrity: 'intact',
      },
      sourceRef: 'record.ward.dispatch_board',
      sourceKind: 'record',
      confidence: 0.95,
       // Independent field record: the player can find it before the relay log.
       requires: [],
    },
    {
      evidenceId: 'vendor_testimony',
      factKey: 'evidence.vendor_testimony',
      label: "Ivo's account",
      summary:
        'Ivo saw the dispatch runner leave the ward desk without a sealed pouch. The slip was in an open hand.',
      value: {
        witness: 'ivo',
        saw: 'dispatch_runner',
        detail: 'no_sealed_pouch',
        confidence: 'steady',
      },
      sourceRef: 'testimony.ivo.stall',
      sourceKind: 'testimony',
      confidence: 0.8,
       // Independent testimony: corroboration is stronger with the slip, but
       // Ivo is not forced into an arbitrary visit order.
       requires: [],
    },
    {
      evidenceId: 'clue_conduit',
      factKey: 'evidence.optical_jumper',
      label: 'Optical jumper cable',
      summary:
        'A warm optical jumper sits spliced into the West Alley drainage conduit. Its sheath runs under the ring road toward Relay 7 and the freight depot.',
      value: {
        hardware: 'optical_jumper',
        splice: 'west_alley_gutter',
        route: ['relay_7', 'freight_depot'],
        warmth: 'still_live',
      },
      sourceRef: 'record.west_alley.drainage_conduit',
      sourceKind: 'record',
      confidence: 0.92,
       requires: [],
    },
    {
      evidenceId: 'clue_guestbook',
      factKey: 'evidence.diner_guestbook',
      label: 'Nocturne guestbook',
      summary:
        'A ward courier voucher was signed at 00:08. The margin note sets a drop frequency of 434.8 MHz.',
      value: {
        voucher: 'ward_courier',
        badge: 'vane',
        time: '00:08',
        frequency: '434.8MHz',
      },
      sourceRef: 'record.nocturne.guestbook',
      sourceKind: 'record',
      confidence: 0.88,
       requires: [],
    },
    {
      evidenceId: 'surveillance_frequency',
      factKey: 'evidence.surveillance_frequency',
      label: 'Tuned surveillance channel',
      summary:
        'The diner frequency console locks onto 434.8 MHz, the same channel the deputy used for the depot drop.',
      value: { frequency: '434.8MHz', channel: 'morrow_surveillance', tuned: true },
      sourceRef: 'record.nocturne.frequency_console',
      sourceKind: 'record',
      confidence: 0.9,
       requires: [],
    },
    {
      evidenceId: 'archive_record',
      factKey: 'evidence.archive_record',
      label: 'Archival incident ledger',
      summary:
        'The archive ledger shows the district clock reset was ordered from the civic authority, not caused by the outage.',
      value: {
        order: 'civic_clock_zeroing',
        signedBy: 'directorate',
        contradicts: 'relay_hardware_counter',
      },
      sourceRef: 'record.archive.incident_ledger',
      sourceKind: 'record',
      confidence: 0.9,
       requires: [],
    },
    {
      evidenceId: 'human_cost',
      factKey: 'evidence.human_cost',
      label: 'Held medical shipment',
      summary:
        'A clinic shipment was held for six hours because the freight line required a manual MORROW clearance that never arrived.',
      value: {
        shipment: 'clinic_insulin',
        heldHours: 6,
        cause: 'morrow_clearance_hold',
      },
      sourceRef: 'record.clinic.held_shipment',
      sourceKind: 'record',
      confidence: 0.86,
       requires: [],
    },
    {
      evidenceId: 'freight_log',
      factKey: 'evidence.freight_manifest',
      label: 'Freight manifest',
      summary:
        'The manifest records a sealed optical crate routed from Relay 7 to the depot office, signed by the same ward badge as the diner voucher.',
      value: {
        crate: 'optical_relay_module',
        from: 'relay_7',
        to: 'depot_office',
        badge: 'vane',
      },
      sourceRef: 'record.freight.manifest_board',
      sourceKind: 'record',
      confidence: 0.9,
       requires: [],
    },
    {
      evidenceId: 'plaza_terminal',
      factKey: 'evidence.plaza_terminal',
      label: 'Plaza civic terminal',
      summary:
        'The public terminal shows the MORROW oversight channel accepting a manual root token every night at 03:14.',
      value: {
        channel: 'morrow_oversight',
        tokenWindow: '03:14',
        auth: 'manual_root',
      },
      sourceRef: 'record.plaza.civic_terminal',
      sourceKind: 'record',
      confidence: 0.84,
       requires: [],
    },
    {
      evidenceId: 'clue_locker',
      factKey: 'evidence.depot_locker',
      label: 'Enforcer locker contents',
      summary:
        'The depot locker held a frequency log and a ward root bypass chip. The log matches the 434.8 MHz drop channel.',
      value: {
        locker: 'depot_enforcer',
        frequency: '434.8MHz',
        chip: 'ward_root_bypass',
      },
      sourceRef: 'record.depot.locker',
      sourceKind: 'record',
      confidence: 0.94,
       requires: [],
    },
    {
      evidenceId: 'depot_terminal',
      factKey: 'evidence.override_root',
      label: 'Root override key',
      summary:
        'The depot terminal accepted the bypass chip and printed ROOT-BYPASS-008, the credential that can sever MORROW from the district relay.',
      value: {
        code: 'ROOT-BYPASS-008',
        scope: 'district_morrow_purge',
        terminal: 'depot_office',
      },
      sourceRef: 'record.depot.override_terminal',
      sourceKind: 'record',
      confidence: 0.97,
       requires: [],
    },
  ],
  choices: [
    {
      nodeId: 'node.sable.relay',
      prompt: 'The ward will ask for the log either way. What do you do with it?',
      requires: ['evidence.relay_7'],
      options: [
        {
          optionId: 'share',
          label: 'Share the log with the ward',
          detail: 'The gap becomes public. Patrols will move on Relay 7 tonight.',
          effects: [
            { key: 'story.relay_choice', value: 'share' },
            { key: 'story.relay_choice_resolved', value: true },
          ],
          consequenceKeys: ['world.ward_alert', 'npc.sable.stance', 'npc.sable.trust'],
        },
        {
          optionId: 'conceal',
          label: 'Conceal the log',
          detail: 'Only you and Sable keep the eight minutes. The ward learns nothing.',
          effects: [
            { key: 'story.relay_choice', value: 'conceal' },
            { key: 'story.relay_choice_resolved', value: true },
          ],
          consequenceKeys: ['world.ward_alert', 'npc.sable.stance', 'npc.sable.trust'],
        },
      ],
    },
    {
      nodeId: 'node.vendor.silence',
      prompt: "Ivo will only speak once. Do you put his name in the ward's record?",
      requires: ['evidence.vendor_testimony'],
      options: [
        {
          optionId: 'protect',
          label: 'Keep Ivo unnamed',
          detail: 'His account enters the record as an anonymous stallholder.',
          effects: [
            { key: 'story.vendor_choice', value: 'protect' },
            { key: 'story.vendor_choice_resolved', value: true },
          ],
          consequenceKeys: ['npc.ivo.stance', 'world.vendor_confidence', 'world.morrow_scrutiny'],
        },
        {
          optionId: 'name',
          label: 'Name Ivo to the ward',
          detail: 'A named witness is harder to dismiss, and easier to find.',
          effects: [
            { key: 'story.vendor_choice', value: 'name' },
            { key: 'story.vendor_choice_resolved', value: true },
          ],
          consequenceKeys: ['npc.ivo.stance', 'world.vendor_confidence', 'world.morrow_scrutiny'],
        },
      ],
    },
    {
      nodeId: 'node.ward.call',
      prompt: 'The call-box is live. What does Aster receive tonight?',
      requires: ['story.relay_choice_resolved', 'story.vendor_choice_resolved'],
      options: [
        {
          optionId: 'file',
          label: 'File the full account',
          detail: 'Every fact you hold goes into the ward record before dawn.',
          effects: [
            { key: 'story.ward_call', value: 'file' },
            { key: 'story.ward_call_resolved', value: true },
          ],
          consequenceKeys: ['story.ending_id', 'world.dispatch_continuity'],
        },
        {
          optionId: 'bury',
          label: 'Close the line',
          detail: 'The account never leaves this street. The ward wakes to nothing.',
          effects: [
            { key: 'story.ward_call', value: 'bury' },
            { key: 'story.ward_call_resolved', value: true },
          ],
          consequenceKeys: ['story.ending_id', 'world.dispatch_continuity'],
        },
      ],
    },
    {
      nodeId: 'node.frequency.puzzle',
      prompt: 'The diner console holds a locked ward channel. Do you tune it?',
      requires: ['evidence.diner_guestbook'],
      options: [
        {
          optionId: 'tune',
          label: 'Lock the 434.8 MHz channel',
          detail: 'Match the guestbook frequency and confirm the depot drop channel.',
          effects: [
            {
              key: 'evidence.surveillance_frequency',
              value: { frequency: '434.8MHz', channel: 'morrow_surveillance', tuned: true },
            },
            { key: 'story.frequency_resolved', value: true },
          ],
          consequenceKeys: ['evidence.surveillance_frequency', 'story.frequency_match'],
        },
        {
          optionId: 'leave',
          label: 'Leave the console untouched',
          detail: 'The channel stays locked. The depot locker will not open without it.',
          effects: [
            { key: 'story.frequency_ignored', value: true },
            { key: 'story.frequency_choice_resolved', value: true },
          ],
          consequenceKeys: ['evidence.surveillance_frequency'],
        },
      ],
    },
    {
      nodeId: 'node.morrow.analysis',
      prompt: 'The Relay 7 core holds three records that disagree. Do you correlate them?',
      requires: ['evidence.override_root', 'evidence.plaza_terminal', 'evidence.archive_record'],
      options: [
        {
          optionId: 'correlate',
          label: 'Correlate the mechanism',
          detail: 'Tie the 03:14 window, the archive order and the root override to one mechanism.',
          effects: [
            { key: 'story.morrow_mechanism', value: 'root_manual_command' },
            { key: 'story.morrow_analysis_resolved', value: true },
          ],
          consequenceKeys: ['story.morrow_mechanism', 'story.ending_id'],
        },
        {
          optionId: 'withhold',
          label: 'Leave the records separate',
          detail: 'You will not be able to explain the termination if you sever MORROW.',
          effects: [
            { key: 'story.morrow_mechanism', value: 'unresolved' },
            { key: 'story.morrow_analysis_resolved', value: true },
          ],
          consequenceKeys: ['story.morrow_mechanism'],
        },
      ],
    },
    {
      nodeId: 'node.morrow.terminate',
      prompt: 'ROOT-BYPASS-008 is loaded. What happens to MORROW tonight?',
      requires: [
        'evidence.override_root',
        'story.morrow_mechanism',
        'evidence.human_cost',
        'evidence.freight_manifest',
      ],
      options: [
        {
          optionId: 'terminate',
          label: 'Sever MORROW from the district relay',
          detail: 'The root key purges the oversight routines. Aster wakes without the watcher.',
          effects: [
            { key: 'story.morrow_terminated', value: true },
            { key: 'story.morrow_termination_resolved', value: true },
          ],
          consequenceKeys: ['story.ending_id', 'world.morrow_scrutiny'],
        },
        {
          optionId: 'spare',
          label: 'Hold the key and walk away',
          detail: 'MORROW keeps watching, but the key stays in your hand.',
          effects: [
            { key: 'story.morrow_spared', value: true },
            { key: 'story.morrow_termination_resolved', value: true },
          ],
          consequenceKeys: ['story.ending_id', 'world.morrow_scrutiny'],
        },
      ],
    },
  ],
  objectives: [
    {
      objectiveId: 'obj_read_relay',
      label: 'Read the Relay 7 terminal',
      detail: 'The north kerb terminal kept counting through the outage.',
      requires: ['evidence.relay_7'],
    },
    {
      objectiveId: 'obj_decide_relay',
      label: 'Decide what happens to the log',
      detail: 'Sable will only discuss the log once you have read it yourself.',
      requires: ['story.relay_choice_resolved'],
    },
    {
      objectiveId: 'obj_find_dispatch',
      label: 'Recover the ward dispatch slip',
      detail: 'The board on the north walk logs the 03:14 runner by hand.',
      requires: ['evidence.ward_dispatch'],
    },
    {
      objectiveId: 'obj_hear_ivo',
      label: "Hear Ivo's account",
      detail: 'The stallholder on the south walk saw the runner leave.',
      requires: ['evidence.vendor_testimony'],
    },
    {
      objectiveId: 'obj_decide_vendor',
      label: 'Decide whether Ivo is named',
      detail: 'Protect the witness or put his name in the record.',
      requires: ['story.vendor_choice_resolved'],
    },
    {
      objectiveId: 'obj_make_call',
      label: 'Make the ward call',
      detail: 'The call-box at the east end of the south walk decides what Aster receives.',
      requires: ['story.ward_call'],
    },
  ],
  endings: [
    {
      endingId: 'ending.open_record',
      title: 'The Open Record',
      summary:
        'The eight minutes enter the public record with the dispatch chain intact. Ivo is never named, and the street wakes to a ledger it cannot bury.',
    },
    {
      endingId: 'ending.sealed_street',
      title: 'The Quiet Street',
      summary:
        'The call is never made. Relay 7 stays dark, Ivo stays safe, and the eight minutes belong only to the people who kept them.',
    },
    {
      endingId: 'ending.ward_inquiry',
      title: 'Ward Inquiry',
      summary:
        'The account reaches the ward, but the chain is broken or a name is exposed. Aster gets an inquiry instead of an answer.',
    },
    {
      endingId: 'ending.second_settlement',
      title: 'The Second Settlement',
      summary:
        'The root key severs MORROW from the district relay. With the human cost in hand, Aster wakes to a street that answers only to itself.',
    },
  ],
});
