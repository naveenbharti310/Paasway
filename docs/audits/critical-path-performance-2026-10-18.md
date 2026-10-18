# Critical path performance and delayed IO audit

## Scope

Follow-up to the real-user pairing and chat latency report. This is a source-level performance and correctness pass, not proof of a production latency percentile or a zero-defect release.

## Live first repair

PR 31 was merged as 820abbeb334b25c16c40276e455e5881c314e783. Exact backend tree was deployed as dpl_9iwLvuXnZUUTeLMvm1DikXijLkCd, tested under deployment protection, then promoted to passway-api.vercel.app. All 28 negative App Check rejection probes passed both before and after promotion. Alias readback confirmed the deployment ID. Previous deployment dpl_CUTTpYkVuPk9M24iUErRHf5KJHFy is recorded as the rollback target.

This removes push recipient lookup and Expo delivery from the HTTP acknowledgement path using Vercel waitUntil. It does not remove moderation, token revocation, proximity, account, consent, or block enforcement. Client live-refresh recovery from that PR still requires an updated installed app.

## Additional reproduced causes and fixes

1. Independent message authorization reads were serialized. Sender account and connection reads now overlap; peer account and directional block checks overlap. Both message authorization transactions remain intact. No message content reaches external moderation before preflight authorization. Every participation check completes before writes or body reads.
2. Redemption serialized requester, prior-intent and code reads. They now share a transaction read wave. Generator and block checks also overlap. Recovery identity, single use, expiry, fresh proximity checks, and reviewer isolation remain unchanged.
3. Acceptance serialized both participant checks and blocks. Independent checks now overlap, including idempotent accepted replays. Decline behavior is unchanged.
4. Repeated metadata-only events with the same unique lastMessageId caused redundant message API reads. Only a known message revision is deduplicated. Older server metadata without a unique revision retains conservative invalidation. New IDs with identical timestamps still refresh. Foreground/manual recovery and terminal status invalidation are not suppressed. No message bodies are added to Firestore-readable metadata.
5. A pending request could expire during authorization IO after the initial acceptance-time check. Acceptance now checks both expiries again at the write boundary and uses that time for the connection creation timestamp.

## Deterministic evidence

Four held-IO message concurrency tests failed before optimization; two security rejection controls already passed. Three further held-IO pairing tests failed before optimization. Duplicate revision test failed before deduplication. Delayed authorization expiry test failed before the commit-boundary recheck. These tests assert ordering and fail-closed behavior rather than unreliable millisecond thresholds on shared CI.

Final local suite: 291 mobile and 515 backend cases, plus both TypeScript checks. Protected CI and the native test result must be checked separately on the exact candidate revision before release.

## Remaining measurements and release constraints

The production API rejection probe timings measure anonymous security rejections only. They are not authenticated send, delivery, GPS, SMS or user-visible latency measurements. Collect cold and warm p50/p95 and paired sender-to-recipient visibility on a Play-installed build in the intended region before making a speed claim.

Inbox visible rows still use per-row message preview reads. This pass reduces duplicate metadata refreshes but does not claim to replace that architecture with a batch feed. Busy inbox load and read-rate budgets need explicit workload measurements. Fresh GPS and network/provider delays remain bounded dependencies, not problems to bypass by removing security. No package/security controls, data retention, billing settings, or production permissions were weakened.

Installed public build 0.3.10 (16) does not automatically acquire client changes when main is merged. A new signed and validated Play version is required. The isolated Android fixture is not a real Play Integrity or real SMS delivery test.
