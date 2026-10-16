# Retention disclosure correction

Previous internal version8 onboarding promised physical message deletion exactly72hours after send and said Nothing stays forever. The server read barrier is separate from eventual cleanup; reported content can be retained longer for safety. That wording was not justified by passing expiry read tests.

Version0.3.3 / Android9 describes chat availability for up to72hours, later deletion and the reported-content safety exception. Empty-chat text describes availability, not exact physical deletion. This is a disclosure correction, not a new cleanup SLA, legal/compliance certification or change to retention/security handlers.

Two copy regressions failed on source8a6d79d and pass after the correction. Full source-specific validation, fresh native testing and signed version9 build remain required before promotion; previous version8 results are not relabelled. Production API/rules and public rollout remain unchanged.
