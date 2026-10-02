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
npm test --prefix functions
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

1. Create a Firebase project, register the apps, and enable phone authentication, Firestore and Cloud Functions.
2. Copy `.env.example` to `.env` and supply the Firebase web configuration. `EXPO_PUBLIC_` values are bundled into the app, so never use that prefix for admin credentials or other secrets.
3. Set `EXPO_PUBLIC_EAS_PROJECT_ID` to the Expo project ID if notifications are needed. Notification registration is skipped when it is missing.
4. `firebase.json` contains deployment paths and a backend build step. Select the real Firebase project explicitly when deploying.
5. Deploy with `npx firebase-tools@13.35.1 deploy --project YOUR_PROJECT_ID --only functions,firestore:rules,firestore:indexes`.
6. The field overrides in `firestore.indexes.json` enable TTL for code, request, connection, message, report and rate limit records. Check the deployed TTL policies. Firestore TTL is asynchronous, and deleting a connection document does not delete its message subcollection; message documents have their own TTL policy.
7. Test authentication, notifications, location, background behaviour and the complete flow on physical devices.

Never commit service account keys, access tokens or signing keys.

## Automated checks

```sh
npm run typecheck
npm run typecheck --prefix functions
npm test --prefix functions
npm run test:emulator
```

The emulator command requires Java and downloads the pinned Firebase CLI and emulator when needed. It uses the local `demo-passway` project, not the live Firebase project. It runs security rule checks and backend transaction tests, including concurrent redemption, message ending races and retention across more than 500 messages.

## Connection rules

1. A code lasts five minutes. Redemption moves it from active to pending, and there is no return to active for that code document.
2. Proximity uses a geohash with precision 7 and the eight neighbouring cells. Raw coordinates are not saved in the code document.
3. Redemption and request acceptance use Firestore transactions. Rate limit counters also use transactions.
4. Code generation and redemption reject banned accounts. Generation is limited to ten attempts per hour, redemption attempts to fifteen per hour, and messages to sixty per minute. Messages are limited to 2,000 characters.
5. Ending a conversation schedules its messages for deletion 72 hours later. Reporting schedules retention for 30 days and ends the conversation. Firestore TTL handles actual deletion after the policy is configured.
6. Reports mark an active reported account for review rather than automatically banning it. An existing ban is not downgraded.

Code, connection, message and report writes go through callable functions. Profile creation and bounded display name and push token updates use the client SDK under Firestore rules. Moderation status and account identity cannot be changed by the client. A retryable backend trigger repairs message retention after an end or report if the foreground operation is interrupted.

## Device builds

`eas.json` contains development, preview and production profiles. EAS can build on Expo's servers after project setup and signing credentials are configured.

```sh
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform ios --profile production
```

The current preview profile targets the iOS Simulator, which requires macOS and Xcode to run. A production iOS build needs the appropriate Apple signing and distribution setup. Android and iOS builds still need device testing.

## Work still needed

1. Scam and harassment classification is not connected. The contact sharing nudge is displayed, but it is not a moderation service.
2. The current phone verification package and Expo SDK need a planned upgrade. Authentication persistence across app restarts is not configured.
3. Notifications need real Expo project configuration, permissions and device testing. Token refresh is registered while the app is running.
4. Reporting closes the conversation. There is no persistent block list or review dashboard yet.
5. The chat shows the latest 200 messages. Earlier history pagination and recovery of an active conversation after restarting the app remain.
6. App Check, stronger device attestation, onboarding, age checks, settings, crash monitoring and a staging environment are not configured.
7. Dependency security findings remain. See [the audit report](../docs/code-audit.md). This code is not ready for a production release.
