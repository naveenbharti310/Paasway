# Release-boundary remediation (stacked on deep audit)

## Implemented in source, not deployed

### Server-clock message reads

`getMessages` is an authenticated callable, exposed by both existing HTTP and
Cloud Functions routing. It transactionally checks both eligible participant accounts and
an active participant connection, selects at most 200 recent messages (one for a
preview), filters again against the server clock after IO, and returns only
public message fields. Evidence `deleteAt` cannot extend participant read
access. New replies also reject expired target messages.

Client Firestore rules now deny **all** direct message-body reads and writes.
The app watches connection metadata as a change signal and fetches bodies from
the server endpoint. Requests are coalesced, bounded to 15 seconds, guarded
against stale/inflight responses after route changes, errors or chat closure,
and refreshed on foreground. There is no raw-listener or offline-body fallback.
The read endpoint has a per-account 240-request/minute budget. The API's server time plus monotonic elapsed time governs cached UI expiry,
independent of incorrect or changed device wall clocks.

This prevents fetching expired bodies; it cannot retract content previously
seen, screenshots, or adversarial copies. A network response is authorized at
server response time, not a guarantee about when a remote device receives it.
Physical deletion remains eventual, bounded cleanup, distinct from read expiry.

### Recoverable deletion

Before cleanup, a transaction stores a private pending `accountDeletions` job
and changes the profile to `deleting`. Connection creation/acceptance, message
send/read and age confirmation reject that state. Rules reject profile changes,
new notes and profile recreation behind a tombstone. The profile is not removed
until external Firebase Auth deletion succeeds.

Each execution closes at most 25 active connections per participant field,
deactivates 100 codes and removes 100 notes. Partial progress is retryable.
Child message fanout is not performed inside deletion: the ended parent's
retention controls transactional cleanup and any deployed retention trigger.
Existing safety holds are preserved, never lowered from banned. A late report
can recover the pseudonymous phone hash from the short-lived deletion tombstone
and persist a phone safety hold without needing the deleted profile.

Auth outages leave the pending job and deleting profile intact. Retrying after
Auth success/process failure treats `auth/user-not-found` as success. Final
profile removal and job completion are atomic. Completed old-UID tombstones
expire after seven days; no raw phone or DOB is stored in them. This blocks
cached old ID tokens from recreating a profile; a new Firebase account receives
a different UID. Existing maintenance retries one pending job per sweep;
lastAttemptAt ordering rotates failures rather than starving other users.

The app recognizes deleting profiles, provides explicit resume/sign-out UI and
bounds each client recovery attempt. Maintenance is a recovery mechanism, **not
an exact completion SLA**; its frequency/backlog must be monitored. Pending job
attempt counts and last-attempt times provide inspection fields, not a deployed
alerting system. No new paid queue/service is introduced.

### Fail-closed production App Check configuration

The HTTP adapter refuses the staging bypass on Vercel production and deployed
Cloud Run/Functions runtime markers. Cloud callable registration also forces
App Check on in a deployed K_SERVICE runtime. Existing diagnostic preview/test
configuration remains explicit. This prevents a production configuration typo
from bypassing verification; it does not prove store attestation works. Rollout
without first registering/testing the signed client would intentionally fail
closed and is not authorized by this patch.

## Migration / rollout gate (mandatory)

1. Deploy the new deletion-job composite index and confirm it is READY. The
   emulator validates behavior, not production index provisioning.
2. Validate the additive `getMessages` endpoint and deletion recovery in an
   isolated preview/staging deployment with two accounts and App Check.
3. Distribute a freshly built client using the secure read path. The old client
   directly reads bodies and will fail after the rule cutover. Establish and
   communicate a minimum-client-version/cutover policy; there is intentionally
   no insecure compatibility fallback.
4. Coordinate client availability and the deny-body-read rule deployment. Test
   old-client rejection and new-client reconnect/foreground/expiry behavior.
5. Verify actual Play Integrity/App Attest registration/enforcement with the
   store-signed build and signing certificate, then perform staged rollout.
   A diagnostic debug-signed smoke test does NOT establish this.

No production API/rule/index deployment or App Check toggle is performed by
these source changes. Deploying the rules alone is not a safe migration.

## Verification and remaining gates

The expanded inventory is 70 mobile + 171 backend unit/HTTP + 32 rules + 42 real
Firestore integration = 315 automated cases. Includes bounded 26-chat/101-note
deletion, external Auth outage/resume, late safety reports, expired evidence,
server read bounds and client clock skew. TypeScript and platform exports are
separate checks. Hosted verification results are recorded on the pull request.

A clean fresh native build/onboarding smoke is separate from full signed native
E2E. Synthetic demo Firebase configuration and an unreachable API endpoint must
never be presented as production-backend or integrity-attestation proof.

Open release gates: coordinated live migration, store-signed App Check/device
verification, production index readiness and rollout approval, realistic load /
backlog / job-alert budgets, and upstream dependency advisories. Do not force an
Expo major downgrade or suppress a failed security gate to label the app safe.
