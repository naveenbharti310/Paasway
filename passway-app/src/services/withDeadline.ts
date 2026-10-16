// Bound a complete operation, including credential acquisition and response
// parsing. There are deliberately no automatic retries of mutating requests.
export async function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error('This is taking too long. Check your connection and try again.'), { code: 'functions/deadline-exceeded' });
      reject(error);
      controller.abort();
    }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => work(controller.signal)), deadline]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
