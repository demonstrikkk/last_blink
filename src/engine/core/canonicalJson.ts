/**
 * Deterministic JSON serialisation.
 *
 * Object keys are sorted, `-0` is normalised to `0`, and anything that is not a
 * JSON value (undefined, functions, symbols, bigint, NaN/Infinity, class
 * instances, Date) throws. Hashing must never depend on insertion order.
 */
export function canonicalJson(value: unknown): string {
  return write(value, new Set());
}

function write(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError('canonicalJson: non-finite numbers are not valid JSON');
      }
      return JSON.stringify(value === 0 ? 0 : value);
    case 'object':
      break;
    default:
      throw new TypeError(`canonicalJson: unsupported ${typeof value} value`);
  }

  const object = value as object;
  if (ancestors.has(object)) {
    throw new TypeError('canonicalJson: circular reference');
  }
  ancestors.add(object);

  try {
    if (Array.isArray(object)) {
      return `[${object.map((entry) => write(entry, ancestors)).join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(object) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('canonicalJson: only plain objects are supported');
    }

    const record = object as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const entry = record[key];
      if (entry === undefined) {
        throw new TypeError(`canonicalJson: undefined value at key "${key}"`);
      }
      parts.push(`${JSON.stringify(key)}:${write(entry, ancestors)}`);
    }
    return `{${parts.join(',')}}`;
  } finally {
    ancestors.delete(object);
  }
}
