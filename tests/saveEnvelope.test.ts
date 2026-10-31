import { describe, expect, it } from 'vitest';
import {
  CONTRACT_NAMES,
  DeterministicGameSession,
  hashCanonical,
  saveEnvelopeSchema,
} from '../src/engine/index.js';
import { createHarness } from './helpers.js';

async function savedEnvelope() {
  const harness = await createHarness();
  harness.session.advanceTick(1);
  const envelope = await harness.session.save();
  return { harness, envelope };
}

describe('SaveEnvelope versioning and integrity', () => {
  it('writes the current save format and all contract versions', async () => {
    const { envelope } = await savedEnvelope();
    expect(envelope.saveFormatVersion).toBe(1);
    expect(Object.keys(envelope.contractVersions).sort()).toEqual([...CONTRACT_NAMES].sort());
    expect(envelope.checksum).toMatch(/^[0-9a-f]{16}$/);
    expect(envelope.engineStateHash).toBe(hashCanonical(envelope.payload));
  });

  it('rejects a newer save format', async () => {
    const { harness, envelope } = await savedEnvelope();
    const deps = {
      clock: harness.clock,
      policy: harness.policy,
      persistence: harness.persistence,
      content: harness.content,
      logger: harness.logger,
    };

    expect(saveEnvelopeSchema.safeParse({ ...envelope, saveFormatVersion: 2 }).success).toBe(false);
    await expect(
      DeterministicGameSession.restore({ ...envelope, saveFormatVersion: 2 }, deps),
    ).rejects.toThrow();
  });

  it('rejects a tampered payload through the checksum', async () => {
    const { harness, envelope } = await savedEnvelope();
    const tampered = {
      ...envelope,
      payload: {
        ...envelope.payload,
        tick: envelope.payload.tick + 5,
      },
    };

    await expect(
      DeterministicGameSession.restore(tampered, {
        clock: harness.clock,
        policy: harness.policy,
        persistence: harness.persistence,
        content: harness.content,
        logger: harness.logger,
      }),
    ).rejects.toThrow(/checksum/);
  });

  it('rejects a forged checksum', async () => {
    const { harness, envelope } = await savedEnvelope();
    await expect(
      DeterministicGameSession.restore(
        { ...envelope, checksum: '0000000000000000' },
        {
          clock: harness.clock,
          policy: harness.policy,
          persistence: harness.persistence,
          content: harness.content,
          logger: harness.logger,
        },
      ),
    ).rejects.toThrow(/checksum/);
  });

  it('rejects unknown or outdated contracts', async () => {
    const { harness, envelope } = await savedEnvelope();
    const deps = {
      clock: harness.clock,
      policy: harness.policy,
      persistence: harness.persistence,
      content: harness.content,
      logger: harness.logger,
    };

    await expect(
      DeterministicGameSession.restore(
        {
          ...envelope,
          contractVersions: { ...envelope.contractVersions, FutureContract: '1.0.0' },
        },
        deps,
      ),
    ).rejects.toThrow(/unknown contract/);

    const outdated = { ...envelope.contractVersions, GameEvent: '0.9.0' };
    const withOutdated = { ...envelope, contractVersions: outdated };
    expect(saveEnvelopeSchema.safeParse(withOutdated).success).toBe(false);
  });
});
