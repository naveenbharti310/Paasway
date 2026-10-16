const PRODUCTION_URL = 'https://passway-api.vercel.app';
const APP_CHECK_ERROR = 'This app could not be verified.';
const fixtures = Object.freeze({
  otpSend: Object.freeze({ phone: 'not-a-phone-number' }),
  otpVerify: Object.freeze({ challengeId: 'invalid', code: 'invalid' }),
  generateTid: Object.freeze({ data: Object.freeze({}) }),
  getMessages: Object.freeze({ data: Object.freeze({}) }),
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

async function runChecks({ target = PRODUCTION_URL, bypass, fetchImpl = fetch } = {}) {
  const origin = validateTarget(target);
  if (bypass && origin === PRODUCTION_URL) {
    throw new Error('A preview-protection credential must not be sent to production.');
  }
  const checks = [];
  for (const [route, body] of Object.entries(fixtures)) {
    for (const token of ['missing', 'invalid']) {
      const headers = { 'content-type': 'application/json' };
      if (bypass) headers['x-vercel-protection-bypass'] = bypass;
      if (token === 'invalid') headers['x-firebase-appcheck'] = 'invalid-test-token';
      let status = null;
      let pass = false;
      try {
        const response = await fetchImpl(`${origin}/api/${route}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        });
        status = response.status;
        const result = await response.json();
        pass = status === 401 &&
          result.error?.status === 'UNAUTHENTICATED' &&
          result.error?.message === APP_CHECK_ERROR;
      } catch {
        // Never serialize exceptions: upstream errors can include request credentials.
      }
      checks.push({ route, token, status, pass });
    }
  }
  return {
    scope: 'Negative attestation rejection only; no SMS or authenticated mutations.',
    target: origin,
    pass: checks.every(check => check.pass),
    checks,
  };
}

module.exports = { validateTarget, runChecks };

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