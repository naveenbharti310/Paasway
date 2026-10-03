# Passway

Passway is a mobile app for starting a private conversation with someone nearby without exchanging phone numbers or social profiles. A temporary code connects the two people, and the person who generated it chooses whether to accept the request.

## Requirements

1. Node.js 22 for the backend and tooling.
2. Java 21 or later for the Firestore emulator tests.
3. An Expo account and EAS CLI for device builds. Android Studio or Xcode is needed only for local native builds.

The app uses Expo SDK 57, React Native 0.86, React Native Firebase 26 and TypeScript. The backend uses Firebase Functions 7 and Firebase Admin 14. Versions are pinned in the two lockfiles.

## Install and check

From `passway-app/`:

```sh
npm ci
npm ci --prefix functions
npm run typecheck
npm run typecheck --prefix functions
npm test --prefix functions
npm run test:emulator
npx expo export --platform all
```

`npm run check` runs all of these in order.

## Live setup

Passway is already set up on free plans. Nothing here costs money.

| Part | Where |
| --- | --- |
| Firebase project | `passway-2ddc8` on the Spark plan, Firestore in Mumbai |
| Server | `https://passway-api.vercel.app` on Vercel Hobby |
| App builds | Expo project `@naveenbharti310s-team/passway` |
| Web preview | `https://passway-preview.vercel.app`, the same app running in a browser |
| Test numbers | `+91 99999 00001`, `+91 99999 00002` and `+91 99999 00003`, code `123456` |

To ship a change:

1. Server: from `passway-app/functions`, run `npx vercel deploy --prod`.
2. Rules and indexes: from `passway-app`, run `npx firebase-tools deploy --project passway-2ddc8 --only firestore:rules,firestore:indexes`.
3. App: from `passway-app`, run `npx eas-cli build --platform android --profile preview`. Expo emails a link to install the new APK.
4. Web preview: from `passway-app`, run `npm run preview:web`.

Vercel holds `FIREBASE_SERVICE_ACCOUNT`, `CRON_SECRET`, `ENFORCE_APP_CHECK=false`, `MODERATION_PROVIDER=rules` and `ALLOWED_ORIGINS=https://passway-preview.vercel.app`. Expo holds `GOOGLE_SERVICES_JSON` as a secret file and a push key that can only send notifications. See the free hosting section in [architecture](../docs/architecture.md) for the limits of this setup.

### Web preview

The web preview runs the same screens in a browser so the app can be tried on any phone, including an iPhone. `metro.config.js` swaps the native Firebase packages for the small files in `src/firebase/web`, which use the Firebase JavaScript SDK. Differences from the phone app:

1. A reCAPTCHA check runs before the sign in code is sent. It is usually invisible.
2. There are no push notifications.
3. App Check is off. The server only accepts browser calls from the addresses in `ALLOWED_ORIGINS`.

## Firebase setup on a paid plan

These steps apply when moving to the Blaze plan and Cloud Functions.

1. Create a Firebase project. Enable Phone authentication, Firestore, Cloud Functions, Cloud Scheduler and App Check.
2. Register an Android app with package `com.passway.app` and an iOS app with bundle ID `com.passway.app`. Download `google-services.json` and `GoogleService-Info.plist` into this folder. Both are ignored by Git. For EAS builds, upload them as file secrets and set `GOOGLE_SERVICES_JSON` and `GOOGLE_SERVICES_PLIST` to their paths.
3. Add the Android app's SHA 256 signing fingerprints in the Firebase console so phone sign in and Play Integrity work.
4. In App Check, register Play Integrity for Android and App Attest for iOS. For development builds, create a debug token, register it in the console, and set `EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN` in `.env`.
5. Set `EXPO_PUBLIC_EAS_PROJECT_ID` to enable push notifications.
6. Deploy to a staging project first:

```sh
npx firebase-tools@15.32.1 deploy --project YOUR_PROJECT_ID --only functions,firestore:rules,firestore:indexes
```

7. Confirm the TTL policies from `firestore.indexes.json` are active in the console. TTL deletion is asynchronous.
8. Enable the Cloud Natural Language API in the Google Cloud console for the same project. Functions call it with their own service account. To use only the built in rules, set `MODERATION_PROVIDER=rules` in `functions/.env.YOUR_PROJECT_ID`.
9. For testing, add test phone numbers under Authentication, Sign in method, Phone. The Maestro flows use `+91 99999 00001` with code `123456`.

App Check is enforced on every callable by default. For a staging project tested only from simulators, set `ENFORCE_APP_CHECK=false` in `functions/.env.YOUR_PROJECT_ID`. Never turn it off in production.

## Run on a device

Native Firebase modules do not run in Expo Go. Build a development client once, then use the dev server:

```sh
npx eas-cli login
npx eas-cli build --profile development --platform android
npm start
```

See [device testing](../docs/device-testing.md) for the two phone checklist and the Maestro flows.

With Android Studio or Xcode installed, `npm run android` or `npm run ios` builds locally instead. The `android/` and `ios/` folders are generated by prebuild and are not committed.

## Code layout

Screens and API wrappers are grouped under `src/features/`. `src/firebase/client.ts` is the only place that initialises Firebase. Callable request and response types are in `src/types/contracts.ts`.

Backend callables are in `functions/src/handlers/`. Shared connection logic is in `functions/src/services/`. Helpers for validation, blocks, retention and rate limits are in `functions/src/lib/`.

See [architecture](../docs/architecture.md) and [code organisation](../docs/code-organisation.md).

## Connection rules

1. A code lasts five minutes and can be claimed once.
2. Proximity uses a geohash of precision 7 plus the eight neighbouring cells. Raw coordinates are never stored.
3. Generation is limited to ten per hour, redemption attempts to fifteen per hour, messages to sixty per minute and reports or blocks to twenty per hour.
4. Every message expires 72 hours after it is sent. Ending a conversation keeps messages for 72 hours from the end. A report holds the conversation for 90 days (3 months).
5. Connections with no messages for 72 hours are closed by an hourly job.
6. Reporting or blocking prevents the two people from connecting again. Neither person is told about a block.
7. A report marks the other account for review. It does not ban automatically, and an existing ban is never lowered.
8. Everyone must confirm they are 18 or over. Only the confirmation time is stored.
9. Three flagged messages mark an account for review.
10. Deleting an account removes the profile and sign in. A reported or banned phone number keeps a hold so it cannot start over.

Never commit service account keys, Firebase config files, access tokens or signing keys.
