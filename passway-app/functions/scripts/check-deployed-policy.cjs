const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const PROJECT = 'passway-2ddc8';
const SCOPE = 'Read-only deployed rule-byte and required composite-index parity. Not native attestation, SMS, retention SLA, or full production acceptance.';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function ruleParity(expected, files) {
  return typeof expected === 'string' && expected.length > 0 &&
    Array.isArray(files) && files.length === 1 &&
    files[0]?.name === 'firestore.rules' && files[0].content === expected;
}

function indexMatches(required, actual) {
  if (!required || !actual || actual.state !== 'READY' ||
    actual.queryScope !== required.queryScope ||
    !Array.isArray(required.fields) || !Array.isArray(actual.fields)) return false;
  const prefix = `projects/${PROJECT}/databases/(default)/collectionGroups/`;
  if (typeof actual.name !== 'string' || !actual.name.startsWith(prefix)) return false;
  const suffix = actual.name.slice(prefix.length).split('/');
  if (suffix.length !== 3 || suffix[0] !== required.collectionGroup ||
    suffix[1] !== 'indexes' || !suffix[2]) return false;
  let fields = actual.fields;
  // Firestore appends a document-name tie-breaker unless explicitly specified.
  if (fields.length === required.fields.length + 1 &&
    fields.at(-1)?.fieldPath === '__name__' &&
    required.fields.at(-1)?.fieldPath !== '__name__') {
    const direction = [...required.fields].reverse().find((f) => f.order)?.order ?? 'ASCENDING';
    if (fields.at(-1).order !== direction) return false;
    fields = fields.slice(0, -1);
  }
  const identity = (f) => JSON.stringify([f.fieldPath, f.order ?? null, f.arrayConfig ?? null, f.vectorConfig ?? null]);
  return fields.length === required.fields.length &&
    fields.every((f, i) => identity(f) === identity(required.fields[i]));
}

async function runCheck({ expectedRules, requiredIndexes, request }) {
  if (typeof expectedRules !== 'string' || !expectedRules ||
    !Array.isArray(requiredIndexes) || !requiredIndexes.length) throw Error('Invalid local policy manifest.');
  const release = await request(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`);
  const prefix = `projects/${PROJECT}/rulesets/`;
  if (typeof release?.rulesetName !== 'string' ||
    !release.rulesetName.startsWith(prefix) ||
    !/^[A-Za-z0-9_-]+$/.test(release.rulesetName.slice(prefix.length))) {
    throw Error('Unexpected deployed rule binding.');
  }
  const rules = await request(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  const indexes = [];
  let pageToken;
  for (let page = 0; page < 10; page++) {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/-/indexes`);
    // Wildcard collection-group listing currently rejects an explicit nonzero
    // pageSize. Omit it, while bounding response bytes and any returned pages.
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const result = await request(url.href);
    if (!result || (result.indexes !== undefined && !Array.isArray(result.indexes))) throw Error('Invalid index response.');
    indexes.push(...(result.indexes ?? []));
    pageToken = result.nextPageToken;
    if (pageToken === undefined || pageToken === '') break;
    if (typeof pageToken !== 'string' || pageToken.length > 8192) throw Error('Invalid index pagination.');
    if (page === 9) throw Error('Index pagination limit exceeded.');
  }
  const files = rules?.source?.files;
  const rows = [{
    name: 'Deployed Firestore rule bytes match reviewed local source',
    pass: ruleParity(expectedRules, files),
  }, ...requiredIndexes.map((index) => ({
    name: `Required ${index.collectionGroup} composite index is READY`,
    pass: indexes.some((actual) => indexMatches(index, actual)),
  }))];
  const finalRelease = await request(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`);
  rows.push({
    name: 'Release binding remained stable throughout observation',
    pass: finalRelease?.rulesetName === release.rulesetName,
  });
  return {
    checkedAt: new Date().toISOString(), project: PROJECT, scope: SCOPE,
    pass: rows.every((r) => r.pass), expectedRulesSha256: sha256(expectedRules),
    deployedRulesSha256: Array.isArray(files) && files.length === 1 &&
      typeof files[0]?.content === 'string' ? sha256(files[0].content) : null,
    rows,
  };
}

async function readJson(response) {
  if (!response.ok || (response.headers.get('content-type') ?? '').split(';')[0] !== 'application/json') {
    try { await response.body?.cancel(); } catch {}
    throw Error('Policy provider request failed.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('Missing policy response.');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw Error('Policy response limit exceeded.');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { try { await reader.cancel(); } catch {} }
}

module.exports = { PROJECT, ruleParity, indexMatches, runCheck, readJson };

if (require.main === module) {
  (async () => {
    // ADC supports developer login, short-lived workload federation or an
    // explicitly supplied credential. Never print or persist the access token.
    const { applicationDefault } = require('firebase-admin/app');
    const token = (await applicationDefault().getAccessToken()).access_token;
    const result = await runCheck({
      expectedRules: fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8'),
      requiredIndexes: JSON.parse(fs.readFileSync(path.join(__dirname, '../../firestore.indexes.json'), 'utf8')).indexes,
      request: async (url) => readJson(await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      })),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.pass ? 0 : 1;
  })().catch(() => {
    console.error('Deployment policy verification failed. No credentials or provider response bodies retained. Gate remains failed.');
    process.exitCode = 1;
  });
}