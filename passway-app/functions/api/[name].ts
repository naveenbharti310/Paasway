import { handleTestOtp } from '../src/http/testOtp';
import { waitUntil } from '@vercel/functions';
import { handleCallable, preflight, withCors } from '../src/http/server';
import { maybeRunMaintenance } from '../src/services/cleanup';
import { log } from '../src/lib/logger';

// Each callable is served at /api/<name>, for example /api/generateTid.
export async function POST(request: Request): Promise<Response> {
  const name = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
  const response = ['otpSend', 'otpVerify', 'testOtpSend', 'testOtpVerify'].includes(name)
    ? await handleTestOtp(request, name)
    : await handleCallable(request, name);
  // Invalid traffic must not create maintenance DB work; cron covers idle periods.
  if (response.ok) waitUntil(maybeRunMaintenance().catch(() => log.error('Maintenance failed')));
  return withCors(request, response);
}

export function OPTIONS(request: Request): Response {
  return preflight(request);
}
