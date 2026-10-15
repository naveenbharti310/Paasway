# Architecture

> Current audit and unresolved production gates: [architecture audit](architecture-audit-2026-10.md) and [reliability/security ADR](adr/0001-reliability-security-boundaries.md). Historical validation counts below are not evidence for newer commits.

This document describes how Passway is built after the dependency upgrade and architectural review, why each part is shaped the way it is, and what still needs work before release.

## System overview

Passway has two parts.

1. A React Native app built with Expo SDK 57. It uses the native Firebase SDKs through React Native Firebase for phone sign in, Firestore listeners, Cloud Functions calls and App Check.
2. A Firebase backend. The callable handlers own every write that matters for safety. They run on Vercel in Mumbai today and can run unchanged on Cloud Functions (2nd gen, Node.js 22, `asia-south1`). Firestore stores state, and a cleanup sweep deletes expired records.

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
| Report | `fileReport` | Ends the connection, blocks the reported person, flags their account for review and holds the conversation for 90 days (3 months). Repeated reports by the same person do nothing extra |
| Idle close | `closeIdleConnectionsJob` | Runs hourly and ends connections with no messages for 72 hours |
| Retention repair | `syncConnectionRetention` | Reapplies message retention if an end, block or report is interrupted |

## Data model

| Collection | Written by | Read by clients | Deleted by |
| --- | --- | --- | --- |
| `users/{uid}` | Client creates its own profile, functions set age, status and flags | Owner only | When the person deletes their account |
| `tids/{code}` | Functions | Never | Cleanup sweep at code expiry |
| `connectionRequests/{id}` | Functions | The two participants | Cleanup sweep after 72 hours |
| `connections/{id}` | Functions | The two participants | Cleanup sweep after the retention date set when it ends |
| `connections/{id}/messages/{id}` | Functions | The two participants | Cleanup sweep 72 hours after sending, extended to the connection's hold when it ends or is reported |
| `reports/{id}` | Functions | Never | Cleanup sweep after 90 days |
| `blocks/{blocker}:{blocked}` | Functions | Never | Kept |
| `rateLimits/{uid}_{name}` | Functions | Never | After the window, or when the account is deleted |
| `system/maintenance` | Functions | Never | Kept. Records when the cleanup sweep last ran |
| `accountHolds/{phoneHash}` | Functions | Never | Cleanup sweep when the hold ends |

Indexes are declared in `firestore.indexes.json`. The composite index on `connections (status, lastActivityAt)` serves the idle sweep. The app's lookup of an active conversation after restart uses equality filters only, so Firestore serves it from single field indexes.

## Mobile app structure

| Layer | Location | Notes |
| --- | --- | --- |
| Entry | `index.ts`, `App.tsx` | Registers the root component |
| Firebase access | `src/firebase/client.ts` | Initialises App Check before any call, exposes `auth`, `db` and a typed `callable` helper |
| Contracts | `src/types/contracts.ts` | Request and response types for every callable |
| Features | `src/features/*` | Screens and their API wrappers |
| Device services | `src/services/*` | Location, notifications and error messages |
| Navigation | `src/navigation/*` | Chooses welcome and sign in, the age check, or the main flow, and reopens an active conversation after restart |

Native Firebase keeps the session on the device, so people stay signed in across restarts. Phone verification uses Play Integrity on Android and silent push on iOS, falling back to a reCAPTCHA page only when needed. This removed the old web based verification package, which no longer works with current Expo releases.

Because the app now uses native modules, it runs in a development build rather than Expo Go. See the app README for build steps.

## Onboarding and age check

1. A new install shows four welcome pages that explain codes, proximity, the 72 hour chat and the 18 and over rule, then opens phone sign in.
2. After sign in the navigator asks the server for the account stage. A new account must enter a date of birth before it can use anything else.
3. `confirmAge` checks the date on the server. Only the time of confirmation is stored, never the date of birth.
4. A person under 18 sees a screen that lets them delete the account or sign out. The phone number gets a hold that ends on their 18th birthday, so a second attempt with a different date does not work.
5. Every callable except `confirmAge` and `deleteAccount` runs `assertAccountActive`, which rejects accounts without a confirmed age, banned accounts and phone numbers with a ban hold.

## Account deletion

Settings has a Delete account action, as Apple and Google require. `deleteAccount` does the following in order.

1. Ends every active conversation with the reason `account_deleted` and applies the normal 72 hour retention.
2. Turns off any live code.
3. Writes a hold keyed by a hash of the phone number when the account was reported or banned. A banned hold never expires. A reported hold lasts 180 days. An existing hold is never lowered.
4. Deletes rate limit records, the user document and the sign in account.

Signing up again with the same number brings back the hold, so deletion cannot be used to escape a ban. The hash uses a fixed prefix and the raw number is not stored.

## Message screening

`functions/src/moderation.ts` screens every message before it is stored.

| Layer | What it does |
| --- | --- |
| Contact details | Detects phone numbers, emails, handles and messaging apps |
| Scam rules | Scores one time code requests, payment requests, amounts, investment offers, gift cards, urgency, links and remote access apps. A score of 2 or more is flagged. Sharing contact details early adds one point |
| Google Cloud Natural Language | `documents:moderateText` scores toxicity, insults, threats, sexual content and finance. Finance confidence adds to the scam score |

The classifier call uses the function's own service account, so no API key is stored. It times out after 2.5 seconds and falls back to the rules so a slow call never blocks chat. Set `MODERATION_PROVIDER=rules` to skip the external call.

Flagged messages are still delivered, with a warning shown only to the recipient. Tapping the warning opens the report screen. Each flag adds to the sender's `flagCount`. After 3 flags an active account is marked `reported` for review.

## Free hosting

Passway runs without a paid plan. Cloud Functions and Firestore TTL policies both need Firebase's paid Blaze plan, so the live setup uses free services instead.

| Part | Service | Notes |
| --- | --- | --- |
| Sign in and database | Firebase Spark plan, project `passway-2ddc8` | Firestore in `asia-south1` |
| Callables | Vercel Hobby, `https://passway-api.vercel.app` in Mumbai (`bom1`) | `functions/api/[name].ts` serves the Firebase callable protocol for every handler |
| Expired data | `services/cleanup.ts` | Runs at most every 15 minutes after a request and once a day from a Vercel cron |
| App builds | Expo EAS free plan, project `@naveenbharti310s-team/passway` | Android APK shared by link |
| Device tests | Firebase Test Lab free quota | Robo tests on real phones |

The handlers are the same code that Cloud Functions would run. `authedCallable` exposes each handler, and `src/http/server.ts` checks the Firebase ID token, optionally checks App Check, runs the handler and returns `{ result }` or `{ error }` in the callable format. The app switches to this server when `EXPO_PUBLIC_API_URL` is set.

Limits of the free setup:

1. App Check is off (`ENFORCE_APP_CHECK=false` on Vercel and `EXPO_PUBLIC_APP_CHECK=off` in the app) because Play Integrity only works for apps installed from Google Play. Turn both back on after publishing to the store.
2. Expired documents are deleted by the sweep, not by TTL. The app hides expired messages straight away, but they can stay in the database for up to a day when nobody is using the app.
3. Message screening uses the built in rules. The Google classifier needs a billing account.
4. Real Passway SMS uses the configured 2Factor provider and its credits/budgets; Firebase real phone-auth SMS requires Blaze. Fictional Firebase test numbers send no SMS and do not consume SMS quota.
5. Vercel Hobby is for non commercial use. Move to Cloud Functions or a paid host before charging money.

Moving to the paid Firebase plan later needs no code changes. Deploy the functions with the Firebase CLI, leave `EXPO_PUBLIC_API_URL` empty, add `ttl: true` back to the `deleteAt` field overrides, and turn App Check on.

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
| Mobile | Historical findings changed over time | Expo 57, React Native 0.86, React Native Firebase 26.4, TypeScript 6.0 | Current audit after SDK patch alignment: 21 high affected entries from `braces` and `node-forge`; see architecture audit |

Recheck current advisory results: the newer audit found both `node-forge` and `braces` build-tool advisories. At that check, their latest releases were still affected. It sits in Expo CLI's code signing helper, which runs on a developer machine or build server and is not shipped in the app bundle. Recheck it with `npm audit` before each release.

Two overrides are in place. `uuid` is raised to 11.1.1 in both packages because older build tools pinned a vulnerable version. `@grpc/grpc-js` is raised to 1.14 for the Firebase JS SDK used only by the security rule tests.

## Validation

1. Backend: 116 regression tests, including age checks, holds after deletion, account deletion, scam scoring, classifier fallback, flag escalation and the web server's token checks and error format.
2. Security rules: 25 tests against the Firestore emulator, including denied access to holds and maintenance records and clients being unable to set their own age or flag count.
3. Integration: 11 tests against the Firestore emulator using real transactions, including account deletion, the cleanup sweep and the once per interval maintenance claim.
4. Live check against the deployed server with a real Firebase sign in token: the age gate blocked code generation, age confirmation, code generation, code deactivation and account deletion all worked, and the test account was removed.
5. TypeScript checks for the app and backend.
6. Android and iOS JavaScript bundles from a clean install.
7. Maestro flows for onboarding, age check, code generation and deletion, ready to run on a device. See [device testing](device-testing.md).


## Still needed before release

1. Pay the Google Play fee, publish the app, then turn App Check on in the app and on the server.
2. Pay for the Apple developer program to build for iPhone.
3. Upgrade to the Blaze plan when usage grows, to get TTL deletion, Cloud Functions and the Google classifier.
4. Build a review process for reports and flagged accounts.
5. Add crash reporting and history beyond the latest 200 messages.
6. Proximity still compares locations reported by the device. App Check raises the cost of faking calls but does not prove physical presence.
