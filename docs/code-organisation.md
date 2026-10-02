# Code organisation

## Mobile app

Screens and their callable wrappers live with the feature that owns them.

| Folder | Responsibility |
| --- | --- |
| `passway-app/src/features/auth/` | Phone verification and user document creation |
| `passway-app/src/features/connections/` | Generate and enter a code, review a request, end a connection, find an active connection after restart |
| `passway-app/src/features/chat/` | Conversation screen and message sending |
| `passway-app/src/features/profile/` | Read and save the default display name |
| `passway-app/src/features/safety/` | Submit a report or block a person |
| `passway-app/src/services/` | Device location, notification registration and error messages |
| `passway-app/src/components/` | Reusable controls and screen headings |
| `passway-app/src/firebase/` | Native Firebase clients, App Check and the typed callable helper |
| `passway-app/src/navigation/` | Authenticated routing and route parameter types |
| `passway-app/src/theme/` | Shared colours |
| `passway-app/src/types/` | Client data models and callable contracts |

`index.ts` registers `App.tsx`, which loads the navigator. `app.config.ts` holds the Expo and native plugin configuration. The navigator chooses the authentication screen or the connection flow. Route types are in `navigation/types.ts` so screens do not need to import the navigator component.

Shared components should not import feature code. A feature may use another feature's API when needed, but should not import its screen. For example, the chat screen uses the connection API to end a conversation and the safety API to report it.

## Backend

`functions/src/index.ts` loads global options from `config.ts` and exports the deployed functions. Keep those export names stable because the mobile app calls them by name.

| File or folder | Responsibility |
| --- | --- |
| `functions/src/handlers/tids.ts` | Generate, redeem and deactivate temporary codes |
| `functions/src/handlers/connections.ts` | Accept or decline a request, end a connection and run the hourly idle sweep |
| `functions/src/handlers/messages.ts` | Validate and store messages |
| `functions/src/handlers/reports.ts` | Store reports, block people, end those conversations and extend retention |
| `functions/src/config.ts` | Region, instance limits and the App Check parameter |
| `functions/src/services/connections.ts` | Shared logic for ending connections and closing idle ones |
| `functions/src/lib/callable.ts` | Sign in, App Check and payload checks for every callable |
| `functions/src/lib/blocks.ts` | Record and check two way blocks |
| `functions/src/lib/logger.ts` | Structured logging |
| `functions/src/lib/firebase.ts` | Initialise the Admin SDK and expose the database client |
| `functions/src/lib/accounts.ts` | Check whether an account is banned |
| `functions/src/lib/rateLimits.ts` | Enforce the existing transaction based rate limits |
| `functions/src/lib/tid.ts` | Generate a candidate code using secure randomness |
| `functions/src/lib/validation.ts` | Validate callable input and participant identity |
| `functions/src/lib/retention.ts` | Apply message retention in bounded transactions |
| `functions/src/handlers/retention.ts` | Retry message retention after a connection changes |
| `functions/src/constants.ts` | Timing, limits and geohash precision |
| `functions/src/geo.ts` | Geohash encoding and neighbouring cells |
| `functions/src/moderation.ts` | Message screening hook |
| `functions/src/push.ts` | Expo notification delivery without message content |

Handlers use `authedCallable` and import shared services directly. They should not import the deployment entry point or each other.

## Working rules

1. Put a screen and its callable wrappers in the feature that owns them.
2. Keep visual components reusable. Put business rules in the backend rather than in UI controls.
3. Preserve callable names, collection names and stored field names unless changing the contract deliberately.
4. Update imports and documentation when moving a file.
5. Run `npm run check` before committing.
6. Do not commit dependencies, generated bundles, native folders or credentials.
7. Add new callables through `authedCallable` and add their types to `src/types/contracts.ts`.

## Tests

Backend regression tests are in `functions/test/`. Security rule tests are in `test/`. The backend integration tests use the local Firestore emulator and refuse to run against a production database.

The initial folder reorganisation preserved behaviour. Subsequent fixes are recorded in [the code audit](code-audit.md).
