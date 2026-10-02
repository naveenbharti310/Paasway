# Architecture

This document describes how Passway is built after the dependency upgrade and architectural review, why each part is shaped the way it is, and what still needs work before release.

## System overview

Passway has two parts.

1. A React Native app built with Expo SDK 57. It uses the native Firebase SDKs through React Native Firebase for phone sign in, Firestore listeners, Cloud Functions calls and App Check.
2. A Firebase backend. Cloud Functions (2nd gen, Node.js 22, region `asia-south1`) own every write that matters for safety. Firestore stores state, and TTL policies delete expired records.

The client never writes codes, requests, connections, messages, reports or blocks. It reads only documents that belong to the signed in person, and it can update only its own display name and push token. Everything else goes through a callable function that checks sign in, App Check, input shape, account status, blocks and rate limits before writing in a transaction.

## Request path

Every callable is created with `authedCallable` in `functions/src/lib/callable.ts`.

1. Firebase rejects the call before our code runs if the App Check token is missing or invalid. Enforcement is controlled by the `ENFORCE_APP_CHECK` parameter and is on by default.
2. The wrapper rejects calls without a signed in user.
3. The wrapper rejects a payload that is not a plain object.
4. The handler validates each field, applies its rate limit and runs its Firestore transaction.

Global options in `functions/src/config.ts` set the region, an instance ceiling of 20, 256 MiB of memory and a 60 second timeout. The app calls functions in the same region, set in `src/firebase/client.ts`.

## Connection lifecycle

| Step | Function | What it guarantees |
| --- | --- | --- |
| Generate a code | `generateTid` | Four characters from secure randomness, five minute life, never overwrites an existing code, ten per hour per person |
| Enter a code | `redeemTid` | The code is active and unexpired, both people are in good standing, neither has blocked the other, and the two locations share a geohash cell or neighbouring cell. A wrong code, a distant location and a block all return the same message |
| Accept or decline | `respondToRequest` | Only the generator can answer, only for the exact request and code generation, and only before expiry |
| Chat | `sendMessage` | The connection is active and both people are in good standing at the moment of writing. Each message gets its own 72 hour expiry |
| End | `endConnection` | Idempotent. Keeps the first end time and never shortens a longer hold |
| Block | `blockUser` | Ends the connection and stops either person redeeming the other's codes in future |
| Report | `fileReport` | Ends the connection, blocks the reported person, flags their account for review and holds the conversation for 30 days. Repeated reports by the same person do nothing extra |
| Idle close | `closeIdleConnectionsJob` | Runs hourly and ends connections with no messages for 72 hours |
| Retention repair | `syncConnectionRetention` | Reapplies message retention if an end, block or report is interrupted |

## Data model

| Collection | Written by | Read by clients | Deleted by |
| --- | --- | --- | --- |
| `users/{uid}` | Client creates its own profile, functions change status | Owner only | Kept for moderation history |
| `tids/{code}` | Functions | Never | TTL at code expiry |
| `connectionRequests/{id}` | Functions | The two participants | TTL after 72 hours |
| `connections/{id}` | Functions | The two participants | TTL after the retention date set when it ends |
| `connections/{id}/messages/{id}` | Functions | The two participants | TTL 72 hours after sending, extended to the connection's hold when it ends or is reported |
| `reports/{id}` | Functions | Never | TTL after 30 days |
| `blocks/{blocker}:{blocked}` | Functions | Never | Kept |
| `rateLimits/{uid}_{name}` | Functions | Never | TTL after the window |

Indexes are declared in `firestore.indexes.json`. The composite index on `connections (status, lastActivityAt)` serves the idle sweep. The app's lookup of an active conversation after restart uses equality filters only, so Firestore serves it from single field indexes.

## Mobile app structure

| Layer | Location | Notes |
| --- | --- | --- |
| Entry | `index.ts`, `App.tsx` | Registers the root component |
| Firebase access | `src/firebase/client.ts` | Initialises App Check before any call, exposes `auth`, `db` and a typed `callable` helper |
| Contracts | `src/types/contracts.ts` | Request and response types for every callable |
| Features | `src/features/*` | Screens and their API wrappers |
| Device services | `src/services/*` | Location, notifications and error messages |
| Navigation | `src/navigation/*` | Chooses sign in or the main flow, and reopens an active conversation after restart |

Native Firebase keeps the session on the device, so people stay signed in across restarts. Phone verification uses Play Integrity on Android and silent push on iOS, falling back to a reCAPTCHA page only when needed. This removed the old web based verification package, which no longer works with current Expo releases.

Because the app now uses native modules, it runs in a development build rather than Expo Go. See the app README for build steps.

## Review findings and changes

| Finding | Risk | Change |
| --- | --- | --- |
| Expo SDK 51, React Native 0.74, Firebase JS 10 and the old reCAPTCHA package were out of support | Critical tooling advisories, no path to store builds, broken phone verification on current SDKs | Upgraded to Expo SDK 57, React Native 0.86, React 19.2, React Navigation 7 and React Native Firebase 26 |
| Backend on Node.js 20 with Firebase Admin 12 and Functions 5 | Runtime approaching end of support, older advisories | Node.js 22, Firebase Admin 14 and Firebase Functions 7 |
| No App Check | Anyone with the public project settings could script the callables, including code guessing from many accounts | App Check on every callable, enforced by default, with Play Integrity and App Attest providers |
| Messages had no expiry until the connection ended | A connection nobody ended kept messages forever, against the 72 hour promise | Each message expires 72 hours after sending. An hourly job closes idle connections |
| No block list | A reported or unwanted person could reconnect from a new code | Reports and the new block action write a two way block that redemption checks inside its transaction |
| The proximity failure returned a different error from an inactive code | A remote caller could tell a real code apart from a wrong one | Both return the same message |
| Each handler repeated sign in and payload checks | Easy to miss a check in a new handler | One `authedCallable` wrapper |
| End, report and idle close each built their own end logic | Retention rules could drift apart | Shared `markEnded` and `endConnectionAs` in `services/connections.ts` |
| No region set | Default `us-central1`, far from users in India | `asia-south1` for functions, set in one place on each side |
| Code creation time was derived on the client from a duplicated five minute constant | A server change would silently break the request listener | `generateTid` returns `createdAt` and the client uses it |
| Contact detection matched only ten plain digits and three app names | Most attempts to move off the app were missed | Detects phone numbers with separators and country codes, email addresses, handles and common messaging apps |
| No notification for new messages | People missed replies | A notification that says only that a message arrived, never its text or the sender's name |
| No recovery of an open conversation after restart | People lost the chat when the app closed | The navigator looks up an active connection and opens it |
| Logging through `console` | Unstructured logs in Cloud Logging | Firebase structured logger |

## Dependency status

| Package set | Before | After | Advisories |
| --- | --- | --- | --- |
| Backend | 2 moderate | Firebase Admin 14.5, Functions 7.4, TypeScript 5.9 | None |
| Mobile | 1 critical plus high and moderate findings | Expo 57, React Native 0.86, React Native Firebase 26.4, TypeScript 6.0 | 9 high entries that all trace to one `node-forge` advisory |

The remaining `node-forge` advisory has no fixed release. It sits in Expo CLI's code signing helper, which runs on a developer machine or build server and is not shipped in the app bundle. Recheck it with `npm audit` before each release.

Two overrides are in place. `uuid` is raised to 11.1.1 in both packages because older build tools pinned a vulnerable version. `@grpc/grpc-js` is raised to 1.14 for the Firebase JS SDK used only by the security rule tests.

## Validation

1. Backend: 78 regression tests, including blocks in both directions, message expiry, idle sweep, private message notifications and contact detection.
2. Security rules: 22 tests against the Firestore emulator, including denied access to blocks and allowed scoped lookups of an active connection.
3. Integration: 8 tests against the Firestore emulator using real transactions, including a block stopping a later redemption and the idle sweep using its composite index.
4. TypeScript checks for the app and backend.
5. Android and iOS JavaScript bundles from a clean install.
6. A native prebuild in a temporary folder with placeholder Firebase files, confirming the Firebase, App Check, location, notification and build property plugins generate valid native projects.

No signed native build, physical device test or deployment to a live Firebase project was performed.

## Still needed before release

1. Create the Firebase project, register both apps, download the native config files, register App Check with Play Integrity and App Attest, and add debug tokens for development devices.
2. Build development clients with EAS and test the full flow on two physical devices: sign in, location prompt, code exchange, notifications, chat, block, report and restart recovery.
3. Deploy functions, rules, indexes and TTL policies to a staging project first, then confirm TTL policies are active in the console.
4. Connect a real scam and harassment classifier behind `screenMessage` and build a review process for reports and flagged accounts.
5. Add account deletion inside the app, which Apple and Google require, without letting a banned person escape a ban by deleting and signing up again.
6. Add onboarding, age confirmation, a settings screen, crash reporting and history beyond the latest 200 messages.
7. Proximity still compares locations reported by the device. App Check raises the cost of faking calls but does not prove physical presence.
