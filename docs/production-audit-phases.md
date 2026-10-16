# Production audit — phased restart

Baseline: `abd9ae23df7261bbb446c0484545492c63bbafcc` (server-anchored connection countdown correction).

That baseline independently passed 484 clean hosted app/backend/rules/Firestore assertions, both typechecks, exports, reviewed installed dependency mitigations and zero SARIF findings. Native run38920011786 passed75/75 on actual emulator API36, both completion markers, coordinator exit0/774.94s. These are isolated/local-service tests, not production SMS, Store licensing/attestation, physical-device or zero-bugs certification.

## Phase 1 — build, dependencies, configuration, CI and provenance

Confirmed changes in this phase:

1. Align the source workflow to the existing installed-hash/exploit/upstream-conformance security gate. Preserve strict backend audit, pinned actions, read-only permissions and raw non-clean registry reports. Three YAML-parsed policy regressions failed before, then passed. The policy tests must also execute in central exact-source CI, with source `.github` included in the immutable archive.
2. Add the mandatory message-read route to negative deployment-attestation checks. A mocked deployment rejecting old routes correctly but returning404 for `getMessages` previously passed the checker; a behavioral regression failed before and passed afterward. Fixtures remain malformed, unauthenticated and non-SMS; positive attestation remains unproven.
3. Correct the source workflow comment: central checks are **dispatched**, not automatically cross-repository triggered. The previously observed source Actions startup block is no longer observed in fresh actual execution.

Gate: rerun clean exact-source hosted policy/unit/rules/integration/export/security/static checks together. Do not inherit native or signed-release acceptance from the baseline commit onto the new phase commit. No new production deployment or signed release in this phase.

Residual blockers, explicitly not concealed by green mitigation tests:
- Registry reports21 high propagated entries from node-forge/braces roots. Fresh official latest versions1.4.0/3.0.3 still have no upstream firstPatchedVersion. Reviewed installed remedies are verified, but **raw audit is NOT clean**.
- Shared local installed dependencies drifted to upstream originals and are not accepted. Clean isolated hosted installs are authoritative.
- Source automatic PR checks have now executed successfully on the exact phase-one source; no account-startup blocker is currently observed.
- Production Vercel alias has no gitCommit provenance and does not match the candidate API contract (`getMessages`404). Actual production readiness gate must remain failed until coordinated migration and real acceptance.
- Gemini4 Argon High was selected and used for source audits; it reported no test execution. Its account quota was exhausted and the provider switched its picker to Flash-Lite. No further prompts may be silently sent to that fallback, and no paid upgrade/API is authorized. Continue independent verification; require actual Argon High selection for later provider requests.

## Later phases — not signed off

2. Authentication, authorization and data protection.
3. Transaction consistency, bounded retries, deletion and retention. Argon High pending-request deletion suggestion is backlog only; independently reproduce before changing code.
4. Client flows, offline/foreground recovery, performance and accessibility.
5. Fresh native two-user E2E, signed artifact provenance, licensed Play-installed positive attestation, real production SMS/two-user acceptance and coordinated release.

Within each phase, fix independent confirmed defects together, preserve failing-before evidence, and rerun the phase gate. Do not label external blockers repaired, unexecuted tests passed, or the app bug-free.

### Same-phase follow-up after fresh execution

Source run38923294297 and central38923156272 independently passed488 checks each; source dependency mitigation/conformance gates really executed successfully. The old source-account startup restriction is **no longer observed**, not an active blocker. Restore credential-free automatic PR/main checks now that actual execution works; keep the separate deployed-production gate failed.

An offline Gitleaks8.30.1 scan flagged the public Firebase API identifier hardcoded in web-preview.sh. This was not classified as a proven private-key leak. Inspection found a real unsafe helper configuration: diagnostic App Check off against the live production API, automatic publishing and an unpinned CLI download. The helper now requires explicit public settings and a controlled preview/loopback API, rejects production and release profiles, uses the installed locked Expo CLI, and **builds only**. There is no automatic publication or credential rotation. Its actual shell rejection and configuration cases are tested, and clean source/central CI must exercise the actual controlled build helper. This additional hardening is independently implemented; no new Gemini request was sent after its usage limit.


## Phase 1 clean evidence and Phase 2 entry

Exact source d58e411b5355bede342c94b52b9075b9a3614b0b independently passed source run38925025247 and central38925364553: 4 workflow-policy +152 mobile +225 backend +35 rules +80 real-Firestore =496 assertions **per run**, both typechecks, all exports and actual controlled build-only preview. Static38925370757 has zero SARIF results; offline Gitleaks8.30.1 has zero matches. Installed hash/exploit/conformance proofs passed; raw audit still21 high; forge829 passed/4pending, braces899 passed. Evidence is not production or native acceptance.

All confirmed Phase1 engineering defects are fixed and tested. Deployment mismatch, lack of positive Store attestation and unpatched upstream advisory risk remain explicit release blockers in Phase5, not falsely repaired or hidden by phase progression.

Phase2 adds an exhaustive actual-HTTP production boundary matrix for every callable and OTP route: missing/invalid App Check must fail before Auth/body/provider/database work despite staging bypass settings; valid attestation must never override a revoked identity. This coverage passes locally (42 additional cases, backend267 total). It is coverage strengthening, **not 42 newly reproduced product bugs**.

A separate real local Auth+Firestore integration gate exercises the actual OTP handler with only its SMS provider stubbed, custom-token exchange, verified phone-claim propagation into age-policy hashes, existing phone UID reuse, single-use challenges, and disabled account/token rejection. It requires exact demo-project localhost emulators and rejects credentials/production. It is not real SMS, production cryptographic attestation or a licensed Store run. Clean hosted execution is required before Phase2 signoff.

Gemini quota was previously exhausted; subsequent browser inspection also found the account signed out. No prompt was sent to Flash-Lite. These independent regressions are not misrepresented as Argon-executed tests.


## Phase2 result and Phase3 confirmed fix

Exact source7f460ed01dc8b19f239a214bc718764bb1f889bf: source38926511232 and central38926610673 both **542/542** (4 policy,152 mobile,267 backend,35 rules,80 Firestore,4 actual Auth bridge), static38926614406 zero SARIF. Actual custom-token exchange retains phone_number and age policy phoneHash; the suspected missing-claim defect was **not reproduced**, so no speculative auth claim patch was applied.

Phase3 actual implementation reproduction: deletion returned pending:false/job complete/profile gone, while incoming request and its matching TID remained pending. This is a lifecycle/peer waiting consistency gap; existing account guards prevented acceptance. Eight failing-before unit regressions now cover both directions, bounded25-page resumability, code-generation/request/generator mismatch protection, accepted-after-selection race, malformed legacy references and reads-before-writes. The fix reads/revalidates each request and optional matching code inside the transaction, resolves only still-pending requests involving the deleting account, and expires only the exact matching pending code incarnation. Auth deletion waits until all bounded pages drain. Three real-Firestore pairing/deletion/accept-race cases must pass in clean CI before Phase3 signoff. No unbounded queue/fanout, new paid service or retention-policy weakening is introduced.


## Phase3 clean result / Phase4 client recovery

Exact sourcebc3a4020520d9c779a698bea7681d416ae2d69d0: source38927528187 and central38927562560 independently passed553/553; real-Firestore83 includes both pending-deletion directions and accept/delete race. Static38927565958 has zero SARIF results. Dependency limitations remain unchanged.

Phase4 reproduced a related client gap: actual generator RequestScreen never subscribed to request terminal changes, so peer deletion could leave a stale Accept UI until expiry/API error. Six rendered-component cases failed before, pass after adding a metadata-aware listener with cache-absence, unmount and accepted-navigation race guards. A terminal request disables Accept and offers Start again immediately. Timed Code/Request content is now scrollable for constrained displays without shrinking its content; two rendered structural regressions pass, but actual font-scale/display acceptance requires the new native journey. Mobile160/160 and typecheck pass locally.

Native harness measures716 UI probes consuming510.45s of the prior774.94s run (actual sum in retained native-speed-diagnosis.json is authoritative). This is instrumentation overhead, not production app latency. New native accessibility coverage must set and verify actual440x880 display override/fontScale2, complete real isolated pairing, restore both settings, and write a fresh independent completion marker. Gestures derive coordinates from observed viewport bounds instead of the former fixed970px swipe, which would start outside the smaller display. Harness90 unit tests pass; actual native execution is pending, not passed by these mocks.
