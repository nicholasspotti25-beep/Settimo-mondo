#!/usr/bin/env bash
# Publishes the production PWA (dist/) to the repository's gh-pages branch for GitHub Pages hosting.
# Usage: tools/deploy-pages.sh [--partial]   (--partial builds with SM_PARTIAL=1 while content is still in progress)
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--partial" ]; then export SM_PARTIAL=1; fi
npm run build
touch dist/.nojekyll
REMOTE="$(git remote get-url origin)"
REV="$(git rev-parse --short HEAD)"
TMP="$(mktemp -d)"
cp -R dist/. "$TMP/"
git -C "$TMP" init -q -b gh-pages
git -C "$TMP" add -A
git -C "$TMP" -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" commit -qm "Deploy $REV"
git -C "$TMP" push -f "$REMOTE" gh-pages
rm -rf "$TMP"
echo "deploy-pages: published $REV to gh-pages"
