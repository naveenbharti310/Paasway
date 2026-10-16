# Store-attestation release boundary

`production` and `play-attestation` reject an App Check bypass, a public debug token, and fictional-number helpers before bundling. Unknown nonempty App Check settings are rejected. The dedicated `play-attestation` profile extends production directly, enables App Check, disables diagnostics, builds an Android app bundle, and submits only as a draft to the internal track. Existing diagnostic profiles remain diagnostic: they are not attestation evidence and must not be promoted to production.

Regression evidence: six new tests failed before the fix. Eight new release-policy tests now pass; the complete suite passes 334 cases (80 mobile, 173 backend, 32 rules, 49 Firestore integration), both typechecks and Android/iOS/web exports.

This is configuration validation, not proof of a valid Play Integrity/App Attest token. A store-installed, correctly signed build must exercise sign-in and protected API requests with App Check enforced. No store upload, rollout, SMS, signing-key change or production deployment was performed for this fix.

## Unresolved upstream dependencies

`braces` 3.0.3 (GHSA-vfj7-8cjw-p6xm) and `node-forge` 1.4.0 (GHSA-86w9-cpqp-85rv) remain the latest registry versions at audit time and have no first patched version in the authoritative advisories. The proposed node-forge PR 1152 remains open/unmerged. Their Expo tooling dependency propagation produces 21 high-severity audit entries, not 21 distinct vulnerabilities. Backend production dependency audit has zero entries. The dependency-security gate remains blocking. Do not hide findings, force an Expo major downgrade, substitute unreviewed cryptography or claim this configuration fix resolves the advisories.
