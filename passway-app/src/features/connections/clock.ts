// Server wall time plus monotonic elapsed time avoids device clock skew. The
// request-start anchor conservatively includes network latency; only the server
// authorizes redemption/acceptance. Older API responses retain the legacy clock.
export interface ConnectionClock { at: number; startedAt: number }
export function connectionClock(at: number | undefined, startedAt: number): ConnectionClock | undefined {
  return typeof at === 'number' && Number.isFinite(at) && at > 0 && Number.isFinite(startedAt)
    ? { at, startedAt } : undefined;
}
export function connectionNow(clock?: ConnectionClock): number {
  return clock && Number.isFinite(clock.at) && Number.isFinite(clock.startedAt)
    ? clock.at + Math.max(0, performance.now() - clock.startedAt) : Date.now();
}
export function remainingSeconds(expiresAt: number, clock?: ConnectionClock): number {
  return Math.max(0, Math.ceil((expiresAt - connectionNow(clock)) / 1000));
}
