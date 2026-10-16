import { HttpsError } from 'firebase-functions/v2/https';
import { getAppCheck } from 'firebase-admin/app-check';
import { auth } from '../lib/firebase';
import { runCallable, type CallableHandler } from '../lib/callable';
import { log } from '../lib/logger';
import * as exported from '../index';
import { readJson, assertAllowedOrigin } from './request';

type Callable = { handler: CallableHandler<unknown> };

const callables = new Map<string, CallableHandler<unknown>>(
  (Object.entries(exported) as [string, Partial<Callable>][])
    .filter(([, fn]) => typeof fn.handler === 'function')
    .map(([name, fn]) => [name, fn.handler as CallableHandler<unknown>]),
);

export const callableNames = [...callables.keys()];

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

function failure(error: HttpsError): Response {
  const { status, message } = error.toJSON();
  return reply(error.httpErrorCode.status, { error: { status, message } });
}

async function verifiedAuth(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return undefined;
  try {
    const token = await auth.verifyIdToken(match[1], true);
    return { uid: token.uid, token };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code && new Set(['auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found',
      'auth/invalid-id-token', 'auth/argument-error', 'auth/invalid-argument', 'auth/tenant-id-mismatch']).has(code)) {
      throw new HttpsError('unauthenticated', 'Sign in again.');
    }
    // Fail closed, but do not tell users to reauthenticate (and buy another SMS)
    // merely because the Auth service or server credentials are unavailable.
    throw new HttpsError('unavailable', 'Sign-in verification is temporarily unavailable. Try again shortly.');
  }
}

export async function checkAppCheck(request: Request): Promise<void> {
  const production = process.env.VERCEL_ENV === 'production' || (!!process.env.K_SERVICE && process.env.FUNCTIONS_EMULATOR !== 'true');
  if (process.env.ENFORCE_APP_CHECK === 'false' && !production) return;
  const token = request.headers.get('x-firebase-appcheck');
  if (!token) throw new HttpsError('unauthenticated', 'This app could not be verified.');
  try {
    await getAppCheck().verifyToken(token);
  } catch {
    throw new HttpsError('unauthenticated', 'This app could not be verified.');
  }
}

// Serves the Firebase callable protocol so the app can call the same handlers
// on a host other than Cloud Functions. The request body is {"data": ...} and
// the reply is {"result": ...} or {"error": {"status", "message"}}.
export async function handleCallable(request: Request, name: string): Promise<Response> {
  const handler = callables.get(name);
  if (!handler) return reply(404, { error: { status: 'NOT_FOUND', message: 'Not found.' } });
  if (request.method !== 'POST') return reply(405, { error: { status: 'INVALID_ARGUMENT', message: 'Use POST.' } });
  try {
    assertAllowedOrigin(request);
    await checkAppCheck(request);
    const callerAuth = await verifiedAuth(request);
    if (!callerAuth) throw new HttpsError('unauthenticated', 'Sign in first.');
    const body = await readJson(request) as { data?: unknown } | null;
    const result = await runCallable(handler, callerAuth, body?.data);
    return reply(200, { result: result ?? null });
  } catch (error) {
    if (error instanceof HttpsError) return failure(error);
    // Never log exception text: upstream messages can contain content or secrets.
    log.error('Callable failed', { name });
    return failure(new HttpsError('internal', 'Something went wrong. Try again.'));
  }
}

// Browsers only allow the web preview to call this server when its address is
// listed in ALLOWED_ORIGINS (comma separated). The phone app is not affected.
function allowedOrigin(request: Request): string | undefined {
  const origin = request.headers.get('origin');
  if (!origin) return undefined;
  const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : undefined;
}

export function withCors(request: Request, response: Response): Response {
  const origin = allowedOrigin(request);
  if (origin) {
    response.headers.set('access-control-allow-origin', origin);
    response.headers.set('vary', 'origin');
  }
  return response;
}

export function preflight(request: Request): Response {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, x-firebase-appcheck, x-firebase-gmpid, x-firebase-client, x-client-version',
      'access-control-max-age': '3600',
      vary: 'origin',
    },
  });
}
