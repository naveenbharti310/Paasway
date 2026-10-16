# Production audit — phased restart

Baseline: `abd9ae23df7261bbb446c0484545492c63bbafcc` (server-anchored connection countdown correction).

That baseline independently passed 484 clean hosted app/backend/rules/Firestore assertions, both typechecks, exports, reviewed installed dependency mitigations and zero SARIF findings. Native run38920011786 passed75/75 on actual emulator API36, both completion markers, coordinator exit0/774.94s. These are isolated/local-service tests, not production SMS, Store licensing/attestation, physical-device or zero-bugs certification.

## Phase 1 — build, dependencies, configuration, CI and provenance

Confirmed changes in this phase:

1. Align the source workflow to the existing installed-hash/exploit/upstream-conformance security gate. Preserve strict backend audit, pinned actions, read-only permissions and raw non-clean registry reports. Three YAML-parsed policy regressions failed before, then passed. The policy tests must also execute in central exact-source CI, with source `.github` included in the immutable archive.
2. Add the mandatory message-read route to negative deployment-attestation checks. A mocked deployment rejecting old routes correctly but returning404 for `getMessages` previously passed the checker; a behavioral regression failed before and passed afterward. Fixtures remain malformed, unauthenticated and non-SMS; positive attestation remains unproven.
3. Correct the source workflow comment: central checks are **dispatched**, not automatically cross-repository triggered. The source personal-account Actions startup block is not repaired by a YAML change.

Gate: rerun clean exact-source hosted policy/unit/rules/integration/export/security/static checks together. Do not inherit native or signed-release acceptance from the baseline commit onto the new phase commit. No new production deployment or signed release in this phase.

Residual blockers, explicitly not concealed by green mitigation tests:
- Registry reports21 high propagated entries from node-forge/braces roots. Fresh official latest versions1.4.0/3.0.3 still have no upstream firstPatchedVersion. Reviewed installed remedies are verified, but **raw audit is NOT clean**.
- Shared local installed dependencies drifted to upstream originals and are not accepted. Clean isolated hosted installs are authoritative.
- Source-repository Actions cannot start under the current account restriction; its edited workflow remains **not executed there**. Shared commands and YAML policy can be tested centrally; that does not fix the account.
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
