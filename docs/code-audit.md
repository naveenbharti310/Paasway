# Code audit

## Summary

The organised source was reviewed from the app entry point through authentication, navigation, each screen, callable wrappers, backend handlers, Firestore rules, indexes, retention, notifications and dependency locks.

The redundant source ZIP was removed. Source files, package locks, build configuration and documentation were kept. The old ZIP remains available in Git history.

Several defects were fixed. The project is still not ready for a production release because dependency vulnerabilities and product safety gaps remain.

## Fixes

1. Code allocation now uses a Firestore transaction and refuses to overwrite any existing code document. Candidate codes use secure randomness instead of `Math.random`.
2. Redemption rejects the generator's own code, invalid locations, malformed codes and expired codes. Both accounts are checked inside the transaction.
3. Pending requests include the code generation timestamp and expiry. Acceptance verifies the exact request and generation, so a later use of the same four characters cannot revive an earlier request.
4. The generator's request query includes the authenticated generator ID and generation timestamp. The previous query did not satisfy Firestore security rules.
5. Callable payloads, IDs, names, report reasons and message sizes are validated. Request decisions must be booleans.
6. Message writes recheck the connection and both accounts in a transaction. A concurrent end cannot leave a new message outside the retention update.
7. Reports can target only the other participant. Report creation, connection closure and account flagging are committed together. A ban is never downgraded. Repeated reports by the same participant return the existing report instead of creating duplicates.
8. Ending a connection preserves an existing report hold and does not restart the retention clock on retries. Message retention is applied in pages of 200 writes, rather than one batch that fails above 500 messages.
9. A retryable Firestore trigger repairs retention if an end or report is interrupted. Each page reads the current connection hold, protecting it from stale end operations.
10. Direct report writes are denied by Firestore rules. Profile writes are limited to the expected fields; identity, creation time and moderation status cannot be changed by the client. Banned accounts cannot update their profiles.
11. Account creation uses a transaction. The main stack waits for account setup, and setup failures offer retry and sign out rather than silently continuing.
12. Chat send failures preserve the draft and show an error. Report and end failures are visible. Realtime connection closure takes the user out of the chat. Message reads are bounded to the latest 200 messages.
13. Pending request listeners handle errors and missing documents. Waiting requests time out. The request screen checks expiry and handles acceptance errors.
14. Phone inputs and verification codes are validated. A user can request another verification code or return to the phone number field. Missing Firebase configuration is explained before sending a code.
15. Navigation and callable contracts are typed. Stale model fields, duplicated unused constants, repeated Firebase client lookups and obsolete comments were removed. Both TypeScript configurations reject unused imports and variables.
16. Firebase configuration comes from public Expo environment variables. The example file contains no credentials. Deployment paths, indexes and TTL field overrides are supplied in `firebase.json` and `firestore.indexes.json`.
17. Android notification channels and the Expo project ID are handled explicitly. Push token changes trigger registration while the app is running. Notification failure does not fail a saved connection request.
18. Compatible dependency fixes were applied. The mobile lockfile was rebuilt after an incompatible nested React Native version appeared during dependency resolution. React and React Native are constrained to the app's declared versions.

## Validation

1. A clean mobile dependency install completed.
2. Mobile and backend TypeScript checks passed, including unused symbol checks.
3. Backend compilation passed.
4. Sixty backend regression tests passed. These use an in memory Firestore test double and include malformed input, authentication, account bans, code collisions, report validation, retention and repair.
5. Nineteen security rule tests passed against the real local Firestore emulator. These include the corrected request query, forbidden profile changes, unauthorised message reads and denied direct report writes.
6. Six backend integration tests passed against the local Firestore emulator. These include simultaneous code redemption, simultaneous allocation, redemption and acceptance, message ending races, concurrent report and end across 601 messages, and rejected forged reports.
7. Expo produced Android and iOS JavaScript bundles from the clean dependency install.
8. Local credential pattern checks found no private key blocks, common GitHub token patterns or AWS access key patterns in changed files. This is not a complete secrets audit.

The emulator tests use `demo-passway` and do not connect to the live Firebase project. No production deployment, signed native build or physical device test was performed. Checks ran on Node.js 24; the configured Cloud Functions runtime is Node.js 20.

## Later changes

Dependencies were upgraded and the architecture was reviewed after this audit. The dependency findings and several release items listed here at the time are resolved. See [architecture](architecture.md) for the current dependency status, the review findings and the remaining release work.

## Repeat the checks

From `passway-app/`:

```sh
npm ci
npm ci --prefix functions
npm run typecheck
npm run typecheck --prefix functions
npm test --prefix functions
npm run test:emulator
npx expo export --platform all
npm audit
npm audit --prefix functions
```
