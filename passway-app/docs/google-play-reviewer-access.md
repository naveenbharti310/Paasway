# Google Play reviewer authentication

The current production configuration uses 2Factor SMS. A live personal OTP is not a reusable reviewer credential. Version 13 routes the two reserved fictional accounts through Firebase only when diagnostics are enabled, so it cannot honestly claim reviewer access in a normal public build.

The fix routes only the two already reserved and independently confirmed Firebase fictional numbers through Firebase's official phone authentication SDK, even with the build provider set to 2Factor. Their codes remain private in Firebase configuration and Play Console, not source, logs or an in-app local verifier. No server, Firebase configuration, App Check policy, account authorization rule or ordinary-user SMS fallback is changed.

In release, `appVerificationDisabledForTesting` remains false, Firebase's SDK verifies the configured account credential, and all protected application APIs still require valid App Check. Internal diagnostic handling remains separately gated by the diagnostic build profile. Timeouts bound SDK start and confirmation without automatic resends.

Evidence: the released version 13 fails six new reviewer cases; the fix passes all nine reviewer cases and 241 mobile tests locally. This does not prove a genuine Store install, a positive production attestation verdict or physical two-user acceptance. Those remain mandatory checks before claiming the new build's reviewer flow works end to end. Never put reusable reviewer codes in public issues or artifacts. Never submit personal SMS credentials as complete reviewer access.
