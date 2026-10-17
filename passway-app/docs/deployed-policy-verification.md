# Deployed policy verification

## Why this is a separate release gate

An API can correctly filter expired messages while old deployed Firestore rules
still allow direct client reads of those same bodies. Successful API acceptance
and successful rule-emulator tests do not establish deployed rule parity.

This exact gap was reproduced with disposable production fixtures on 2026-10-17.
The accepted rules were compiled into an immutable ruleset and published.
Independent checks then verified direct body denial, deletion-state protections,
compatible profile and metadata access, private notes, and the server message
path. A separate 56-assertion service/concurrency pass succeeded afterward.

The first immediate post-publication check had mixed results. Its failure is
preserved separately from the successful independent postchecks. Rules
publication is not an instantaneous global enforcement guarantee.

Evidence and remaining gates:
https://github.com/Cynqra/passway-native-tests/issues/6

## Read-only operator gate

From `passway-app/functions`, with Application Default Credentials already
configured for the intended operator:

```sh
npm ci
npm run check:deployed-policy
```

Prefer short-lived workload federation or developer authorization. Do not add
production service credentials to public CI, preview deployments or artifacts.
Do not grant the runtime identity IAM administration merely to run this check.
The checker never publishes rules, edits roles, reads user documents, prints
tokens or retains provider response bodies.

The check is intentionally bound to `passway-2ddc8`, the default database,
`cloud.firestore` and the reviewed local manifest. It requires exact deployed
rule bytes, all required composite indexes READY, and a stable release binding
throughout observation. It bounds request time, response size and pagination.
It fails on missing authorization, malformed metadata or a partial response.
It does not validate TTL configuration, actual cleanup latency or backlog.

The 26 unauthenticated API boundary probes remain separate. They do not prove
Firestore policy parity. The read-only policy checker requires Google
authorization and is not currently a credential-free scheduled monitor.

## Permission diagnosis

Check the permission for the specific operation rather than inferring all
deployment access from one HTTP403. The available operator credential could
create immutable rulesets and update release bindings but could not invoke the
separate Firebase Rules testing API. Creation validates rule syntax and
semantics without activating the rules. Real post-publication authorization
checks are still necessary.

## Controlled migration

Before publishing, confirm the exact source, compile without activating,
inspect current binding, verify required indexes, establish compatible client
availability, and pass the canonical API preflight. Recheck the previous
binding immediately before switching. Avoid a blind rules-only change while
an older public client still requires direct message access.

The observed release was internal version10, with no public production release.
That client uses the protected server read path. This is not proof of genuine
Play-installed positive attestation, native release acceptance or physical
device performance. Those remain mandatory release gates, along with Store
policy completion and factual privacy/deletion disclosures.

After publishing, verify actual direct-read denial, compatible app operations,
account-state protections and owned-fixture cleanup. Retain failed probes
rather than rewriting them as successes. Do not automatically roll back to
known insecure rules merely to make a legacy client appear functional.