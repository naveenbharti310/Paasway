# Passway

A first pass at the codebase, matching passway_architecture_and_data_model.md
and the six screen flow shown in the mockup. Both the app package and the
functions package type check cleanly with no errors (`npx tsc --noEmit`
in each), and `npx expo export` bundles the app for both iOS and Android
without errors too, that is a real Metro bundle, not just a type check.

## What is here

```
App.tsx                     navigation entry point
src/types/models.ts          shared data model and the constants tied to
                              the four decisions below
src/theme/colors.ts          the small color set used across screens
src/components/               LabeledField, Button, ScreenHeader, IconBadge,
                              shared across every screen so spacing and
                              styling do not drift screen to screen
src/firebase/config.ts       Firebase init, needs your project keys
src/api/                     client wrappers around the Cloud Functions,
                              the location helper, and the auth and push
                              helpers called after sign in
src/navigation/               auth gate, then the six screen stack
src/screens/                  PhoneAuth, Generate, Code, EnterCode,
                              Request, Chat, Ended
functions/src/index.ts        generateTid, redeemTid, respondToRequest,
                              deactivateTid, sendMessage, endConnection,
                              fileReport
functions/src/geo.ts          geohash proximity check
functions/src/moderation.ts   message screening hook
functions/src/push.ts         sends the incoming request notification
firestore.rules              locks every collection to Cloud Functions
                              writes, clients only get scoped reads
firestore.indexes.json       the composite index CodeScreen's query needs
```

## The four decisions, and where they live in the code

- **Geo bucket, geohash precision 7, cell plus 8 neighbors.** `functions/src/geo.ts`,
  used inside `redeemTid` in `functions/src/index.ts`.
- **Message retention, 72 hours, 30 days if reported.** `endConnection` sets
  `deleteAt` on every message, `fileReport` pushes it out further. Set a
  Firestore TTL policy on the `deleteAt` field for both `tids` and
  `connections/{id}/messages` in the Firebase console, that is what actually
  deletes the documents, the code only sets the date.
- **TID always single use.** Enforced by the status machine itself, nothing
  can move a TID back to `active` once it leaves that state, see the comment
  above `redeemTid`.
- **Requester stays anonymous, with an elapsed time hint.** Revised, see
  below, this turned out to be wrong.

## Revision: display names

Full anonymity fought reality, two people who just met and traded a code
out loud already know each other's names. `RequestScreen.tsx` now shows
"Tanya wants to connect" instead of "someone nearby", and `ChatScreen.tsx`
shows the other person's name in the header instead of "Anonymous". No
photo, no browsable profile page, a name typed once on `GenerateScreen.tsx`
or `EnterCodeScreen.tsx`, saved as a personal default in `src/api/profile.ts`
so it is not retyped every time, and attached only to the specific TID or
request someone chose to share, never a page anyone else can look up.

## Audit fixes

A design and engineering pass found four real problems, not just missing
features, and all four are fixed:

- **A banned account could unban itself.** `firestore.rules` used to give
  a signed in user full write access to their own `users/{uid}` document,
  and `status` (`active` / `reported` / `banned`) lived on that same
  document. The rule now lets `displayName` and `pushToken` be updated
  freely but rejects any change to `status`, only Cloud Functions, via
  the Admin SDK, can set it. `generateTid` and `redeemTid` also now call
  `assertNotBanned` before doing anything else, which they never did
  before, the field existed in the schema but nothing enforced it.
- **Reporting someone now actually flags their account.** `fileReport`
  sets the reported user's status to `reported` (never downgrading an
  existing ban), closing the loop between the report button and the ban
  field actually meaning something.
- **Two race conditions.** `redeemTid` used to read a TID's status, decide
  it was redeemable, and only then write it to `pending` as separate
  steps, two people redeeming the same code in the same instant could
  both pass the check before either write landed. `withinRateLimit` had
  the same shape of bug, a burst of concurrent calls could all read the
  same count before any of them wrote it back. Both now run inside a
  Firestore transaction, `respondToRequest` was brought in line with the
  same fix even though its race window was narrower.
- **The missing composite index.** `firestore.indexes.json` now defines
  the `tid` plus `status` index `CodeScreen.tsx`'s query needs. This was
  previously going to throw a real runtime error on first use, not just
  a rough edge.

Screen level: `GenerateScreen`, `CodeScreen`, `EnterCodeScreen`,
`RequestScreen`, `EndedScreen`, and `PhoneAuthScreen` were rebuilt on the
shared components in `src/components/` so the visual fidelity matches what
was actually reviewed and approved rather than the plainer first pass.
`ChatScreen` already matched from the report and block work. Icons are
plain characters, not a vector icon library, on purpose, this environment
has no simulator to visually confirm a glyph name resolves to the right
image, and a wrong string in a style prop fails a type check while a
wrong icon name fails silently at runtime.

## Setup

1. Create a Firebase project, add an iOS and an Android app to it.
2. Turn on Firestore, Authentication with the phone provider, and Cloud
   Functions.
3. Copy your web app config into `src/firebase/config.ts`.
4. `npm install` at the project root, `cd functions && npm install`.
5. `firebase deploy --only firestore:rules,firestore:indexes,functions`.
6. Set a Firestore TTL policy on `deleteAt` for the `tids` collection and
   for the `messages` subcollection under `connections`.
7. `npx expo start` to run against Expo Go on your own phone for quick
   testing during development.

## Building an actual iOS binary

This cannot happen inside this sandbox, not as a matter of access, but
because Xcode only runs on macOS, and this environment is Linux. That is
a hard constraint, not a permissions issue. Two real paths from here,
neither needs me to have a Mac, and neither strictly needs you to have
one either:

**Cloud build through EAS, no Mac required.** `eas.json` in this project
is already set up with three profiles. From your own machine, whatever
OS it runs:

```
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile production
```

The compile happens on Expo's servers. For a production or preview
device build, Apple requires a paid Apple Developer account ($99 a
year) so the build can be code signed, `eas build` walks you through
generating those credentials the first time. Once it finishes, you
install straight onto your own iPhone or distribute through TestFlight,
still no Mac involved at any point.

The one case that does need a Mac is a `simulator` build (the `preview`
profile here is already set up for this), since actually opening the
result needs Xcode's iOS Simulator, which is Mac only. Skip that
profile unless you have one.

**Claude Code, on your own machine.** If you do have a Mac, Claude Code
can drive Xcode directly, install CocoaPods dependencies, and run the
app on a simulator or a connected iPhone without needing EAS at all.
That is the more hands on option if you want to iterate quickly on
native level changes.

## What is wired up versus still a stub

Working: all six screens, phone number sign in with an SMS code (uses
expo-firebase-recaptcha for the reCAPTCHA challenge the Firebase JS SDK
needs), the Cloud Functions for the whole generate through end flow, the
geohash proximity check, rate limiting, Firestore security rules, a push
notification sent through Expo's push service the moment someone
redeems a code, display names shown instead of "anonymous", and report
and block from a menu on the chat screen. Filing a report ends the
connection automatically and extends message retention to 30 days for
review, `functions/src/index.ts`, `fileReport`.

Still a stub:

- `screenMessage` in `functions/src/moderation.ts` returns `none` for the
  scam and harassment flag until a real moderation API or LLM prompt is
  connected. The phone number and app name pattern check next to it is
  real and already working. `earlyContactShare` is also computed and
  currently unused, `ChatScreen.tsx` does not yet surface it as the
  in-chat safety nudge it was designed for.
- Push notifications only reach a device that has previously opened the
  app and granted permission, which `registerForPush` requests right
  after sign in, there is no separate settings toggle for it yet, and
  the token is never refreshed if it rotates after that first save.
- No automated tests, no staging Firebase project separate from
  production, and no crash or error monitoring wired in yet.
- Still no onboarding, permission priming, age gate, settings screen, or
  visual identity work (app icon, splash screen), all flagged in the
  design and engineering audit and none of them started.

