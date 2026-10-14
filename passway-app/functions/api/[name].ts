import { handleTestOtp } from '../src/http/testOtp';
import { waitUntil } from '@vercel/functions';
import { handleCallable, preflight, withCors } from '../src/http/server';
import { maybeRunMaintenance } from '../src/services/cleanup';
import { log } from '../src/lib/logger';

// Each callable is served at /api/<name>, for example /api/generateTid.
export async function POST(request: Request): Promise<Response> {
  const name = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
  const response = ['testOtpSend', 'testOtpVerify'].includes(name)
    ? await handleTestOtp(request, name)
    : await handleCallable(request, name);
  waitUntil(maybeRunMaintenance().catch((error) => log.error('Maintenance failed', { error: String(error) })));
  return withCors(request, response);
}

export function OPTIONS(request: Request): Response {
  return preflight(request);
}
