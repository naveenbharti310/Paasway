import { waitUntil } from '@vercel/functions';
import { handleCallable } from '../src/http/server';
import { maybeRunMaintenance } from '../src/services/cleanup';
import { log } from '../src/lib/logger';

// Each callable is served at /api/<name>, for example /api/generateTid.
export async function POST(request: Request): Promise<Response> {
  const name = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
  const response = await handleCallable(request, name);
  waitUntil(maybeRunMaintenance().catch((error) => log.error('Maintenance failed', { error: String(error) })));
  return response;
}
