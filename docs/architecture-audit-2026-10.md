# Passway end-to-end architecture audit

Scope: source review of mobile entry/navigation, OTP, location, chat/listeners, notifications/diagnostics, callable adapters, account/connection/message/safety handlers, Firestore rules/indexes, retention/cleanup, deployment settings, dependencies and regression automation. This is not an independent penetration test, legal/compliance assessment, physical-device certification or production performance benchmark.

Baseline: source c132e0d8cdb715c34378132e7492960f615bd1bb (previously verified diagnostic candidate). Architecture changes live on a separate branch so that previous native evidence is not misattributed to new code. No production config, deployment, database or real account was changed during this audit. No live SMS was sent by these test suites.

## Current architecture and data path

```
Expo app
  -> device App Check token (release-dependent)
  -> /api/otpSend -> budget reservation -> 2Factor -> short-lived challenge
  -> /api/otpVerify -> 2Factor match -> single-use consumption -> Firebase custom token
  -> Firebase sign-in -> ID token
  -> Vercel Mumbai callable adapter -> Auth + optional App Check + validation
  -> transactional domain handlers -> Firestore
  -> participant-scoped Firestore listeners -> mobile UI
  -> best-effort Expo push (no message text or names)
Cron / successful-request background work -> bounded cleanup batches
```

Real OTP uses 2Factor credits, not Firebase SMS. Firebase fictional numbers in explicitly restricted diagnostic builds send no SMS. Native and web credentials/configuration must match the intended environment. Firebase public client configuration is not an API authorization secret.

## Findings fixed in this branch

| ID | Priority | Evidence / prior weakness | Change and regression coverage |
|---|---|---|---|
| A01 | High | HTTP adapter used verifyIdToken without revoked-session/disabled-user checking | verifyIdToken(token, true); revoked/disabled sessions fail closed; Auth outages return unavailable rather than forcing another SMS login; explicit regressions. This covers Vercel API, not all direct Firestore reads |
| A02 | High | Callable JSON body had no app-level size/read-time limit; OTP loaded whole text before checking length | shared streamed byte limits and whole-read deadline; invalid length, UTF-8, stream failure/stall and hostile cancellation tests |
| A03 | Medium | CORS filtered response visibility but did not reject callable POST mutations from unlisted browser origins | reject supplied disallowed Origin before business logic, while native no-Origin remains supported; never treat Origin as authentication |
| A04 | Medium | Private callable responses lacked explicit cache and content-sniffing controls | no-store and nosniff on callable and OTP success/errors |
| A05 | High reliability | A lost send response followed by retry created duplicate messages, moderation counts and push attempts | sender-scoped stable intent keys and transactional deduplication; actual concurrent Firestore tests plus client intent-state tests |
| A06 | Medium reliability | Push HTTP could hold up a committed mutation with no network deadline | four-second abort and redirect rejection; stalled-fetch tests; still best effort |
| A07 | Medium reliability | OTP could wait indefinitely during device verification/fetch/body parsing; GPS acquisition was unbounded | 20-second OTP and 15-second acquisition deadlines; no automatic resend; late App Check cannot send after timeout |
| A08 | Medium cost/privacy | Rejected traffic still invoked DB-backed maintenance; exception text could leak upstream data to logs | maintenance only after successful HTTP calls; generic exception logs; six rejected-status routing tests |
| A09 | Medium | Billing error recommended diagnostic phone/code in ordinary UI | generic unavailable message; regression prevents test credentials in that message |
| A10 | Medium | New recovery/reliability tests were not a durable CI gate; quota tests depended on wall-clock boundaries | standard mobile test command, secret-free least-privilege pinned-action CI, deterministic quota clock and explicit UTC rollover tests |
| A12 | High release safety | Production build could inherit the diagnostic App Check bypass | build-time rejection of App Check off for the production profile; explicit diagnostic restriction and provider validation tests |
| A11 | Compatibility | Six packages were behind Expo's recommended SDK-57 patch levels | isolated supported patch alignment; new native build/revalidation required; no cross-major downgrade |

## Unresolved release gates — do not label production ready

| ID | Priority | Finding | Required next action |
|---|---|---|---|
| R01 | High privacy | Active-chat rules authorize participants but do not independently deny expired message reads. UI expiry and eventual cleanup are not a strict server-side 72-hour read barrier | Design a server-enforced expiry read path and migration with listener/index/cost tests. Merely adding a time predicate to rules breaks current queries; repeated time-window listeners can multiply billing. Until resolved, do not make an unconditional exact-deletion promise |
| R02 | High abuse | Documented live API/diagnostic builds have App Check off; origin checks and per-account limits do not prove a genuine install | Stage a Play/App Attest-capable signed release and verify tokens before coordinated client/server enforcement. Validate actual production settings; do not copy diagnostic bypass settings |
| R03 | High security gate | Mobile/build tooling initially reported 22 high affected package entries and reports 21 after the supported SDK patch update, arising from two underlying advisories (braces and node-forge); backend production audit is clean | Keep a visible blocking dependency gate. Current latest versions were still affected at audit time. Do not accept npm's suggested Expo-44 major downgrade or claim there are 21 independent exploits. Review upstream fixes/mitigations and real release exposure |
| R04 | High operational | Deletion is a multi-step workflow without a durable deleting-state/saga. Concurrent new writes and partial host failure need explicit lifecycle recovery | Add a versioned deleting state, idempotent job checkpoints/retries, read/write rules and UI recovery together; prove races with integration tests before rollout |
| R05 | Medium/high privacy | Phone hold hashes use a known fixed prefix, not a secret salt/pepper. OTP challenge docs temporarily contain phone/provider session until consumed/expired and swept | Document pseudonymization accurately; design keyed HMAC with secret rotation and legacy-hold migration. Never replace hashing blindly and let banned accounts escape old holds |
| R06 | Medium/high safety | Four-character codes and client-reported location do not prove physical proximity. Moderation is rules-based on the documented free setup and reported users need human review | Define abuse threat model, global/device controls and operational review. App Check does not make GPS truthful. Consider a stronger-code/QR design with product and migration tests |
| R07 | Medium reliability/privacy | Cleanup processes one bounded batch per collection; low traffic or backlog delays physical deletion. Host background jobs and a daily cron are not an exact retention scheduler | Measure oldest eligible record/backlog; add alerting, resumable/leased sweeps and a drain budget. Verify crash recovery and orphaned subcollections; never promise hard deletion from a TTL timestamp alone |
| R08 | Medium reliability | Push has no durable transactional outbox/receipts/retry worker. Current code limits delay but cannot guarantee delivery | Introduce an outbox and provider receipts only with an affordable operating plan, idempotent worker and privacy-safe payload tests |
| R09 | Medium security/operations | Direct Firestore reads rely on request.auth and participant membership, not the API's new revocation check; messages are not application-level end-to-end encrypted | Review banned/revoked-read policy, offline cache policy and rule enforcement. If E2EE is a requirement, use a reviewed protocol rather than custom crypto, and resolve moderation/reporting implications |
| R10 | Release validation | Prior Android 14/16 passes and real-SMS smoke predate this architecture branch, including native dependency updates | New production-signed build, isolated staging API, physical Oppo tests, network/lifecycle/accessibility/long-duration tests, SLO measurements and rollout/rollback approval |

## Security and efficiency decisions

Keep the existing modular architecture (see ADR 0001). Every new service has an operating and billing cost; no paid service is assumed. Use transaction boundaries and deterministic invariants before attempting caching or background delivery that could bypass bans, age gates or report holds. Never cache authorization decisions without a revocation/invalidation policy. Do not retry mutating requests automatically unless their idempotency semantics are specified.

Instrumentation should use generated correlation IDs and aggregate timing/status counters only, not OTPs, token-bearing URLs, message text, dates of birth, phone numbers or precise location. Current changes reduce log payload exposure; they do not introduce a full production monitoring service or claim measured p95 latency.

## Validation and evidence

Final result counts, exact source commit and export checks are recorded in the audit PR and attached/local evidence manifest. Suites cover actual transpiled mobile adapters/state helpers, backend domain/HTTP/security unit tests, Firestore rules and real emulator transactions. Time-controlled module tests are not native-device E2E. The dependency-security gate is intentionally blocking until advisory exposure is resolved/reviewed. No main-branch merge, production deploy, Firebase rule deploy, paid infrastructure purchase or additional live SMS is included.

## Follow-up deep adversarial audit

The stacked `audit/deep-race-retention` branch reproduces additional concurrency
and mobile privacy defects missed by the original regression suite. See
[findings, fixes and remaining release blockers](../passway-app/docs/deep-architecture-audit.md)
and [validation scope](../passway-app/docs/deep-architecture-validation.md). The original native
artifact results must not be attributed to either newer source branch.
