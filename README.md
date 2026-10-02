# Passway

Passway lets two people who meet in person start a private conversation without exchanging permanent contact details. One person shares a temporary code. The other enters it nearby, and the first person decides whether to accept the request.

The application is in `passway-app/`. Its Firebase backend is in `passway-app/functions/`.

## Start working

```sh
cd passway-app
npm ci
npm ci --prefix functions
npm run typecheck
npm run typecheck --prefix functions
npm test --prefix functions
npm run test:emulator
```

The app uses native Firebase modules, so it runs in a development build rather than Expo Go. See [setup instructions](passway-app/README.md).

1. [Architecture](docs/architecture.md) explains the design, the review findings, dependency status and remaining release work.
2. [Code organisation](docs/code-organisation.md) maps every folder.
3. [Code audit](docs/code-audit.md) records the earlier fixes.
