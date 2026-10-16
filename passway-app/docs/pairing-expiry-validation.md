# Fail-closed persisted pairing expiries

## Reproduction

Fifteen new unit regressions and the same fifteen **real Firestore emulator** transaction regressions failed before the correction. An active code could be redeemed, or a pending request accepted, when the code or request expiry was `NaN`, positive infinity, missing, a future numeric string, or a map. JavaScript `value <= now` does not reliably reject these representations.

Code/request records are server-owned and direct client writes remain denied. This is a persisted-record robustness defect, not evidence that normal clients can forge pairing records. Valid server-created codes still retain the existing five-minute lifetime; this patch does not add a new proximity or location-attestation claim.

## Minimal correction

A shared `isUnexpiredMillis` guard requires a finite numeric millisecond expiry strictly greater than the captured server time. Redemption checks the code expiry; new acceptance checks both the request and its matching claimed code. Failure uses the existing inactive/expired messages and commits no request/connection/status mutation. The existing account, cohort, block and code-generation checks remain.

Previously acknowledged acceptance retries remain on their existing idempotent path. Declining a pending request does not require a valid future expiry. No dependency, schema, index, client/native configuration, signing or production policy change is introduced.

## Verification scope

Before-fix evidence: 15/15 targeted unit checks failed and 15/15 targeted real Firestore checks failed. After-fix complete local gate exited 0: **113 mobile + 223 backend unit/HTTP + 35 rules + 80 real Firestore integration = 451 passing cases**, both TypeScript checks and Android/iOS/web exports. The restored workspace initially lacked its pinned installed `node-forge` remediation; the security gate correctly failed, the existing hash-verified restoration script reapplied the reviewed patch, and the complete gate was rerun successfully. Raw registry advisories remain recorded; this is not a clean raw audit. Independent exact-source CI must be recorded against the new commit, not inherited from the previous backend revision. Neither isolated emulators nor restricted live API previews establish store-installed positive attestation or full production acceptance.
