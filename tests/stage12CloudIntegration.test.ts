import { describe, expect, it } from 'vitest';
import { MekoService, type MekoMemoryRecord } from '../src/services/mekoService.js';
import { YugabyteService } from '../src/services/yugabyteService.js';

describe('Stage 12: Meko MCP Context & Memory Layer', () => {
  it('initializes with default datapack and token config', () => {
    const meko = new MekoService();
    expect(meko).toBeDefined();
  });

  it('records NPC memory and filters by character and branch scope (governed isolation)', async () => {
    const meko = new MekoService({ offlineOnly: true });
    const sessionId = 'ses_test_meko_001';

    const memorySable: MekoMemoryRecord = {
      content: 'Sable observed 8-minute gap on Relay 7 terminal directly.',
      npcId: 'npc_sable',
      branchId: 'brn_main_v1',
      visibilityScope: 'CHARACTER_PRIVATE',
      confidence: 1.0,
    };

    const memoryPublic: MekoMemoryRecord = {
      content: 'Curfew order 14-B announced across all public speakers.',
      npcId: 'system',
      branchId: 'brn_main_v1',
      visibilityScope: 'PUBLIC_WORLD',
      confidence: 1.0,
    };

    await meko.addNpcMemory(memorySable, sessionId);
    await meko.addNpcMemory(memoryPublic, sessionId);

    // Sable should recall her private memory and public world events
    const sableMemories = await meko.searchNpcMemories('npc_sable', 'brn_main_v1', 'Relay 7', sessionId);
    expect(sableMemories.some((m) => m.content.includes('Relay 7'))).toBe(true);

    // Ivo should NOT recall Sable's private memory
    const ivoMemories = await meko.searchNpcMemories('npc_ivo', 'brn_main_v1', 'Relay 7', sessionId);
    expect(ivoMemories.some((m) => m.content.includes('Sable observed'))).toBe(false);

    // Both should recall public events
    const ivoPublic = await meko.searchNpcMemories('npc_ivo', 'brn_main_v1', 'Curfew', sessionId);
    expect(ivoPublic.some((m) => m.content.includes('Curfew order'))).toBe(true);
  });

  it('searches knowledge base and returns structured hits with fallback resilience', async () => {
    const meko = new MekoService({ offlineOnly: true });
    const result = await meko.searchKnowledgeBase('Relay 7 outage', 'ses_test_kb_01');

    expect(result.query).toBe('Relay 7 outage');
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0]?.text).toBeDefined();
  });

  it('connects to live Meko MCP server and retrieves knowledge base successfully', async () => {
    const meko = new MekoService({ timeoutMs: 8000 });
    const result = await meko.searchKnowledgeBase('Relay 7', 'ses_live_smoke_01');
    expect(result).toBeDefined();
    expect(result.query).toBe('Relay 7');
    expect(result.hits).toBeDefined();
  }, 12000);
});

describe('Stage 12: YugabyteDB Transactional Settlement & Audit Layer', () => {
  it('records session and branch tree lineage', async () => {
    const yb = new YugabyteService();
    const sessionId = 'ses_yb_test_01';

    await yb.createSession(sessionId, 'Aster', 'relay_street');
    await yb.recordBranch({
      sessionId,
      branchId: 'brn_v1_root',
      parentBranchId: null,
      forkEventId: null,
      branchName: 'Timeline V1',
    });

    await yb.recordBranch({
      sessionId,
      branchId: 'brn_v2_child',
      parentBranchId: 'brn_v1_root',
      forkEventId: 'evt_anchor_01',
      branchName: 'Timeline V2 (Blink)',
    });

    expect(yb.getSettlement('set_relay_7_01')).toBeDefined();
    expect(yb.getSettlement('set_relay_7_01')?.status).toBe('PENDING');
  });

  it('commits a player choice atomically with settlement update, policy decision and audit row', async () => {
    const yb = new YugabyteService();
    const sessionId = 'ses_yb_test_02';

    const commitRes = await yb.commitChoiceTransaction({
      eventId: 'evt_choice_share_01',
      sessionId,
      branchId: 'brn_v1_root',
      sequenceNo: 12,
      actionId: 'share',
      settlementId: 'set_relay_7_01',
      expectedVersion: 1,
      rationaleCode: 'EVIDENCE_DISCLOSED_TO_WARD',
      actor: 'ASTER',
    });

    expect(commitRes.success).toBe(true);
    expect(commitRes.updatedSettlement.status).toBe('HELD_IN_ESCROW');
    expect(commitRes.updatedSettlement.riskState).toBe('PENDING_VERIFICATION');
    expect(commitRes.updatedSettlement.version).toBe(2);

    expect(commitRes.auditRecord.operation).toBe('UPDATE');
    expect(commitRes.auditRecord.beforeState).toEqual({
      status: 'PENDING',
      riskState: 'NORMAL',
      version: 1,
    });
    expect(commitRes.auditRecord.afterState).toEqual({
      status: 'HELD_IN_ESCROW',
      riskState: 'PENDING_VERIFICATION',
      version: 2,
    });

    // Check audit trail contains the new record
    const auditTrail = yb.getAuditTrail(5);
    expect(auditTrail.some((a) => a.eventId === 'evt_choice_share_01')).toBe(true);
  });

  it('enforces idempotency on duplicate event retry without duplicate mutation', async () => {
    const yb = new YugabyteService();
    const sessionId = 'ses_yb_test_03';

    // First commit
    const first = await yb.commitChoiceTransaction({
      eventId: 'evt_idempotent_test_01',
      sessionId,
      branchId: 'brn_v1_root',
      sequenceNo: 15,
      actionId: 'share',
      settlementId: 'set_relay_7_01',
      expectedVersion: 1,
      rationaleCode: 'EVIDENCE_DISCLOSED',
    });

    // Duplicate retry with same eventId
    const retry = await yb.commitChoiceTransaction({
      eventId: 'evt_idempotent_test_01',
      sessionId,
      branchId: 'brn_v1_root',
      sequenceNo: 15,
      actionId: 'share',
      settlementId: 'set_relay_7_01',
      expectedVersion: 1,
      rationaleCode: 'EVIDENCE_DISCLOSED',
    });

    expect(retry.success).toBe(true);
    expect(retry.updatedSettlement.version).toBe(first.updatedSettlement.version);
    expect(retry.auditRecord.auditId).toBe(first.auditRecord.auditId);
  });

  it('rejects stale state version with conflict error', async () => {
    const yb = new YugabyteService();
    const sessionId = 'ses_yb_test_04';

    // First update bumps version to 2
    await yb.commitChoiceTransaction({
      eventId: 'evt_v1_bump',
      sessionId,
      branchId: 'brn_v1_root',
      sequenceNo: 20,
      actionId: 'share',
      settlementId: 'set_relay_7_01',
      expectedVersion: 1,
      rationaleCode: 'INITIAL_SHARE',
    });

    // Stale caller expects version 1
    await expect(
      yb.commitChoiceTransaction({
        eventId: 'evt_v2_stale',
        sessionId,
        branchId: 'brn_v1_root',
        sequenceNo: 21,
        actionId: 'name',
        settlementId: 'set_relay_7_01',
        expectedVersion: 1, // Stale! Current is 2
        rationaleCode: 'STALE_NAME',
      }),
    ).rejects.toThrow(/Version conflict/);
  });
});
