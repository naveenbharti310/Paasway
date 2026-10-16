# Person-level block boundary audit

## Reproduced defect

Two users can have more than one active connection. Blocking/reporting through connection1 writes a person-level block and ends connection1. Before this fix, sendMessage/getMessages checked participants and connection2 status but did not read the person-level block. Three failing real-Firestore regressions reproduced alternate-channel send/read/report bypasses.

## Minimal architectural correction

Reuse the existing bidirectional assertNotBlocked helper inside both message transactions, before reading or writing bodies and before acknowledging an idempotent message replay. Block records are transaction reads: a concurrent write to a block document participates in Firestore conflict handling. No new service, dependency, paid infrastructure, batch fan-out or unsafe cache is introduced.

Scope: deny new server message reads/sends across every existing channel for the blocked pair. Preserve unrelated pair access, same-sender idempotency and existing retention holds. This does not retroactively erase content already delivered/cached, automatically end every connection metadata row, or invalidate adversarial screenshots/copies. HTTP and callable entry points reuse these handlers. Updating only backend code does not require a native module rebuild, but coordinated earlier API/rules migration requirements still apply.

## Regression scenarios

- Alternate active channel send denied in both directions after blocking.
- Alternate channel reads denied in both directions after blocking.
- Report-created block uses the same server boundary.
- Previously committed retry key cannot bypass a later block.
- Unrelated pairs continue to send/read.
- Invalid selectors/flags produce no rate-limit or connection writes.
- Ten fresh-channel concurrent send/block rounds are allowed to serialize either way; all operations after the block commits are denied, without extra message creation.
- Callable authentication coverage includes both blockUser and getMessages.

No production deployment, app merge, SMS, store-attestation claim, or advisory waiver is included. Dependency security remains a separate blocking gate.
