# Cached-missing connection and request transitions

## Captured native failure

Fresh exact-source native run 38885268149 (source `5f89b86`) failed after native acceptance and the first sender message. The peer displayed **Connection ended**, not its composer. The final 60-second composer wait timed out; extending it would not correct a screen that had already navigated away. There was no native completion marker. This is not a pass and it is not proof that the backend pairing-expiry correction failed.

## Reproduced client defect

Firestore may first emit a non-existing document from this device's local cache for a newly created request or accepted connection. Both screen listeners treated all missing documents as authoritative: the chat permanently navigated to Ended; the request screen cleared its pending request. A server snapshot could arrive afterward but the screen/listener was already gone. Callbacks already queued at unmount/route change also lacked retirement guards.

Fourteen focused tests exercise the actual transpiled screen components and subscription callbacks. Nine fail against the original exact-source components; five existing authoritative/error behaviors remain passing. These deterministically reproduce a mechanism consistent with the captured native screen. A fresh native rerun is still required to confirm the correction in the full journey; mock component tests alone do not prove the captured run's sole root cause.

## Correction

- Ignore **only missing cache snapshots**, not server-confirmed missing/ended data or listener errors.
- Subscribe with `includeMetadataChanges: true` so a missing cached result can transition to an authoritative missing server result even when document data is unchanged.
- Leave an unresolved chat without an active connection, so the composer/send remain disabled. Message bodies still come from the independently authorized server endpoint; no offline-body fallback or relaxed Firestore rule is added.
- Retire callbacks during unsubscribe/route change and navigate only once for accepted-request metadata replays.
- Preserve confirmed ending, block/report outcomes, server missing-request errors and declined-request handling.

No test waits, assertions, native driver, backend source, security policy, production deployment or user data are changed by this correction. The 14 tests are included in the normal mobile regression command. Full local/independent and native results must be recorded for the new commit; the failed original native run cannot be relabelled as success.
