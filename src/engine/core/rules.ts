import type { Fact, JsonValue, Rule } from '../contracts/index.js';
import { canonicalJson } from '../core/canonicalJson.js';

export interface AssertedFact {
  key: string;
  value: JsonValue;
  confidence: number;
  sourceRef: string;
}

export interface RuleEvaluation {
  rule: Rule;
  assertedFacts: AssertedFact[];
  endingId: string | null;
}

function valuesEqual(left: JsonValue, right: JsonValue): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/** Pure condition evaluation over a flat value map. */
export function evaluateCondition(
  condition: Rule['condition'],
  values: Readonly<Record<string, JsonValue>>,
): boolean {
  switch (condition.kind) {
    case 'all':
      return condition.of.every((child) => evaluateCondition(child, values));
    case 'any':
      return condition.of.some((child) => evaluateCondition(child, values));
    case 'not':
      return !evaluateCondition(condition.of, values);
    case 'fact': {
      const present = Object.prototype.hasOwnProperty.call(values, condition.key);
      if (condition.op === 'exists') return present;
      if (!present) return false;
      const actual = values[condition.key];
      if (actual === undefined) return false;
      switch (condition.op) {
        case 'eq':
          return valuesEqual(actual, condition.value as JsonValue);
        case 'neq':
          return !valuesEqual(actual, condition.value as JsonValue);
        case 'gte':
          return typeof actual === 'number' && typeof condition.value === 'number'
            ? actual >= condition.value
            : false;
        case 'lte':
          return typeof actual === 'number' && typeof condition.value === 'number'
            ? actual <= condition.value
            : false;
        case 'in':
          return (
            Array.isArray(condition.value) &&
            condition.value.some((candidate) => valuesEqual(actual, candidate))
          );
        default:
          return false;
      }
    }
    default: {
      const exhaustive: never = condition;
      throw new Error(`unhandled condition ${String(exhaustive)}`);
    }
  }
}

/**
 * Deterministic rule order: priority descending, then rule ID ascending by code
 * unit. Effects applied by an earlier rule are visible to later rules in the
 * same pass. There is no fixpoint iteration in Stage 3; a second pass would make
 * chains harder to audit without adding value yet.
 */
export function orderRules(rules: readonly Rule[]): Rule[] {
  return rules
    .filter((rule) => rule.enabled)
    .slice()
    .sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      if (left.ruleId === right.ruleId) return 0;
      return left.ruleId < right.ruleId ? -1 : 1;
    });
}

export function evaluateRules(
  rules: readonly Rule[],
  facts: Readonly<Record<string, Fact>>,
): RuleEvaluation[] {
  const values: Record<string, JsonValue> = {};
  for (const [key, fact] of Object.entries(facts)) {
    values[key] = fact.value;
  }

  const evaluations: RuleEvaluation[] = [];
  for (const rule of orderRules(rules)) {
    if (!evaluateCondition(rule.condition, values)) continue;

    const asserted = new Map<string, AssertedFact>();
    let endingId: string | null = null;

    for (const effect of rule.effects) {
      if (effect.kind === 'assert_fact') {
        values[effect.key] = effect.value;
        asserted.set(effect.key, {
          key: effect.key,
          value: effect.value,
          confidence: effect.confidence,
          sourceRef: effect.sourceRef,
        });
      } else {
        endingId = effect.endingId;
      }
    }

    evaluations.push({ rule, assertedFacts: [...asserted.values()], endingId });
  }

  return evaluations;
}
