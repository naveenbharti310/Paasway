import { runCoordinatedMaintenance } from '../src/services/cleanup';

// Called by the Vercel cron in vercel.json. Vercel sends CRON_SECRET as a
// bearer token, so nobody else can trigger the sweep.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await runCoordinatedMaintenance(Date.now(), true);
  return Response.json(result.ran ? result.result : { skipped: true });
}
