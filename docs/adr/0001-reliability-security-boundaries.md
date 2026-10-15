# ADR 0001 — Harden the existing modular architecture before adding services

Status: proposed for review; not deployed.

## Decision
Keep Expo/React Native + a modular stateless TypeScript API + Firestore. The current scale and free-hosting constraints do not justify introducing Kafka, Redis, Kubernetes, a microservice mesh, or a second authentication database. Add explicit trust boundaries, bounded work, idempotent writes, deterministic tests, pinned CI actions and release gates first.

The Vercel HTTP adapter is the deployed API boundary. The Firebase callable handlers remain reusable, but a future Cloud Functions deployment must separately verify its authorization/revocation, background execution and resource settings; Vercel settings do not transfer automatically.

## Reliability contracts introduced
- Complete OTP operation: 20-second client deadline, including App Check acquisition, network and response parsing. No automatic resend/retry of a mutation. A late App Check result cannot initiate a new SMS request after that deadline.
- GPS acquisition: 15 seconds after the permission decision. Native acquisition is not forcibly cancelled; late results are ignored by the awaiting UI. The OS permission dialog itself is not timed out.
- HTTP request bodies: 16 KiB callable / 1 KiB OTP, counted from actual streamed bytes, five-second whole-body read deadline. Application-level limits complement, not replace, host/WAF limits.
- Expo push HTTP call: abort after four seconds, redirects rejected. Push failures do not undo committed database writes. Recipient lookup and other Firestore operations remain subject to hosting/SDK limits; push is still best effort, not a durable queue.
- Startup: preserve the previously introduced 20-second recovery guard and stale-completion protections.
- Message retries: optional sender-scoped client intent keys; deterministic hashed document ID; transaction rechecks key, content, reply target, authorization and connection state. One stored message, one moderation increment, and at most one push attempt for the same retained message. Changed intent gets a new key. A key is not a bearer credential.

## Trade-offs and limits
Idempotency adds Firestore reads and storage fields. It is not exactly-once transport or a durable offline outbox. The client keeps retry intent in memory only; process death loses it. After message deletion, the old key has no permanent receipt. Concurrent first attempts can consume more than one rate-limit event while committing only one message. Push remains at-most-one attempt for that message; a worker crash between commit and push can lose notification delivery. Do not claim exactly-once notifications.

Revocation checking on the Vercel API adds an Auth RPC; measure real device/API latency rather than claiming a speedup everywhere. Firestore direct-read revocation and retention controls require their own rule/read-path design.

## Rollout
1. Review tests and source changes. Do not merge or deploy automatically.
2. Deploy the backward-compatible API to an isolated staging project first. Older clients omit the optional message key and continue to work.
3. Build a new native artifact with the SDK patch updates. Do not inject it into the old build-4 native base and claim compatibility.
4. Run Android 14/16 and physical-device tests against that exact artifact and staging API, then run an authorized live SMS smoke if needed.
5. Enable production App Check in client and server as a coordinated release, verifying real Play/App Attest tokens first. Do not turn it off as a workaround.
6. Resolve or explicitly review security/privacy gates before production approval. Rollback must recognize that an older API can ignore retry keys and lose the idempotency guarantee even if basic messaging still works.
