# Current verified phone policy enforcement

## Reproduction and root cause

Baseline: merged source `7ace7e88de1be257f1f3770b60c37dcf7f7bc58d`, tree `c862d66e8d465a8548192c1df29e8bd430caf684`.

The verified Firebase token already supplies `phone_number` through the shared callable/HTTP boundary. Participation handlers ignored that caller context and checked only the stored profile `phoneHash`. For an already age-confirmed profile with a missing or stale server-owned binding, a restriction on the currently verified phone was not checked. Startup does not automatically repeat age confirmation for such profiles. Client rules do not permit setting phoneHash; this requires pre-existing legacy/stale server state, not an arbitrary client write.

Four independent synthetic regressions through `runCallable` and the actual generate/send handlers failed before the fix with missing expected rejections. They passed after it. This is not a claim of active exploitation or an affected production population.

## Scope of the change

The five acting participation paths pass verified caller context into the shared transactional account check: generation, redemption, consent/accepted replay, sending/idempotent send validation, and message reads. A missing/malformed verified phone fails closed in these paths. Request-body phone fields cannot supply that identity.

The helper checks both stored and current verified phone hashes, deduplicating matching hashes. Missing holds permit participation; reported holds retain the existing review semantics; under-minimum and unknown/restrictive holds deny access. All hold reads occur inside the same participation transaction, before writes. There is no extra Firebase Auth lookup and no profile-binding migration or new API.

Peer-account checks retain their existing stored-profile policy checks. This patch does not discover a noncalling peer's current Auth phone or repair every legacy profile. Any such migration needs separate verified identity design and testing. Deletion, decline, end and safety access are not subject to a new global participation gate.

## Independent validation

The fresh unchanged baseline passed 231 mobile tests, 348 backend tests, both type checks, 35 rules tests, 94 Firestore integration tests and 4 Auth integration tests. Dependency mitigation regressions passed 18 tests. Passing the mitigation policy does not mean the registry advisories disappeared.

The candidate passed 109 new synthetic account-policy tests and the full 457-test backend suite, plus backend type checking. The matrix covers three profile-binding states, five participation paths, restricted and permitted policies, missing/malformed claims, forged body fields, preserved stored restrictions, deduplication, HTTP/callable parity, accepted-request replay, ending and deletion access.

Ten additional real Firestore-emulator transaction cases cover generation, redemption, acceptance, send and read for both missing and stale bindings with a current verified phone ban. The full post-fix isolated suite passed: 35 rules tests, 104 Firestore integration tests and 4 Auth integration tests. Synthetic snapshot injection is not claimed as a real concurrency test.

## NVIDIA assistance and provenance

The account's NVIDIA model catalog and free development endpoints were verified. Nemotron Ultra initially returned HTTP 503 overload. Broad Super/DeepSeek review calls timed out; those are not successful reviews. Short, bounded NVIDIA Super calls responded successfully, with returned model ID `private/nvidia/nemotron-3.5-super-120b-a12b` for requested endpoint `nvidia/nemotron-3.5-super-vl-120b-a12b`.

Initial model patches were rejected: they used a nonexistent caller field, rejected absent holds, omitted awaits, or changed hold-field semantics. None of those patches were applied. The engineering candidate and tests were authored locally, then reviewed by NVIDIA Super in a narrowly scoped helper review. That review reported no defect in the helper scope; it is advisory, not execution evidence or proof of application-wide correctness. No claim of NVIDIA-authored final patch, autonomous coding-agent execution, or model infallibility is made.

Only sanitized source went to free development inference endpoints. No production credentials or user data were included, and no paid service, Contributor/training enrollment, production migration or public release was enabled.

## Release boundary

This is a review-branch backend candidate, not a production deployment or replacement Android artifact. Full CI and the usual deployment gates must run for this exact source. Play-installed positive attestation, real production SMS/two-user acceptance, physical-device acceptance, outstanding store/legal/deletion work and upstream advisory disposition remain separate release requirements. The original intermittent Android startup phase is not proven by this authorization finding.
