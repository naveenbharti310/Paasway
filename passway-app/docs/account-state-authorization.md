# Fail-closed account-state authorization

Known participation states are `active` and `reported`; review is not itself a ban. Unknown, missing or malformed states must not acquire access merely because they are not spelled `banned` or `deleting`. The shared transactional account guard now applies an allowlist, requires finite positive age-confirmation metadata, and rejects a conflicting under-minimum flag. Sender and recipient checks inherit the same policy.

Firestore profile updates and private-note create/update use the same eligible-state allowlist. Banned users cannot create/update notes. Reading/deleting your own private notes remains allowed; other users still cannot access them. Account deletion and safety endpoints are not removed by this change.

Before the fix: 10 new backend policy cases and 2 new rule cases failed; positive reviewed-account controls passed. After the fix: 350 local regression cases pass (80 mobile, 184 backend, 35 rules, 51 real Firestore integration), both typechecks and Android/iOS/web exports pass. Real emulator transactions verify unknown-recipient denial and malformed/under-minimum age denial without message writes.

Scope: candidate source only. No production user state was modified and no rules were deployed. Rules/API/client rollout must remain coordinated; never deploy the message-body-denying rules in isolation to old clients. This change does not resolve upstream build-tool dependency advisories or certify native store attestation.
