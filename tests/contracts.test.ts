import { describe, expect, it } from 'vitest';
import {
  CONTRACT_NAMES,
  CONTRACT_REGISTRY,
  CONTRACT_VERSIONS,
  EVENT_TYPES,
  contractFixtures,
  listContracts,
  safeParseContract,
  saveEnvelopeSchema,
} from '../src/engine/index.js';

describe('frozen contract registry', () => {
  it('contains exactly the fifteen agreed contracts', () => {
    expect(CONTRACT_NAMES).toHaveLength(15);
    expect(listContracts().map((contract) => contract.name)).toEqual([...CONTRACT_NAMES]);
    expect(new Set(CONTRACT_NAMES).size).toBe(15);
  });

  it('gives every contract an owner, version and fixtures', () => {
    for (const contract of listContracts()) {
      expect(contract.owner.length).toBeGreaterThan(0);
      expect(contract.version).toBe(CONTRACT_VERSIONS[contract.name]);
      expect(contract.summary.length).toBeGreaterThan(10);
      expect(contract.fixtures.valid).toBeDefined();
      expect(contract.fixtures.invalid).toBeDefined();
    }
  });

  it('accepts every valid fixture', () => {
    for (const name of CONTRACT_NAMES) {
      const result = safeParseContract(name, contractFixtures[name].valid);
      expect(result.success, `${name} valid fixture should parse`).toBe(true);
    }
  });

  it('rejects every invalid fixture', () => {
    for (const name of CONTRACT_NAMES) {
      const result = safeParseContract(name, contractFixtures[name].invalid);
      expect(result.success, `${name} invalid fixture should not parse`).toBe(false);
    }
  });

  it('reports the specific violated constraint for fixtures', () => {
    const fact = safeParseContract('Fact', { ...contractFixtures.Fact.invalid });
    expect(fact.success).toBe(false);
    if (!fact.success) {
      expect(fact.error.issues.some((issue) => issue.path.includes('confidence'))).toBe(true);
    }

    const state = safeParseContract('GameState', contractFixtures.GameState.invalid);
    expect(state.success).toBe(false);
    if (!state.success) {
      expect(state.error.issues.some((issue) => issue.message.includes('does not match fact.key'))).toBe(
        true,
      );
    }
  });

  it('rejects unknown fields instead of silently stripping them', () => {
    const result = safeParseContract('Fact', {
      ...contractFixtures.Fact.valid,
      smuggled: 'value',
    });
    expect(result.success).toBe(false);
  });

  it('documents the full event vocabulary', () => {
    expect(EVENT_TYPES).toHaveLength(10);
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
  });

  it('rejects future save formats before payload parsing', () => {
    const invalid = { ...contractFixtures.SaveEnvelope.valid, saveFormatVersion: 2 };
    expect(saveEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it('keeps all contract versions aligned', () => {
    expect(new Set(Object.values(CONTRACT_VERSIONS))).toEqual(new Set(['1.0.0']));
    expect(new Set(Object.values(CONTRACT_REGISTRY).map((entry) => entry.version))).toEqual(
      new Set(['1.0.0']),
    );
  });
});
