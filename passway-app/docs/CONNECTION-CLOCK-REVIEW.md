# Connection countdown clock-skew correction

Gemini web UI selected **4 Argon** reviewed a sanitized source9 text packet. Task mode returned two blank responses; standard Chat mode returned a source audit and a subsequent critique. Gemini explicitly reported **no tests executed**. Its output was treated as untrusted: a proposed account-deletion transaction read after write and a placeholder non-behavioral test were rejected, and its phone-token and keyboard claims were not accepted as reproduced bugs.

## Independently reproduced defect

The actual rendered CodeScreen showed immediate expiry and RequestScreen disabled a valid acceptance when the phone wall clock was ten minutes ahead of server time. Those two behavioral regressions failed before the patch. Existing server authorization correctly used server time; no backend expiry/security bypass was found or introduced.

## Minimal correction

- Generate/redeem API adapters record monotonic request start and build a serializable server-time anchor.
- Generation uses existing server `createdAt`, so it also benefits with the older API.
- Redemption adds optional `servedAt`, captured in the transaction **before** push-notification I/O. A separate failing-before/passing-after behavioral server regression verifies the transaction timestamp is preserved.
- Code and request routes preserve the same in-process monotonic anchor; requester wait expiry uses its response anchor.
- Ceiling rounding preserves a positive subsecond remainder until actual expiry.
- Server still authorizes every redemption/acceptance. Network time is conservatively charged from request start, not subtracted from a new TTL. No time or attestation bypass.
- Older redeem API responses without `servedAt` retain the pre-existing wall-clock fallback; this does not claim the legacy backend is clock-skew corrected. Existing old clients ignore the extra response field.

## Scope and limitations

No navigation-state persistence exists; monotonic anchors must not be persisted across process restarts. Current navigation boot starts a fresh flow. Timers may pause while backgrounded and recompute on the next tick; physical-device suspend behavior is not certified by unit tests. No production deployment, real SMS, Play licensing, Store attestation, or public release occurred for this patch. It is a source/testing change, not a new signed internal build. Previous source9 release evidence remains attached to its original commit, not inherited by this patch.

Testing commands: `npm run test:mobile`; `npm run typecheck`; `npm run typecheck --prefix functions`; `npm test --prefix functions`. Full exact-source hosted dependency/rules/integration/static/export/native gates must be rerun for the resulting commit. The existing shared local installed dependency security guard failed due drift; local unit results do not certify that installation's dependency mitigations. No files inside node_modules were edited.
