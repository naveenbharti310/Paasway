# CI routing and honest release status

## Confirmed infrastructure failure

Source run 38703076557 (`naveenbharti310/Paasway`) marked both regression and
dependency-security failed with **zero job steps**. GitHub's check annotation:
"The job was not started because recent account payments have failed or your
spending limit needs to be increased."

Enterprise minutes on `Cynqra` do not automatically pay for a personal-owned
repository's runners. Running the workflow in both places produced misleading
red source checks alongside successful enterprise regression checks.

## Routing correction

The personal workflow now remains manual-dispatch only until account ownership /
billing is deliberately resolved. This is **not a successful regression result**
and not a security waiver. Actual validation runs in the private enterprise
`Cynqra/passway-native-tests` repository against a SHA-256-verified archive with
its exact source commit recorded. Mirroring/dispatch is currently an explicit
step, not a claim of automatic cross-repository synchronization. Never merge a
new source commit on another commit's green results.

The enterprise regression and dependency-security jobs remain separate. The
security job continues to fail for current upstream mobile/build-tool
advisories. Overall workflow state is therefore FAILURE even when every
regression passes. Review must inspect exact-source enterprise statuses and
logs, and must not treat removal of duplicate unstarted jobs as release approval.
Branch protection/required-check policy must be reconciled by the repository
owner before production merge; no protection rules are weakened here.

## Native scope and speed

Fresh native run 38703132829 uses a real source regeneration/Gradle compilation,
not the previously reused native APK. Its currently observed pending stage is
compilation, not emulator interaction. The workflow provisions KVM, limits build
workers/memory, stops Gradle before starting the emulator, and uses an explicit
startup deadline. Do not declare either compilation or emulator success before
the completed run's evidence.

The native source commit is 4e46a19f5a6f075ed300ebcc57d33e6ec11885fc.
A subsequent CI-routing-only change leaves the entire `passway-app` Git subtree
unchanged; compare subtree object IDs rather than claiming a different APK was
built. The native test uses synthetic demo config and only signed-out onboarding
smoke, not a production two-user/backend/App Check test.

## Measured performance, not production-load claims

A local isolated Firestore-emulator burst of 24 authorized latest-message reads
(two synthetic accounts) completed 24/24, p50 approximately 3.58s, p95 7.17s,
none over the client's 15s budget. This excludes HTTP/Auth/App Check and is NOT
production throughput. It exposes contention/latency headroom that still needs
optimization and larger fanout testing; do not call all performance issues fixed.

## Claude availability

This agent environment exposed Notion/GitHub MCP connections and no Claude CLI.
No Claude execution occurred. Changing wording or persona is not a Claude
handoff. A user-provided supported Claude connection/session is required to use
that provider; do not invent access or transmit credentials/private code to an
unapproved substitute service.
