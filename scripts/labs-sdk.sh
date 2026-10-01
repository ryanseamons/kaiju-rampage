#!/usr/bin/env bash
# Fetches and builds the Voyage Labs browser SDK into vendor/voyage-labs-sdk (gitignored: the SDK
# lives in Latitude's private repository and is never committed here). Needs GitHub access to
# latitudegames/voyage-labs-sdk. Run once, and again to update.
set -euo pipefail
cd "$(dirname "$0")/.."
dir=vendor/voyage-labs-sdk
if [ -d "$dir/.git" ]; then git -C "$dir" pull -q --ff-only; else gh repo clone latitudegames/voyage-labs-sdk "$dir" -- -q; fi
(cd "$dir" && npm ci --silent && npm run build --silent >/dev/null)
ls -l "$dir/dist/voyagelabs.browser.js"
