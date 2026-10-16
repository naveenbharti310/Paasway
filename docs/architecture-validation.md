# Architecture hardening — validation record

Branch: `audit/architecture-hardening`, based on `c132e0d8cdb715c34378132e7492960f615bd1bb`.

## Verified local checks

| Suite | Passed | Failed |
|---|---:|---:|
| Mobile push/startup/retry/OTP/location/build-guard regressions | 47 | 0 |
| Backend unit, HTTP, auth, OTP, safety and request-boundary tests | 170 | 0 |
| Firestore security-rule tests | 29 | 0 |
| Real Firestore emulator transaction/integration tests | 17 | 0 |
| **Total** | **263** | **0** |

`npm run check` completed successfully: mobile tests, app TypeScript, backend TypeScript (including API entry points), backend tests, Firestore rules/integration, Android/iOS/web JavaScript exports. After a test-only metadata-probe configuration improvement, the complete Firestore emulator gate was rerun and passed again. Emulator tests are strictly guarded to `127.0.0.1:8080` and project `demo-passway`; they do not use production data or credentials. A custom-credential harness experiment was rejected by the Admin SDK and discarded before the final passing rerun.

The new unit tests first reproduced the HTTP/push weaknesses and message retry duplicates, then passed after their fixes. One pre-existing OTP quota test flaked because advancing the wall-clock crossed an hour boundary; it now uses a fixed mid-window clock, with explicit hour/day rollover tests.

`expo install --check`: dependencies up to date after the six SDK-57 patch updates. These include native modules; bundle export is NOT native-build compatibility certification.

Export SHA-256 (non-production, build-only configuration; no live endpoint):
- Android Hermes: `788d138137c595ca066f4ca298fca1f9ab03d6dd29ae8e3bd86a69ce14074451`
- iOS Hermes: `295bc53cfdb265dad432b9272e77a34081749393b16b8dc7b97642497934b301`
- Web JS: `ea0a945244e780c1ce5ba4aa1ddcd820e49a658fbf0a41c741ea4a27acc71c53`

## Security gate is NOT green

Backend production dependency audit: zero reported advisories. Mobile/build-tool dependency audit after patch alignment: **21 high affected entries from two underlying advisory sources**, `braces` and `node-forge` (down from 22 affected entries). At verification time their latest published versions were 3.0.3 and 1.4.0 and still affected. The suggested automated Expo-44 downgrade is not an acceptable fix. The dependency-security workflow deliberately fails on unresolved high advisories rather than hiding them.

Advisory references:
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/advisories/GHSA-86w9-cpqp-85rv

## Not included / no claim made

No new native Android/iOS device E2E run, physical Oppo certification, production-signed artifact, load/penetration test, strict server-side expiry guarantee, E2EE, production App Check enforcement, production deployment, main-branch merge, paid-service purchase or new live SMS request. The previous Android 14/16 and live 2Factor results apply to their previously identified candidate, not this architecture branch.

See [the audit](architecture-audit-2026-10.md) for all unresolved release risks and [ADR 0001](adr/0001-reliability-security-boundaries.md) for the coordinated rollout plan. CI must run independently; local results are not a claim that GitHub-hosted CI ran successfully.
