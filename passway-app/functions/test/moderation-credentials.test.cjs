const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function load({ credential, adc, fetchImpl, realTimers = false } = {}) {
 const timers = [], calls = { configured: 0, adc: 0, http: 0 }; const m = { exports: {} };
 const defaultCredential = { getAccessToken: async () => { calls.configured++; return { access_token: 'synthetic-private-token', expires_in: 3600 }; } };
 const app = { options: { credential: credential === null ? undefined : credential || defaultCredential } };
 const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/moderation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
 vm.runInNewContext(code, { module: m, exports: m.exports, require: name => name === 'firebase-admin/app' ? { getApp: () => app, applicationDefault: () => { calls.adc++; if (!adc) throw Error('Unexpected unrelated ADC'); return adc; } } : { log: { warn() {} } }, process: { env: {} }, Date, AbortController, AbortSignal, setTimeout: realTimers ? setTimeout : callback => { timers.push(callback); return timers.length; }, clearTimeout: realTimers ? clearTimeout : () => {}, fetch: async (...args) => { calls.http++; if (fetchImpl) return fetchImpl(...args); return { ok: true, json: async () => ({ moderationCategories: [] }) }; } });
 return { ...m.exports, timers, calls };
}
test('Google moderation uses the Firebase application credential configured for external hosting', async () => {
 const h = load(); assert.deepEqual(await h.googleModerate('Synthetic text'), []);
 assert.equal(h.calls.configured, 1); assert.equal(h.calls.adc, 0); assert.equal(h.calls.http, 1);
});
test('default credentials are only a fallback when the initialized app has none', async () => {
 const h = load({ credential: null, adc: { getAccessToken: async () => ({ access_token: 'synthetic-adc-token', expires_in: 3600 }) } });
 await h.googleModerate('Synthetic text'); assert.equal(h.calls.adc, 1); assert.equal(h.calls.http, 1);
});
test('one moderation deadline includes stalled credential retrieval, before any HTTP request', async () => {
 const h = load({ credential: { getAccessToken: () => new Promise(() => {}) }, adc: { getAccessToken: () => new Promise(() => {}) } });
 const result = h.googleModerate('Synthetic text'); await tick(); assert.equal(h.timers.length, 1);
 h.timers[0](); await assert.rejects(result); assert.equal(h.calls.http, 0);
});
test('credentials completing after the deadline cannot start a late external content request', async () => {
 let finish; const pending = new Promise(resolve => { finish = resolve; });
 const h = load({ credential: { getAccessToken: () => pending }, adc: { getAccessToken: () => pending } });
 const result = h.googleModerate('Synthetic text'); await tick(); assert.equal(h.timers.length, 1);
 h.timers[0](); await assert.rejects(result); finish({ access_token: 'synthetic-private-token', expires_in: 3600 }); await tick();
 assert.equal(h.calls.http, 0);
});
test('the same deadline includes response body parsing, not only request headers', async () => {
 const h = load({ fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }), adc: { getAccessToken: async () => ({ access_token: 'synthetic-token', expires_in: 3600 }) } });
 const result = h.googleModerate('Synthetic text'); await tick(); assert.equal(h.calls.http, 1); assert.equal(h.timers.length, 1);
 h.timers[0](); await assert.rejects(result);
});
test('moderation request rejects redirects and uses a deadline-bound abort signal', async () => {
 let request; const h = load({ fetchImpl: async (_url, options) => { request = options; return { ok: true, json: async () => ({ moderationCategories: [] }) }; }, adc: { getAccessToken: async () => ({ access_token: 'synthetic-token', expires_in: 3600 }) } });
 await h.googleModerate('Synthetic text'); assert.equal(request.redirect, 'error'); assert.ok(request.signal instanceof AbortSignal); assert.equal(h.timers.length, 1);
});

test('actual moderation credential stall falls back to local rules within the total deadline', { timeout: 6000 }, async () => {
 const h = load({ credential: { getAccessToken: () => new Promise(() => {}) }, realTimers: true });
 const started = performance.now(); const result = await h.screenMessage('A synthetic normal message', 1000);
 assert.equal(result.flag, 'none'); assert.equal(h.calls.http, 0);
 const elapsed = performance.now() - started; assert.ok(elapsed >= 2000 && elapsed < 5000, `Observed bounded fallback after ${elapsed}ms`);
});
