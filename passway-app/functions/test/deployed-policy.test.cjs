const test = require('node:test');
const assert = require('node:assert/strict');
const { PROJECT, ruleParity, indexMatches, runCheck, readJson } = require('../scripts/check-deployed-policy.cjs');
const source = "rules_version = '2';\n";
const required = { collectionGroup: 'accountDeletions', queryScope: 'COLLECTION', fields: [
  { fieldPath: 'status', order: 'ASCENDING' }, { fieldPath: 'lastAttemptAt', order: 'ASCENDING' },
] };
const actual = () => ({ ...required, name: `projects/${PROJECT}/databases/(default)/collectionGroups/accountDeletions/indexes/one`, state: 'READY',
  fields: [...required.fields, { fieldPath: '__name__', order: 'ASCENDING' }] });
function request({ content = source, name = `projects/${PROJECT}/rulesets/accepted`, indexes = [actual()], pages } = {}) {
  let page = 0;
  return async (url) => {
    if (url.endsWith('/releases/cloud.firestore')) return { rulesetName: name };
    if (url.includes('/rulesets/')) return { source: { files: [{ name: 'firestore.rules', content }] } };
    return pages ? pages[page++] : { indexes };
  };
}
const check = (options) => runCheck({ expectedRules: source, requiredIndexes: [required], request: request(options) });

test('exact reviewed policy and READY composite index pass', async () => assert.equal((await check()).pass, true));
test('old deployed rule bytes fail despite working API', async () => assert.equal((await check({ content: 'old rules' })).pass, false));
test('missing source files fail closed', () => assert.equal(ruleParity(source, undefined), false));
test('extra source files cannot hide rule drift', () => assert.equal(ruleParity(source, [{ name: 'firestore.rules', content: source }, {}]), false));
test('wrong rule filename is not accepted', () => assert.equal(ruleParity(source, [{ name: 'other', content: source }]), false));
test('building index fails readiness', () => assert.equal(indexMatches(required, { ...actual(), state: 'CREATING' }), false));
test('missing index fails readiness', async () => assert.equal((await check({ indexes: [] })).pass, false));
test('wrong collection scope fails', () => assert.equal(indexMatches(required, { ...actual(), queryScope: 'COLLECTION_GROUP' }), false));
test('different project index is rejected', () => assert.equal(indexMatches(required, { ...actual(), name: actual().name.replace(PROJECT, 'another') }), false));
test('field order remains significant', () => assert.equal(indexMatches(required, { ...actual(), fields: [...required.fields].reverse() }), false));
test('wrong field direction fails', () => assert.equal(indexMatches(required, { ...actual(), fields: [{ ...required.fields[0], order: 'DESCENDING' }, required.fields[1]] }), false));
test('different array configuration fails', () => assert.equal(indexMatches(required, { ...actual(), fields: [{ fieldPath: 'status', arrayConfig: 'CONTAINS' }, required.fields[1]] }), false));
test('implicit document-name direction cannot hide index drift', () => {
  const index = actual();
  index.fields.at(-1).order = 'DESCENDING';
  assert.equal(indexMatches(required, index), false);
});
test('required index can be found on next page', async () => assert.equal((await check({ pages: [{ indexes: [], nextPageToken: 'next' }, { indexes: [actual()] }] })).pass, true));
test('wildcard index listing does not send unsupported explicit pageSize', async () => {
  const normal = request();
  const result = await runCheck({
    expectedRules: source, requiredIndexes: [required],
    request: (url) => {
      if (url.includes('/collectionGroups/-/indexes')) assert.equal(new URL(url).searchParams.has('pageSize'), false);
      return normal(url);
    },
  });
  assert.equal(result.pass, true);
});
test('endless pagination is bounded', async () => assert.rejects(check({ pages: Array.from({ length: 10 }, () => ({ nextPageToken: 'again' })) }), /pagination limit/));
test('foreign ruleset binding cannot redirect credentialed request', async () => assert.rejects(check({ name: 'https://example.invalid/rulesets/x' }), /binding/));
test('ruleset path traversal cannot redirect credentialed request', async () => assert.rejects(check({ name: `projects/${PROJECT}/rulesets/../other` }), /binding/));
test('invalid local manifests fail before network access', async () => assert.rejects(runCheck({ expectedRules: '', requiredIndexes: [], request: () => { throw Error('Must not execute'); } }), /manifest/));
test('transport errors propagate to failed operator gate', async () => assert.rejects(runCheck({ expectedRules: source, requiredIndexes: [required], request: async () => { throw Error('transport'); } }), /transport/));
test('concurrent release change fails the parity gate', async () => {
  let bindings = 0;
  const normal = request();
  const report = await runCheck({
    expectedRules: source, requiredIndexes: [required],
    request: (url) => url.endsWith('/releases/cloud.firestore') && ++bindings === 2
      ? { rulesetName: `projects/${PROJECT}/rulesets/changed` } : normal(url),
  });
  assert.equal(report.pass, false);
});
test('invalid provider index shape fails closed', async () => assert.rejects(check({ pages: [{ indexes: {} }] }), /index response/));
test('successful report has no rule body or credential fields', async () => {
  const report = await check();
  assert.equal(JSON.stringify(report).includes(source), false);
  assert.equal('token' in report, false);
  assert.equal(report.expectedRulesSha256, report.deployedRulesSha256);
});
test('non-JSON provider response fails closed', async () => assert.rejects(readJson(new Response('login', { headers: { 'content-type': 'text/html' } }))));
test('provider authorization failure fails closed', async () => assert.rejects(readJson(new Response('{}', { status: 403, headers: { 'content-type': 'application/json' } }))));
test('oversized provider payload is bounded', async () => assert.rejects(readJson(new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'content-type': 'application/json' } })), /limit/));
test('small JSON provider response is accepted', async () => assert.deepEqual(await readJson(new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })), { ok: true }));