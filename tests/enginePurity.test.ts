import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_ROOT = join(process.cwd(), 'src', 'engine');

function engineFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...engineFiles(path));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

const FORBIDDEN: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /from\s+['"]phaser['"]/, reason: 'Phaser import' },
  { pattern: /from\s+['"]react(-dom)?['"]/, reason: 'React import' },
  { pattern: /from\s+['"]node:/, reason: 'Node builtin import' },
  { pattern: /from\s+['"]crypto['"]/, reason: 'crypto import' },
  { pattern: /\bwindow\b/, reason: 'window global' },
  { pattern: /\bdocument\b/, reason: 'document global' },
  { pattern: /\blocalStorage\b/, reason: 'localStorage global' },
  { pattern: /\bindexedDB\b/, reason: 'indexedDB global' },
  { pattern: /\bMath\.random\b/, reason: 'unseeded randomness' },
  { pattern: /\bDate\.now\b/, reason: 'wall clock read' },
  { pattern: /\bfetch\s*\(/, reason: 'network call' },
];

describe('engine purity', () => {
  const files = engineFiles(ENGINE_ROOT);

  it('finds the engine source tree', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('contains no browser, React, Phaser or network dependencies', () => {
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(source)) {
          violations.push(`${relative(process.cwd(), file)}: ${rule.reason}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('does not import from UI, game or tooling layers', () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (/from\s+['"][^'"]*\/ui\//.test(source)) violations.push(`${file}: ui import`);
      if (/from\s+['"][^'"]*\/game\//.test(source)) violations.push(`${file}: game import`);
    }
    expect(violations).toEqual([]);
  });
});
