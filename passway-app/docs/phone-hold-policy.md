# Phone restriction monotonicity

## Reproduced defect

The previous age-confirmation ordering ranked `reported` above
`under_minimum`, even though reported accounts can participate and under-age
accounts cannot. An under-age answer on a reviewed phone could therefore fail
to persist the phone-level age restriction. Deleting and recreating the account
could then permit a different age answer.

Reporting and deletion also replaced under-age or unknown phone policies with
`reported`, weakening a restriction despite leaving the report itself intact.
Five new unit cases failed against the prior implementation.

## Corrected behavior

- Known policy ordering is `reported < under_minimum < banned`.
- A report preserves any existing restrictive or unknown phone policy exactly,
  including its expiry. It still records the report and closes/blocks the chat.
- Deleting a reviewed account preserves an existing phone policy exactly.
  Deleting a banned account may strengthen it to a nonexpiring ban.
- Unknown policies remain fail-closed; a report is not an administrative
  authorization to reinterpret or remove them.
- No DOB, raw phone, paid queue or new service is introduced.

### Privacy disclosure

The under-age hold's existing eligibility expiry is calculated from the declared
birth date. Although a raw DOB field is not persisted, subtracting 18 years from
that expiry can reveal the declared DOB. It is therefore not accurate to promise
that only a boolean is retained. The age-check screen now explicitly discloses
that under-age users' eligibility date is kept. This is a disclosure correction,
not a claim that the date is anonymous or cryptographically unrecoverable.

The preserved age restriction is intentionally not extended to the report's
180-day review expiry. These are different policies: a report must neither
shorten nor silently lengthen an existing age restriction.

## Verification scope

Regression cases cover reviewed under-age confirmation, restrictive hold
preservation in reports and deletion, and strengthening to a permanent ban.
Firestore-emulator integration additionally covers the full age answer ->
deletion -> new profile -> attempted adult answer sequence, real transactional
hold preservation, concurrent rate-budget enforcement and failed-deletion
rotation without starvation.

These are synthetic local/emulator tests. They do not demonstrate production
SMS, store attestation or deployed production remediation. Existing historical
holds already overwritten by the old behavior cannot be reconstructed by
guessing an age or DOB; this patch prevents future downgrade paths and does not
claim to repair historical records.

## Release boundary

This is a backend-only change; no Android client source, native configuration,
credentials, production rules, IAM or production deployment is changed.
Production index readiness, strict store-signed acceptance, coordinated
API/rules migration and the dependency security gate remain mandatory.