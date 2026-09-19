// js/tests/perf-bundle-budget.test.js
//
// SPEC-PERF-08: the shipped runtime must stay at or under 10 KB gzip with
// both bridges included and zero runtime dependencies. This reads the
// committed resources/dist/ghostwire.js (in CI the js job runs `npm run
// build` right before `npm test`, and security.yml's dist-reproducible job
// proves the committed file equals a fresh build), so the number asserted
// here is the number every Composer consumer receives.
//
// Issue #18 measured the v1.0.0 bundle at 12,847 bytes gzip against this 10 KB
// budget — a breach that shipped because nothing in CI measured it. It is
// bytes, not time: deterministic, and therefore a gate that cannot flake.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUDGET_BYTES = 10 * 1024; // SPEC-PERF-08

describe('SPEC-PERF-08: bundle budget', () => {
  it('ships resources/dist/ghostwire.js at or under 10 KB gzip', () => {
    const raw = readFileSync(path.join(root, 'resources/dist/ghostwire.js'));
    const gzip = gzipSync(raw).length; // zlib's default level, what a web server uses

    expect(gzip, `resources/dist/ghostwire.js is ${gzip} bytes gzip (${raw.length} raw); SPEC-PERF-08 allows ${BUDGET_BYTES}`)
      .toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it('declares zero runtime JS dependencies (SPEC-PERF-08 / SPEC-SEC-08)', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.peerDependencies).toBeUndefined();
  });
});
