# Passway

Passway lets two people who meet in person start a private conversation without exchanging permanent contact details. One person shares a temporary code. The other enters it nearby, and the first person decides whether to accept the request.

The application is in `passway-app/`. Its Firebase backend is in `passway-app/functions/`. The original `passway-app.zip` is kept as an archive, not as the working source.

## Start working

```sh
cd passway-app
npm ci
npm ci --prefix functions
npm run typecheck
npm run typecheck --prefix functions
npm start
```

Firebase configuration still needs to be supplied before signing in or using backend services. See [setup instructions](passway-app/README.md) and [code organisation](docs/code-organisation.md).
