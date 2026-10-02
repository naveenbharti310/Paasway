# Passway

Passway is a mobile app for starting a private conversation with someone nearby without exchanging phone numbers or social profiles. A temporary code connects the two people, and the person who generated it chooses whether to accept the request.

## Requirements

Use Node.js 20 for the Firebase backend. The app uses Expo SDK 51, React Native, TypeScript and Firebase. Dependencies are pinned in the two package lockfiles.

## Install and check

Run these commands from `passway-app/`:

```sh
npm ci
npm ci --prefix functions
npm run typecheck
npm run typecheck --prefix functions
npm run build --prefix functions
```

To start the development server:

```sh
npm start
```

To check JavaScript bundling for Android and iOS:

```sh
npx expo export --platform all
```

A successful bundle does not verify phone authentication, notifications or location on a real device.

## Code layout

Screens and callable wrappers are grouped under `src/features/`. Shared controls are in `src/components/`, device services in `src/services/`, Firebase clients in `src/firebase/`, and routing in `src/navigation/`.

Backend callables are grouped under `functions/src/handlers/`. Shared backend helpers are in `functions/src/lib/`. `functions/src/index.ts` exports the callable names used by the app.

See [code organisation](../docs/code-organisation.md) for the folder map and placement rules.

## Firebase setup

1. Create a Firebase project and register the mobile apps and the web configuration required by the Firebase JavaScript SDK.
2. Enable Firestore, phone authentication and Cloud Functions.
3. Supply the project configuration in `src/firebase/config.ts`. It currently contains placeholders. Firebase client configuration is not an admin credential; access must be protected by rules and backend checks.
4. Configure Firebase project selection and add a `firebase.json` file that points to `functions/`, `firestore.rules` and `firestore.indexes.json`. Those deployment settings are not included yet.
5. After configuration is complete, deploy the functions, rules and indexes with `firebase deploy --only firestore:rules,firestore:indexes,functions`.
6. Configure a Firestore TTL policy on `deleteAt` for the `tids` and `messages` collection groups. A field containing a date does not delete a document by itself.
7. Test phone verification, location permissions, notifications and the complete connection flow on physical devices.

Never commit service account keys, personal access tokens or private signing keys.

## Connection rules

1. A code lasts five minutes. Redemption moves it from active to pending, and there is no return to active for that code document.
2. Proximity uses a geohash with precision 7 and the eight neighbouring cells. Raw coordinates are not saved in the code document.
3. Redemption and request acceptance use Firestore transactions. Rate limit counters also use transactions.
4. Code generation and redemption reject banned accounts. Generation is limited to ten attempts per hour, and redemption attempts to fifteen per hour.
5. Ending a conversation schedules its messages for deletion 72 hours later. Reporting schedules retention for 30 days and ends the conversation. Firestore TTL handles actual deletion after the policy is configured.
6. Reports mark an active reported account for review rather than automatically banning it. An existing ban is not downgraded.

Business data writes for codes, connections and messages go through callable functions. User profile creation and updates still use the client SDK under Firestore rules. The rules also currently permit report creation by an authenticated reporter; reporting through the app uses the callable function.

## Device builds

`eas.json` contains development, preview and production profiles. EAS can build on Expo's servers after project setup and signing credentials are configured.

```sh
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform ios --profile production
```

The current preview profile targets the iOS Simulator, which requires macOS and Xcode to run. A production iOS build needs the appropriate Apple signing and distribution setup. Android and iOS builds still need device testing.

## Work still needed

1. Scam and harassment screening is a placeholder in `functions/src/moderation.ts`. The early contact sharing check exists, but the chat screen does not show the returned safety nudge.
2. Notifications depend on permission and an Expo push token saved after sign in. Token refresh and a settings control are not implemented.
3. The chat menu offers an end action and a report or block action. The latter files a report and ends the conversation; there is no separate persistent block list yet.
4. Automated runtime tests, a staging Firebase project and crash monitoring are not configured.
5. Onboarding, permission explanations, age checks, settings, app icon and splash screen work remain.
6. Firebase configuration and deployment setup must be completed before the app is ready to use.

This folder reorganisation preserves the existing behaviour. It is not a production readiness review.
