import { HttpsError } from 'firebase-functions/v2/https';

// Bound bytes actually consumed, not just the untrusted Content-Length header.
// One deadline covers the whole stream; trickling chunks cannot reset it.
export async function readJson(request: Request, maxBytes = 16 * 1024, timeoutMs = 5000): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new HttpsError('invalid-argument', 'Request is too large or has an invalid length.');
  }
  if (!request.body) throw new HttpsError('invalid-argument', 'Request data is required.');
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HttpsError('deadline-exceeded', 'Request took too long. Try again.')), timeoutMs);
  });
  try {
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new HttpsError('invalid-argument', 'Request is too large.');
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('invalid-argument', 'Request data is required.');
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // A hostile stream must not hold cleanup open via its cancel promise.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// CORS blocks reading a response, not submitting a simple browser request.
// Native clients normally have no Origin; authentication is still required.
export function assertAllowedOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin === null) return;
  const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw new HttpsError('permission-denied', 'This website is not allowed.');
}
