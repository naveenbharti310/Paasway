# Consistent message-time boundaries

## Reproduction before the fix

Five new deterministic unit regressions and the same five real Firestore-emulator regressions failed against the previously compiled backend:

- Replies to targets with `NaN`, positive infinity, or a future `sentAt` were accepted even though those targets were unavailable through participant reads.
- A future-dated message sorted ahead of the genuine latest message; applying `limit(1)` before discarding future rows returned an empty preview.
- More than 200 future-dated rows could consume the complete bounded query page, hiding otherwise readable history.

These are malformed/clock-skewed persisted-record robustness defects. Client rules already deny direct message writes; this is not a claim that a normal client can forge those records or that quoted message bodies were disclosed.

## Minimal backend-only correction

- Reply authorization uses one captured server time and requires a finite numeric timestamp within the same past-72-hour visibility window used for reads.
- Both lower and upper timestamp bounds are applied in the Firestore query **before** descending ordering and the existing 1/200 result limit.
- The existing post-IO expiry filter remains; a message that expires while awaiting IO still cannot be returned.
- No schema, new index, dependency, client/native configuration, credentials, App Check policy, or production state is changed. The query uses the existing single `sentAt` field index.

## Validation and release boundary

Local complete verification: 113 mobile + 208 backend unit/HTTP + 35 rules + 65 real Firestore integration = **421 passing regression cases**, both TypeScript checks, all Android/iOS/web exports, and the installed-code dependency-remediation gate. Raw npm registry advisories remain recorded as locally remediated, not a clean registry audit.

Independent exact-source hosted regression/static/native validation is separate and must retain its actual status. Previous-source CI passes are not inherited as evidence for this new backend revision. The Play internal v7 client is unchanged by this backend-only fix. Its store-installed positive-attestation and production two-user acceptance gates remain open. No production deployment or public release is performed by this patch.
