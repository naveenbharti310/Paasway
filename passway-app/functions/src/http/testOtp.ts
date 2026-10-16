// Server-side 2Factor OTP for testing and release builds. Not exported as
// Firebase callables. Legacy testOtp route names remain for installed test APKs.
import { createHash, randomUUID } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { auth, db } from '../lib/firebase';
import { Timestamp } from 'firebase-admin/firestore';
import { checkAppCheck } from './server';
import { readJson, assertAllowedOrigin } from './request';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const ref = (id: string) => db.collection('rateLimits').doc(`testOtp_${id}`);
const fail = (message: string) => new HttpsError('resource-exhausted', message);
const expired = () => new HttpsError('failed-precondition', 'This code has expired or was already used. Request a new one.');
const DAY = 86400000;

function dailyLimit(): number {
  const value = process.env.TWOFACTOR_DAILY_LIMIT ?? '200';
  const limit = Number(value);
  if (!/^[1-9]\d{0,3}$/.test(value) || limit > 5000) {
    throw new HttpsError('failed-precondition', 'SMS safety settings need attention. Please try again later.');
  }
  return limit;
}

async function provider(parts: string[]): Promise<{ Status?: string; Details?: string }> {
  // Never log the URL, errors, or response: the key and OTP are URL segments.
  try {
    const result = await fetch(`https://2factor.in/API/V1/${encodeURIComponent(process.env.TWOFACTOR_API_KEY!)}/SMS/${parts.map(encodeURIComponent).join('/')}`, {
      signal: AbortSignal.timeout(12000), redirect: 'error', cache: 'no-store',
    });
    const body = await result.json() as { Status?: string; Details?: string };
    if (!result.ok && body.Status !== 'Error') throw new Error();
    return body;
  } catch {
    throw new HttpsError('unavailable', 'The SMS service could not be reached. Wait a minute and try again.');
  }
}

function clientIp(request: Request): string {
  // Vercel overwrites x-forwarded-for on direct deployments. Do not trust
  // user-supplied alternative IP headers. Local tests share one bucket.
  return (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
}

async function send(phone: unknown, request: Request) {
  if (typeof phone !== 'string' || !/^\+91[6-9]\d{9}$/.test(phone)) throw new HttpsError('invalid-argument', 'Enter a 10 digit Indian mobile number.');
  // These are configured as fictional Firebase accounts for this project.
  // A stale Play test script must never send real 2Factor SMS to them when
  // a later, non-diagnostic build is uploaded.
  if (['+919999900001', '+919999900002'].includes(phone)) {
    throw new HttpsError('invalid-argument', 'This number is reserved for automated diagnostics. No SMS was sent.');
  }
  const now = Date.now(), day = Math.floor(now / DAY), hour = Math.floor(now / 3600000);
  const phoneRef = ref(`phone_${hash(phone)}`), ipRef = ref(`ip_${hash(clientIp(request))}`), globalRef = ref('daily');
  const challengeId = randomUUID();
  // Reserve budget before calling the provider, including failed sends. This
  // prevents concurrent requests and provider outages draining SMS credits.
  await db.runTransaction(async (tx) => {
    const [p, i, g] = await Promise.all([tx.get(phoneRef), tx.get(ipRef), tx.get(globalRef)]);
    const pd = p.data(), id = i.data(), gd = g.data();
    if (pd?.sentAt && now - pd.sentAt < 60000) throw fail('Wait 60 seconds before asking for another code.');
    const pc = pd?.day === day ? pd.count : 0;
    const ic = id?.hour === hour ? id.count : 0;
    const gc = gd?.day === day ? gd.count : 0;
    if (pc >= 5) throw fail('This number has reached today’s SMS limit. Try tomorrow.');
    if (ic >= 20) throw fail('Too many messages from this connection. Try again in an hour.');
    if (gc >= dailyLimit()) throw fail('Today’s SMS safety limit has been reached. Try tomorrow.');
    tx.set(phoneRef, { day, count: pc + 1, sentAt: now, challengeId, deleteAt: Timestamp.fromMillis(now + 2 * DAY) });
    tx.set(ipRef, { hour, count: ic + 1, deleteAt: Timestamp.fromMillis(now + 2 * DAY) });
    tx.set(globalRef, { day, count: gc + 1 });
  });
  const result = await provider([phone, 'AUTOGEN', process.env.TWOFACTOR_TEMPLATE_NAME || 'PASSWAY_OTP_2']);
  if (result.Status !== 'Success' || typeof result.Details !== 'string' || !result.Details || result.Details.length > 256) {
    throw new HttpsError('failed-precondition', 'The SMS provider could not send a code. Check the template approval and SMS balance, then try again.');
  }
  await db.runTransaction(async (tx) => {
    tx.set(ref(`session_${challengeId}`), { phone, providerSession: result.Details, expires: Date.now() + 300000, attempts: 0, consumed: false, deleteAt: Timestamp.fromMillis(now + DAY) });
  });
  return { challengeId };
}

async function verify(challengeId: unknown, code: unknown) {
  if (typeof challengeId !== 'string' || !/^[0-9a-f-]{36}$/.test(challengeId) || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'Enter the 6 digit code.');
  }
  const sessionRef = ref(`session_${challengeId}`);
  const session = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef), data = snap.data();
    if (!data || data.consumed || data.expires <= Date.now()) throw expired();
    const active = await tx.get(ref(`phone_${hash(data.phone)}`));
    if (active.data()?.challengeId !== challengeId) throw expired();
    if (data.attempts >= 5) throw fail('Too many incorrect codes. Request a new code.');
    tx.update(sessionRef, { attempts: data.attempts + 1 });
    return data;
  });
  const result = await provider(['VERIFY', session.providerSession, code]);
  if (result.Status !== 'Success' || result.Details !== 'OTP Matched') throw new HttpsError('invalid-argument', 'That code did not match or has expired. Try again or request a new code.');
  // Consume atomically before minting tokens; even simultaneous successful
  // verifications may create only one Firebase session.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef), data = snap.data();
    const active = await tx.get(ref(`phone_${hash(session.phone)}`));
    if (!data || data.consumed || data.expires <= Date.now() || active.data()?.challengeId !== challengeId) throw expired();
    tx.update(sessionRef, { consumed: true, phone: null, providerSession: null });
  });
  let user;
  try { user = await auth.getUserByPhoneNumber(session.phone); }
  catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    try { user = await auth.createUser({ phoneNumber: session.phone }); }
    catch (createError) {
      if ((createError as { code?: string }).code !== 'auth/phone-number-already-exists') throw createError;
      user = await auth.getUserByPhoneNumber(session.phone);
    }
  }
  if (user.disabled) throw new HttpsError('permission-denied', 'This account cannot use Passway right now.');
  return { token: await auth.createCustomToken(user.uid) };
}

export async function handleTestOtp(request: Request, name: string): Promise<Response> {
  const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  const legacy = ['testOtpSend', 'testOtpVerify'].includes(name);
  const enabled = process.env.TWOFACTOR_ENABLED === 'true' || (legacy && process.env.TWOFACTOR_TEST_ENABLED === 'true');
  if ((!legacy && !['otpSend', 'otpVerify'].includes(name)) || !enabled || !process.env.TWOFACTOR_API_KEY) return respond(404, { error: { status: 'NOT_FOUND', message: 'SMS login is not enabled.' } });
  if (request.method !== 'POST') return respond(405, { error: { message: 'Use POST.' } });
  try {
    await checkAppCheck(request);
    assertAllowedOrigin(request);
    const data = await readJson(request, 1024) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpsError('invalid-argument', 'Request data is required.');
    const result = ['otpSend', 'testOtpSend'].includes(name) ? await send(data.phone, request) : await verify(data.challengeId, data.code);
    return respond(200, { result });
  } catch (error) {
    // Provider exceptions must never reach logs or client responses.
    if (error instanceof HttpsError) return respond(error.httpErrorCode.status, { error: error.toJSON() });
    return respond(500, { error: { status: 'INTERNAL', message: 'Could not complete sign-in. Request a new code and try again.' } });
  }
}
