# Hash-bound build-tool security remediation

This is a maintained local remediation, **not** an upstream patched release or an audit waiver. Dependency package versions are not rewritten. The npm registry audit still reports its original findings; `npm run security:audit` preserves the raw JSON and verifies the actual installed code before accepting only the two exact reviewed advisory records. New/changed high or critical advisories, altered original/replacement files, skipped lifecycle scripts, changed dependency versions, failed exploit regressions, missing audit data and transport failures block the gate.

## Exact upstream provenance

- node-forge 1.4.0 / GHSA-86w9-cpqp-85rv: digitalbazaar/forge PR 1152, commit `ceba34402e329f0365134f23fe19898756527d65`. Only `lib/rsa.js` changes. It checks the nested DigestAlgorithm element count, rather than accepting unconsumed ASN.1 children. The complete replacement file is byte-bound in `scripts/security-fixes/manifest.json`.
- braces 3.0.3 / GHSA-vfj7-8cjw-p6xm: micromatch/braces PR 88, commit `a795ee83ecd011131b2d618fe754ac5a8e124dae`. It bounds parser nesting and adds iterative cycle/depth checks before recursive AST walkers. Four existing files and one added guard are byte-bound.

Both PRs were open/unmerged at review. Their code is locally maintained and must be re-reviewed when the advisory or package version changes. Do not mistake these for official releases. Original licenses accompany the replacement files; Forge is used under its BSD option.

## Review and observed proof

- Original installed libraries reproduce the malformed RSA DigestAlgorithm acceptance and recursive AST failures. An independent RSA test uses a generated test-only 2048-bit e=3 key, real PKCS#1 padding, two unexpected ASN.1 child types and **no** padding-check bypass. Valid signatures interoperate with Node crypto after the fix.
- Independent installed-code exploit/compatibility tests plus patch-integrity and policy-boundary tests: `npm run test:dependency-security`.
- Complete compatibility: `npm run security:conformance` downloads exact SHA-256-pinned upstream archives, then replaces their library directories with the **installed** patched libraries. This proves the installed payload rather than a different remote checkout.
- Forge: 829 passing, zero failures, four pre-existing pending tests. Braces: 899 passing, zero failures. This is Node conformance, not browser-engine certification.
- The upstream Forge test checkout contained `describe.only` in `tests/unit/jsbn.js`, masking all but five tests. The conformance runner removes exactly that one marker in a temporary **test-only copy**, enforces `--forbid-only` and exact suite counts, and records this adjustment visibly. It does not alter installed cryptographic code to make tests pass.

## Installation and release controls

`npm ci` runs the existing root lifecycle with `apply-security-fixes.cjs` before asset generation. Every installed package-lock instance of the affected packages must match its pinned original or replacement hash. All targets are validated before any writes. The verification mode never repairs mismatches: it fails.

The dependency CI gate must run `npm ci`, `npm run security:audit` and `npm run security:conformance`; it must retain the raw audit and the remediation proof together. Do not replace this with `npm audit || true`, ignore scripts, change version labels, downgrade Expo across majors, or allow new advisories by URL alone. Ordinary raw `npm audit` remains nonzero until upstream releases a fixed version.

These are Expo/build-tool dependencies; the backend production dependency tree did not contain either package at review. This distinction does not replace the build security checks and does not certify production store attestation, application runtime behaviour or device coverage.
