'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const appRequire = createRequire(path.join(__dirname, '../../passway-app/package.json'));
const { parse } = appRequire('yaml');
const workflowPath = path.join(__dirname, '../workflows/architecture-checks.yml');
function workflow() { return parse(fs.readFileSync(workflowPath, 'utf8')); }
function runIndex(steps, command) { return steps.findIndex(step => step.run?.trim() === command); }

test('source dependency CI installs pinned remedies before verifying hashes, exploits and upstream conformance', () => {
  const job = workflow().jobs['dependency-security'];
  const steps = job.steps;
  const install = runIndex(steps, 'npm ci');
  const verify = runIndex(steps, 'npm run security:audit');
  const conformance = runIndex(steps, 'npm run security:conformance');
  assert.ok(install >= 0, 'Actual installed dependencies, not a lock-only audit, must be verified');
  assert.ok(verify > install, 'Hash-bound fixes and changed/new advisory checks must follow installation');
  assert.ok(conformance > verify, 'Pinned upstream suites must exercise the verified installed remedies');
  assert.ok(job['timeout-minutes'] >= 10, 'Do not reuse the former lock-only job deadline');
  assert.notEqual(job['continue-on-error'], true);
  for (const step of steps) assert.notEqual(step['continue-on-error'], true);
});

test('source CI preserves raw registry evidence on success and failure without relabeling audit clean', () => {
  const steps = workflow().jobs['dependency-security'].steps;
  const upload = steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(upload, 'Raw audit and installed-code proof must be retained');
  assert.match(upload.uses, /@[a-f0-9]{40}$/);
  assert.equal(upload.if, 'always()');
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(upload.with.path.replace(/\/$/, ''), 'passway-app/security-results');
  assert.ok(upload.with['retention-days'] > 0 && upload.with['retention-days'] <= 7);
  const verifier = fs.readFileSync(path.join(__dirname, '../../passway-app/scripts/security-audit.cjs'), 'utf8');
  assert.ok(verifier.includes('npm-audit-raw.json') && verifier.includes('registry audit is NOT clean'));
});

test('source CI keeps strict backend audit, pinned actions, read-only permissions and policy regressions', () => {
  const w = workflow();
  assert.deepEqual(w.permissions, { contents: 'read' });
  assert.ok(runIndex(w.jobs['dependency-security'].steps, 'npm audit --package-lock-only --omit=dev --prefix functions --audit-level=high') >= 0);
  for (const job of Object.values(w.jobs)) for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
  assert.ok(runIndex(w.jobs.regression.steps, 'node --test ../.github/tests/dependency-gate.test.cjs') >= 0, 'The workflow policy tests must actually run in source CI');
});
