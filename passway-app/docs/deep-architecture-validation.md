# Deep architecture validation scope

Automated suite inventory for this branch:

| Suite | Cases | Boundary |
| --- | ---: | --- |
| Mobile regressions | 60 | Actual transpiled modules/hooks, mocked native bindings, controlled identity/listener/timer/foreground events |
| Backend domain/HTTP/security | 170 | Unit/security boundaries, deterministic clock and provider fixtures |
| Firestore rules | 29 | Local Firestore emulator; current rule guarantees only |
| Backend integration | 31 | Real Firestore emulator queries/transactions; report/cleanup fault injection, 301-child cleanup, concurrent acceptance and messaging |
| Total | 290 | Automated regressions, not a claim of exhaustive correctness |

Also run app/backend TypeScript and Android/iOS/web JavaScript/Hermes export.
The exports use non-live demo configuration and do not certify a signed native
artifact or a production backend. New device testing remains required.

The enterprise workflow independently checks a SHA-256-pinned source archive,
installs dependencies fresh, and runs each suite. Its separate dependency gate
must remain visibly failing if upstream high advisories are still present.
A successful regression job is not a successful overall security gate.

No production deployment, app main merge, additional SMS, new paid service or
billing-limit change is part of this validation.

See [deep audit and unresolved release blockers](deep-architecture-audit.md).
