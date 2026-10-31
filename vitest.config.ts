import { defineConfig } from 'vitest/config';

// Engine tests run in Node on purpose: the deterministic core must never need a
// browser, Phaser or React to execute.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
    passWithNoTests: false,
  },
});
