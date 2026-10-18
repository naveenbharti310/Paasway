# Production pairing and chat latency repair

## User report

Pairing through a shared code is slow. Sending and receiving messages are slow. Some received messages appear only after leaving the chat and reopening it. These are production symptoms reported by the owner, not new measured physical-device latency samples.

Base source: `e7a37e68a008882a7384a12fbfe4cc1d20820673`. Public Android version at investigation: 0.3.10 (16).

## Independently reproduced causes

1. Both `redeemTid` and `sendMessage` awaited `notifyUser` after committing the operation. Recipient lookup plus the Expo HTTP attempt therefore delayed the successful acknowledgement. The Expo POST budget is four seconds; lookup and other stages add their own time. Two held-push regressions failed on baseline because acknowledgement remained pending after the operation was already saved.
2. Each active connection snapshot incremented the message read generation. If new metadata arrived while `getMessages` was pending, a valid response was discarded. Busy chats could repeatedly suppress visible progress. A deterministic actual-hook regression failed on baseline.
3. After a transient read failure, the chat had no timed recovery. It needed another metadata event, app foreground event or remount. A deterministic actual-hook regression failed on baseline without those external events.
4. The only message invalidation field was a millisecond timestamp. Distinct commits within the same millisecond could leave identical parent data, without a new data-change event for the second message. The repair adds a unique last-message ID to the parent atomically with creation of each new message.

## Repairs

Server responses now hand notification work to a server-internal platform lifecycle callback. Vercel's route supplies its existing `waitUntil` integration. No unretained fire-and-forget work was introduced. Cloud Functions callers without a deferral hook still await notification work. A throwing hook falls back to awaiting, and rejected optional notification work is handled. Authentication, App Check, revocation, consent, blocks, proximity, moderation ordering and message idempotency remain enforced.

The client accepts completed server-authorized responses while coalescing active invalidations into one follow-up fetch. Connection termination and listener errors still invalidate pending responses and clear bodies. Cache-only absence is not treated as authoritative removal. Metadata transitions are observed explicitly.

Transient read failures receive at most two delayed retries, after 500 and 1500 ms. Permission, authentication, ended-connection/precondition and rate-limit errors are not automatically retried. Timers are cleared on unmount or connection invalidation. This is read-only recovery, never automatic resending. Once retries are exhausted, an accessible in-chat action reattaches the subscription without requiring navigation away.

Bodies remain server-only API reads with server-clock expiry. There is no raw Firestore body listener, offline-body fallback, optimistic delivery claim, extra analytics or App Check bypass.

## Verification

* Mobile suite: 287 passed, including 13 additional cases across actual chat-hook and screen-handler tests. Mobile TypeScript passed.
* Backend suite: 505 passed, including nine additional response-lifecycle, metadata and route-wiring cases. Backend and API TypeScript passed.
* Baseline reproduced four failed assertions: two held-push acknowledgements and two chat refresh/recovery cases. This is not inferred success from adding code.
* Coverage includes bounded retries, no automatic retry on access denial/rate limit, queued-retry cancellation, expired message filtering, cache-only absence, in-chat retry, account/route isolation, late responses after termination, coalescing 20 active invalidations, same-clock sends and idempotent replay.
* Native UI tests, authenticated production latency percentiles and real SMS/notification receipt were not newly established by these tests. Production effectiveness must be measured after deployment and a signed client update.

## Independent review and safety

NVIDIA Nemotron Ultra independently identified the push wait, invalidation race and missing recovery. Suggestions to simply remove await or return before starting background work were rejected: serverless hosts must retain the work through their supported lifecycle mechanism. The model's generic unbounded backoff suggestion was replaced with an explicit two-retry budget and authorization-aware handling.

Fresh GPS acquisition may separately add time to pairing, and remote moderation/auth/Firestore can add time to messages. This patch does not cache stale coordinates, weaken verification, disable moderation or claim that every latency source is eliminated.

## Deployment state

Source fixes require protected CI before merge. Server changes need a Vercel deployment; client recovery changes need a new signed Android release. Version16 cannot be silently changed by merging source. Existing saved Vercel authorization was explicitly rejected as invalid during investigation, so no production deployment is claimed by this document.
