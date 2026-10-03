#!/bin/sh
# Builds the browser preview of Passway and publishes it to
# https://passway-preview.vercel.app. Run from the passway-app folder.
# These Firebase web settings are public by design. Access is controlled by
# sign in, the database rules and the server checks.
set -e
export EXPO_PUBLIC_FIREBASE_WEB_API_KEY=AIzaSyBII56hy-eG6GWaL1GS4L7ZmlPbVIGh1uA
export EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=passway-2ddc8.firebaseapp.com
export EXPO_PUBLIC_FIREBASE_PROJECT_ID=passway-2ddc8
export EXPO_PUBLIC_FIREBASE_WEB_APP_ID=1:657281875911:web:df4783bafa53bb72eea3e2
export EXPO_PUBLIC_FIREBASE_SENDER_ID=657281875911
export EXPO_PUBLIC_API_URL=https://passway-api.vercel.app
export EXPO_PUBLIC_APP_CHECK=off
export EXPO_PUBLIC_SHOW_TEST_NUMBERS=1
rm -rf dist-web
npx expo export --platform web --output-dir dist-web
cat > dist-web/vercel.json <<'JSON'
{"rewrites":[{"source":"/(.*)","destination":"/index.html"}],"headers":[{"source":"/(.*)","headers":[{"key":"X-Robots-Tag","value":"noindex"}]}]}
JSON
cd dist-web
npx vercel@latest deploy --prod --yes --project passway-preview
