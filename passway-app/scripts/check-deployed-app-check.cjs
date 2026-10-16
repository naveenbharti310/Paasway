const PRODUCTION_URL = 'https://passway-api.vercel.app';
const MAX_BYTES = 4096;
const APP_CHECK_ERROR = 'This app could not be verified.';
const fixtures = Object.freeze({
  otpSend: Object.freeze({ phone: 'not-a-phone-number' }),
  otpVerify: Object.freeze({ challengeId: 'invalid', code: 'invalid' }),
  // Empty callable payloads and absent Auth prevent business mutations even if
  // the deployed App Check boundary is accidentally weakened. Legacy testOtp
  // aliases and scheduled/Firestore triggers are not production client routes.
  ...Object.fromEntries([
    'generateTid', 'redeemTid', 'deactivateTid', 'respondToRequest',
    'endConnection', 'sendMessage', 'getMessages', 'fileReport', 'blockUser',
    'confirmAge', 'deleteAccount',
  ].map(name => [name, Object.freeze({ data: Object.freeze({}) })])),
});

function validateTarget(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' || url.username || url.password ||
    url.port || url.pathname !== '/' || url.search || url.hash ||
    (url.origin !== PRODUCTION_URL &&
      !/^passway-[a-z0-9]+-naveenbharti310s-projects\.vercel\.app$/.test(url.hostname))
  ) throw new Error('Only the production API or an owner-scoped preview is permitted.');
  return url.origin;
}

async function readBoundedJson(response) {
  // A login page, proxy response or unexpectedly large payload is not valid
  // boundary evidence. Cancel bodies that cannot be used rather than buffering
  // arbitrary upstream data. Never include that data in the report.
  const cancel = async () => { try { await response.body?.cancel(); } catch {} };
  if ((response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    await cancel();
    throw new Error('Unexpected response media type.');
  }
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await cancel();
    throw new Error('Response exceeds boundary evidence limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty boundary response.');
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error('Response exceeds boundary evidence limit.');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    try { await reader.cancel(); } catch {}
    reader.releaseLock();
  }
}

async function runChecks({ target = PRODUCTION_URL, bypass, fetchImpl = fetch, now = () => performance.now() } = {}) {
  const origin = validateTarget(target);
  if (bypass && origin === PRODUCTION_URL) {
    throw new Error('A preview-protection credential must not be sent to production.');
  }
  // 26 probes with at most four in flight: seven 15-second waves fit the
  // three-minute CI job budget, unlike a serial 390-second worst case. Requests
  // are never retried; an unavailable route stays failed and visible.
  const probes = Object.entries(fixtures).flatMap(([route, body]) =>
    ['missing', 'invalid'].map(token => ({ route, body, token })));
  const checks = new Array(probes.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, probes.length) }, async () => {
    while (next < probes.length) {
      const index = next++;
      const { route, body, token } = probes[index];
      const headers = { 'content-type': 'application/json' };
      if (bypass) headers['x-vercel-protection-bypass'] = bypass;
      if (token === 'invalid') headers['x-firebase-appcheck'] = 'invalid-test-token';
      const started = now();
      let status = null;
      let pass = false;
      try {
        const response = await fetchImpl(`${origin}/api/${route}`, {
          method: 'POST', headers, body: JSON.stringify(body), redirect: 'error',
          signal: AbortSignal.timeout(15000),
        });
        status = response.status;
        const result = await readBoundedJson(response);
        pass = status === 401 &&
          result?.error?.status === 'UNAUTHENTICATED' &&
          result?.error?.message === APP_CHECK_ERROR;
      } catch {
        // Never serialize exceptions or response bodies: upstream failures can
        // contain request credentials or infrastructure details.
      }
      checks[index] = { route, token, status, pass, durationMs: Math.max(0, Math.round(now() - started)) };
    }
  }));
  return {
    scope: 'Negative attestation rejection only; no SMS or authenticated mutations.',
    target: origin,
    pass: checks.every(check => check.pass),
    checks,
  };
}

module.exports = { validateTarget, runChecks, readBoundedJson, MAX_BYTES };

if (require.main === module) {
  runChecks({
    target: process.env.DEPLOYMENT_URL || PRODUCTION_URL,
    bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  }).then(report => {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.pass ? 0 : 1;
  }).catch(() => {
    console.error('Deployment security check could not run; gate remains failed.');
    process.exitCode = 1;
  });
}