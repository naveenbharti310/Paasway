# Post-publication audit, 18 October 2026

## Scope and provenance

This audit distinguishes published binary inspection, local source execution, live negative API probes and proposed source fixes. It does not certify zero bugs or full production acceptance.

Published Android package: `com.passway.app`, version `0.3.10`, version code `16`, India production release.

Reviewed main source: `736d469c5b7b36be52bc31f2975431c38eb920e4`. Its mobile source, excluding functions, has no diff from the recorded signed client source `ea06c8e8a75d7f082f99582114c7276710d66db8`.

Play-generated standalone APK retrieved from retained Actions artifact `12114376438`, run `39068479077`. Actual APK SHA256 recomputed: `a720d0447c99d9fe236193f90653ee1276015d7fb8b00dd632085872d9b110dc`. This universal APK's size is not a device-specific Play split download size. Recorded original AAB SHA256: `271ae895d37ffc943fac49a2dd662a1d2af229bcd58157ee1574d685316d7c02`; the AAB was not re-downloaded in this audit.

Neither fixes below nor this document change the published APK. A new tested signed release is required to deliver client changes.

## Confirmed defects and narrow source fixes

### OTP recipient display race

On the original screen, a delayed SMS request can complete after the editable phone field has changed. The verification screen displays the mutable phone field, not the phone bound to that request. This is misleading recipient presentation, not a demonstrated authentication bypass.

Fix: retain the canonical request recipient when the challenge succeeds, use that recipient for resends and the verification label, disable and synchronously guard phone editing during requests, and clear recipient state when choosing another number. Existing server-side verification and App Check are unchanged.

Six actual TSX handler regressions cover the recipient race, input lock, same-render duplicate sends, failed resend retaining the existing confirmation, choosing a different number, and retry after a failed initial send. Two initial regression assertions failed on the old implementation. These are deterministic tests with replaced network/native dependencies, not real SMS execution.

### Stale push enrollment across same-account device changes

The manager caches the last locally saved token. If phone B replaces an account's single server token, a later explicit registration on still-running phone A skips its write because A's cached token is unchanged. The server remains registered to B. Reproduced using the actual TypeScript manager with a stub shared server store.

Fix: invalidate only the UID's saved-token memo when starting a new explicit registration. Keep in-flight registration single-flight, supplied-token refresh handling, write serialization and callback deduplication intact. Two new regressions fail before this change and pass after it.

This preserves the current single-token-per-account policy. It does not implement simultaneous multi-device delivery or prove actual notification receipt.

## Google Play optimization findings still open

1. Console reports DEX code obfuscation at 2 percent and a February 2027 optimization warning. `expo-build-properties` config has no Android release minification or resource-shrink override. Candidate configuration should explicitly enable `enableMinifyInReleaseBuilds` and `enableShrinkResourcesInReleaseBuilds` together, but must first build with R8, retain mappings and validate the resulting exact native binary, Firebase flows and reflection-dependent libraries. No optimization success is claimed from editing configuration alone.
2. Android 15 edge-to-edge warnings include React Native status-bar/window utilities and Google Material dialog APIs. Dependency-level migration and exact-binary testing are needed; deleting a JavaScript status-bar call is not evidence that all deprecated APIs are removed.
3. The manifest requests portrait orientation. Android 16 large-screen behavior can ignore orientation restrictions. Tablet, foldable and landscape layout verification remains necessary before changing this restriction. Existing large-font screenshots also do not establish that every scroll position is correct.

References:

https://developer.android.com/topic/performance/vitals/code-optimization

https://developer.android.com/about/versions/16/behavior-changes-16#large-screens-form-factors

## Published binary checks

Decoded manifest confirms target SDK 36, minimum SDK 24, no debuggable flag, `allowBackup=false`, modern data extraction rules and legacy backup rules. Actual packaged XML excludes root, files, databases, shared preferences, external and device-protected app data from cloud backup and device transfer.

All inspected 64-bit native libraries passed ELF PT_LOAD alignment/congruence and uncompressed ZIP data 16 KB alignment checks. There were 92 native libraries across all ABIs. This is static compatibility inspection, not execution on a physical 16 KB page-size device.

No SMS-reading, contacts, broad storage or overlay permissions were found in the inspected manifest. Firebase auth redirect activities are expected exported components; exported Google service/receiver entries inspected had protective permissions where applicable. Cleartext default is false at the target SDK; this is not a full runtime traffic interception test.

## Verification ledger

* Baseline mobile tests: 266 passed.
* Mobile tests with the two fixes and eight added cases: 274 passed; TypeScript check passed.
* Backend unit tests: 496 passed; backend TypeScript checks passed. No backend production code changed in this patch.
* Installed dependency security regressions: 18 passed, with exact remediation file hashes verified.
* Backend production npm registry audit: zero reported vulnerabilities at the observation time.
* Mobile raw npm audit: 21 high, zero critical, associated with two reviewed build-tool advisories. The registry audit is NOT clean. Tracked hash-bound local remedies for node-forge and braces pass their exploit regressions. These results do not cover every Android/Maven dependency.
* Live public API boundary probe: all 28 missing/invalid App Check probes rejected as expected, maximum observed request duration 379 ms. No authentication credential, real SMS or business mutation was used. These negative probes do not prove positive Play Integrity, API p95 latency or authenticated flows.

The first dependency test attempt reused an older dependency installation and failed five tests. A fresh `npm ci` in the isolated checkout ran the project's tracked postinstall remediations and passed all 18. This is an audit setup correction, not evidence of a new production code repair. Do not reuse unverified node_modules or skip lifecycle security checks.

## Additional improvement gaps, not completed fixes

* Server push sending inspects immediate Expo tickets but does not collect subsequent delivery receipts or prune invalid registrations. Ticket acceptance is not delivery evidence. A bounded receipt worker and device-token lifecycle design should precede any reliable-delivery claim.
* Production Crashlytics automatic collection is disabled. This is privacy-conscious but limits production crash observability; Android Vitals data is currently unavailable. Enabling more telemetry requires a documented privacy/data-safety review, not a silent configuration flip.
* Saved-token/revision caches retain entries for past UIDs in a long-lived process. The explicit-enrollment fix addresses stale routing, not comprehensive cache eviction. Any eviction must preserve in-flight write ordering and avoid stale-task/ABA races.
* Real two-user Play-installed lifecycle acceptance, real SMS delivery, positive store attestation, background delivery, offline recovery and physical-device matrix testing have not been newly established by this audit. Older emulator evidence must retain its original exact-source and isolated-environment scope.

## Independent NVIDIA review

The requested model `nvidia/nemotron-3-ultra-550b-a55b` returned a thinking-enabled source review. Its initial findings were treated as hypotheses, not authoritative instructions. The proposed startup timeout guard already exists; the claim that React refs survive unmount/remount is incorrect; the claim that the production EAS profile uses internal distribution is incorrect. No App Check bypass was applied. Maps holding in-flight operations already have finally cleanup; longer-lived saved/revision caches are a distinct follow-up.

A second thinking-enabled NVIDIA review of the narrow OTP candidate reached its token limit without a completed review verdict. It is inconclusive, not an approval or execution claim.

The concrete OTP and push defects above were independently reproduced against actual source before implementing narrow fixes. Model-generated claims of execution or readiness are not accepted as test evidence.

## Release safety

Keep the current public release and attestation enforcement unchanged while this patch completes CI. Do not silently replace a reviewed binary, publish an untested minified build, broaden cloud IAM, enable paid providers, change privacy declarations or claim device acceptance from unit-test results.
