#!/bin/sh
# Build only. Explicit diagnostic environment is required. Never publishes.
set -eu
cd "$(dirname "$0")/.."
node scripts/preview-config.cjs
./node_modules/.bin/expo export --platform web --output-dir dist-web
printf '%s\n' 'Built dist-web locally. No files published; use a separately reviewed publishing workflow.'
