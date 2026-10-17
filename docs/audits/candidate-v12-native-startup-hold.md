# Candidate build 12 native startup hold

Candidate source `703881fec332421c8a43ea691dc4105a6c5645d8` is held and has not been published to a release track.

## Exact evidence

Source CI 39022452078 passed 224 mobile, 348 backend, 35 rules, 94 Firestore integration and 4 Auth integration tests. Android API 36 isolated extended native run 39022560965 passed all 84 assertions. API 34 run 39022559649 passed 46 assertions then failed `Generate form not reached`.

Both native runs used trusted harness `2feac4b3f796e57fe14f595c5fc8b76790d0b90d` and archive `486395e8ae0f5c42c293e3462184ded5bf5c506030da71a3390d4a533ed1db78`.

The API 34 failure followed successful normal pairing, messaging, offline startup Retry, recovery Sign out and fictional local OTP sign in. After a display change to 440 x 880 and font scale 2, Logcat shows Activity recreation, a new React surface starting and the old surface stopping in the same process. The failure screenshot shows bounded startup recovery, not a native crash. The existing logs do not identify whether auth callback, account transaction or active connection lookup stalled. Earlier Firebase Installations errors do not prove causality. API 36 success does not cancel API 34 failure.

## Followup

Gemini Argon High authors privacy safe internal fixed phase diagnostics and regression tests. The original 20 second deadline and late completion guards remain. Instrumentation is not a claimed runtime fix. The original failed run remains evidence; a successful retry alone cannot establish that the defect is fixed. A changed source snapshot cannot inherit the old release gates.

## Measured latency

The API 36 workflow spent 175 seconds compiling the fresh APK and 943 seconds in its emulator/native journey step. A local command benchmark observed shell 2 ms, Git status 3 ms, GitHub read 394 ms and browser tab query 171 ms, with low CPU load and ample available memory. These are point measurements, not latency guarantees. External Argon High response generation and genuine native acceptance remain separate waits.

## Production scope

Local Firebase emulators and test routing do not prove real SMS, production two user acceptance, licensed Play Integrity or physical device behavior. Backend deployment parity, store/privacy/deletion requirements and dependency advisory risks remain independent release gates.

## Diagnostic patch verification

The Gemini diagnostics payload was applied exactly, with its test path normalized from the generated `test/startup-watchdog.test.cjs` name to the actual supplied `test/startup-recovery.test.cjs`. Two new diagnostic tests fail against the original source, then all 227 mobile tests and TypeScript pass after the patch. The three new tests cover disabled diagnostics, fixed phase stall classification, and stale auth completion. This establishes instrumentation behavior, not a native startup runtime fix.

Sanitized Gemini response SHA256: `ebf6a4d60f9c44178bb95955c33f62779d968d8442ad85fadd8c3bd070b41f5c`.
