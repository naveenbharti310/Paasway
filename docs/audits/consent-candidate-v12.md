# Consent lifecycle candidate audit

Gemini 4 Argon High authored the RequestScreen implementation, harness changes, regression tests and version 0.3.6 / Android code 12 metadata. The coordinator independently reviewed and executed the changes.

The native-stack-supported usePreventRemove hook now closes a pending request once before Back navigation. A concurrent acceptance keeps the first intent; failures remain visible and retryable. Successful programmatic navigation occurs after the guard is disabled. Terminal requests can start again without another decline.

Two focused Back regressions against original source: 2 failed, 0 passed, 0 cancelled.
Complete corrected mobile suite: 222 passed, 0 failed. TypeScript: passed.

The first generated assertions had cross-VM prototype mismatches. Gemini corrected them with structural JSON comparisons that preserve the expected fields. Separate layout/subscription mocks received inert hook definitions; navigation prevention is exercised by the action-race harness. Another mock flaw silently ignored an unhandled Back action; Gemini corrected it to record the allowed pop and respect preventDefault. Original failures are retained outside the repository and are not counted as passes.

Visual audit of accepted v11 Android16 evidence: the large-text request screenshot was captured after an intentional viewport scroll to reach Accept. The offscreen name in that screenshot is not proof of inaccessible or permanently clipped content. The capture sequence and XML were inspected; no speculative visual patch was applied.

Native acceptance must be rerun for this changed source. A signed build is only a candidate, not production SMS, physical-device, store attestation or public release acceptance.

Open release gates include legacy confirmed profiles that never invoke confirmAge and have missing/stale phone bindings, current real-SMS / licensed Play installed acceptance, store declarations and upstream registry advisories. No production readiness claim.

Authorship evidence SHA256:

`request-focused-code.txt`: `793ad4f04c025d1b9b73a029c593c6ec2c13fce50fe1a7074adf930b84d959a7`
`request-focused-response.json`: `7aaa1c62bd3cdf62b3265da6906ec9d5171a5e106674e1268bc13bd54aeba8b3`
`request-test-response.json`: `0e4c4bd0cf9d4ec8cd658ecb026fd7eb80d858bf10179e50bb6d92bb05451b1c`
`request-correction.json`: `e1f997dd00a6245f18b2323da0d981f683eb00ee96e1cd8279672251981227a4`
`back-mock-correction.json`: `850a26b0f6d75bb154319507c43dc88418283bd8c6c26d4163c32f733d0a10d1`
