#!/usr/bin/env bash
# One deliberate production release (pushes to GitHub no longer deploy: vercel.json git.deploymentEnabled=false).
# Deploys from a clean checkout of a commit, so uncommitted work never ships, and only the apps you name.
#   scripts/deploy.sh            -> web only, at HEAD
#   scripts/deploy.sh web store  -> both
#   COMMIT=abc123 scripts/deploy.sh store
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
COMMIT="${COMMIT:-$(git rev-parse --short HEAD)}"
APPS=("${@:-web}")
DIR="$(mktemp -d)/wondrpay-$COMMIT"
git worktree add -q "$DIR" "$COMMIT"
trap 'git worktree remove --force "$DIR" >/dev/null 2>&1 || true' EXIT
for app in "${APPS[@]}"; do
  case "$app" in
    web)   cp -R .vercel "$DIR/"; (cd "$DIR" && npx vercel deploy --prod --yes) ;;
    store) (cd "$DIR" && rm -rf .vercel && VERCEL_ORG_ID="${STORE_ORG_ID:-team_ZyX1GRPBNoWMpb5WCm1X4YkE}" VERCEL_PROJECT_ID="${STORE_PROJECT_ID:-prj_8Wf2HAAkTLBzQSU0oaVoHKkvK4QE}" npx vercel deploy --prod --yes) ;;
    *) echo "unknown app: $app (use web or store)"; exit 1 ;;
  esac
done
