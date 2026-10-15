# Deep architecture audit: concurrency, data isolation and retention

## Method and honest scope

This pass extends the architecture-hardening branch. It uses deterministic
fault injection around **real Firestore emulator** candidate queries and
transactions, plus tests executing the actual transpiled mobile hooks with
controlled React state/effects, listener delivery, timers and AppState.
These are not screenshots, simulated backend assertions, or a native device
certification. The hook harness mocks React/native/Firestore bindings; a signed
native build still needs device validation. No production deployment or SMS
is performed by this audit.

The first backend experiment preserved all 17 existing integration passes and
failed five newly added adversarial cases. The first valid mobile experiment
failed six newly added privacy/expiry cases. A syntax error in the first draft
of the hook harness was corrected before those mobile results were recorded;
it is not an application defect.

## Reproduced findings and changes

| Finding | Consequence | Fix / regression evidence |
| --- | --- | --- |
| Expiry query results were deleted without revalidation | A report committed after candidate selection could lose evidence | Re-read candidates transactionally before deletion; deterministic report/query interleaving test |
| Parent evidence hold could precede child retention propagation | Cleanup could delete children before the retention repair finished | Read the parent inside the same transaction and repair expired child retention to its future ended-parent hold |
| Parent and child cleanup pages were independently bounded | More than 300 children could leave orphaned message subcollections | Keep ended parent until a transaction query confirms there are no children; test with 301 children over two sweeps |
| Pending request acceptance did not recheck blocks | A block after redemption could be bypassed | Recheck both directional block records inside the acceptance transaction |
| Lost acceptance acknowledgement was not retryable | A successful action looked failed; retry could not recover its connection ID | Same-decision replay returns only the original active pairing; no new connection; opposite decisions, wrong caller, ended pairing, banned account rejected |
| Chat rows and private notes were not identity-scoped | Previous-account state could render during an account switch | Scope state to identity at render time; ignore callbacks after unsubscribe; immediate-switch and queued-callback tests |
| Latest-message state was not connection-scoped | Previous-chat content could flash under a different row | Scope preview state and suppress stale callbacks |
| Message visibility relied on snapshots / evidence deleteAt | Expired previews remained; longer safety holds could extend visible lifetime | Shared sentAt + 72-hour visibility, expiry timers, foreground refresh, route/account-scoped message list; expired reply/action selection cleared |
| Chat subscription errors were silently treated as empty/stale success | Missing or inaccessible chats were misleading | Clear failed subscription data and expose a generic load-error banner |

Cleanup transactions use at most 25 selected candidate documents per chunk,
not an unbounded transaction or 300 sequential per-document transactions.
All reads precede writes. Candidates whose retention was extended are kept.
Active parents with an erroneous expired marker are not deleted. This adds
reads versus blind batch deletion: the safety tradeoff is intentional; hosted
regressions do not substitute for production latency/cost measurements.

Acceptance idempotency lasts only while the accepted request record and its
active pairing exist. It is not an indefinite deduplication ledger. Decline
retries are same-decision-only. No retry reopens an ended connection.

## Release blockers deliberately not hidden

1. **Strict server-side 72-hour read expiry remains open.** The mobile fix is
   visibility, not a server access control. Existing Firestore rules still let
   active participants read retained expired messages. Changing rules alone
   breaks the current list queries. A coordinated server-controlled read path,
   query/index/rules migration and reconnect tests are required. Ended chats are
   denied to participants, but long-lived active-chat reads are the open gap.
2. **Account deletion is not a durable saga.** It queries and ends existing
   chats before deleting the profile/Auth record, without a deleting tombstone
   that all writers observe. Concurrent creation and partial external Auth
   failure need a persisted deletion state, idempotent recovery worker, client
   recovery UX, and rules coverage. This pass does not pretend that adding a
   status string alone safely solves this migration.
3. **App Check rollout remains unverified in production.** A build guard rejects
   an explicit bypass in the production profile; it does not establish actual
   Play Integrity/App Attest enforcement across deployed read/write paths.
4. **Build-tool dependency advisories remain a blocking gate.** Previous audit
   found two underlying advisories propagated to 21 high affected entries
   (`braces`, `node-forge`). Keep the dependency-security job visibly failing
   until a supported compatible upstream fix or documented isolation is
   independently verified. Do not force a major Expo downgrade to silence it.
5. **Direct Firestore access has different auth boundaries from the HTTP API.**
   API token revocation checks do not automatically revoke cached/offline data
   or apply identical checks to direct listeners. No application-level E2EE is
   implemented. Device caches and screenshots are outside the 72h UI guarantee.
6. **Maintenance is bounded and eventual, not a retention SLA.** Daily cron and
   opportunistic sweeps can leave a backlog. Transactional deletion prevents
   the reproduced races; it does not guarantee immediate physical deletion,
   cascade damaged legacy records, or provide durable scheduling/recovery.
7. **Push delivery is best effort, not a durable outbox.** Fetch timeouts are not
   a delivery receipt/retry system. Notifications must not be treated as proof
   that another participant received a message.
8. **Abuse and identity limitations remain.** Four-character codes and supplied
   GPS do not prove physical proximity. Phone hold hashes are deterministic,
   not secret-HMAC anonymization. Changing the key scheme requires preserving
   existing safety holds. Human moderation/review and support operations are
   not certified by automated tests.
9. **Scale/device evidence remains incomplete.** Chat-list listeners and
   retention paging need realistic fanout/backlog/load budgets; native
   Android/iOS rebuild, OEM keyboard, accessibility and physical-device checks
   are still required for the new source. Prior native passes were on an older
   diagnostic artifact and are not claimed for this branch.

## Appropriate technology choices

Use transactional invariants, same-intent idempotency, scoped subscriptions,
fault injection, emulator-backed integration, pinned CI and exact-source
provenance first. Add a durable job/outbox/deletion state machine where the
above reliability gaps require it. A new model provider, emulator vendor,
microservice or queue does not by itself establish these invariants. No new
paid service is introduced.
