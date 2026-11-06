#!/usr/bin/env bash
# Copy WondrPay onto ANOTHER Vercel account (e.g. a teammate's fork), without printing any secret.
# The person whose account it is logs in first:   npx vercel login
# Then:
#   scripts/setup-vercel-copy.sh <web-project-name> <store-project-name>
# It links (or creates) both projects in the logged-in account, copies the env vars from .env (values are piped, never
# echoed), points the web app and the store at their NEW addresses, and deploys both once (git deploys stay off).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
WEB="${1:?web project name, e.g. wondrpay-web}"
STORE="${2:?store project name, e.g. wondrpay-store}"
[ -f .env ] || { echo ".env missing"; exit 1; }
set -a; . ./.env; set +a
COPY=$(mktemp -d)/wondrpay
git worktree add -q "$COPY" HEAD
trap 'git worktree remove --force "$COPY" >/dev/null 2>&1 || true' EXIT
cd "$COPY"

setenv() { # name value  (production only; replaces an existing value)
  npx vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf %s "$2" | npx vercel env add "$1" production >/dev/null
}

echo "== web: $WEB"
rm -rf .vercel
npx vercel link --yes --project "$WEB" >/dev/null
npx vercel project inspect "$WEB" >/dev/null # make sure it exists
WEB_URL="https://$WEB.vercel.app"
WEB_KEYS=(WC_RPC_URL WC_RPC_FALLBACK USDT_ADDRESS DEPLOYER_PK RELAYER_PKS ORDER_SIGNER_PK ROUTER_ADDRESS REGISTRY_ADDRESS SEPOLIA_RPC_URL
  ENS_ADMIN_PK ENS_PARENT ENS_USER_REGISTRY ENS_RESOLVER WORLD_APP_ID WORLD_RP_ID RP_SIGNING_KEY WORLD_ENV WORLD_IDP_CLIENT_ID
  WORLD_IDP_CLIENT_SECRET WORLD_IDP_ISSUER ARKIV_ACCESS_KEY ARKIV_WRITER_PK DATABASE_URL WEBHOOK_SECRET NEXT_PUBLIC_WC_PROJECT_ID
  WEBHOOK_SIGNER_PK REWARDS_PK REFUND_AGENT_PK WORLD_REWARD_ACTION WORLD_REFUND_ACTION)
for k in "${WEB_KEYS[@]}"; do v="${!k:-}"; [ -n "$v" ] && setenv "$k" "$v" && echo "  set $k"; done
setenv NEXT_PUBLIC_APP_URL "$WEB_URL"; echo "  set NEXT_PUBLIC_APP_URL=$WEB_URL"
echo "  note: the project's Root Directory must be apps/web (Settings → General) if it was created by importing the repo"
npx vercel deploy --prod --yes

echo "== store: $STORE"
rm -rf .vercel
npx vercel link --yes --project "$STORE" >/dev/null
STORE_URL_NEW="https://$STORE.vercel.app"
for k in STORE_MERCHANT_PK STORE_ADMIN_CODE WONDRPAY_SECRET_KEY STORE_MERCHANT_ADDRESS; do v="${!k:-}"; [ -n "$v" ] && setenv "$k" "$v" && echo "  set $k"; done
setenv WHITEPAY_URL "$WEB_URL"; setenv NEXT_PUBLIC_WHITEPAY_URL "$WEB_URL"; setenv STORE_URL "$STORE_URL_NEW"
echo "  set WHITEPAY_URL / NEXT_PUBLIC_WHITEPAY_URL=$WEB_URL, STORE_URL=$STORE_URL_NEW"
echo "  note: the store project's Root Directory must be apps/demo-store"
npx vercel deploy --prod --yes

cat <<EOF

Done. Web: $WEB_URL   Store: $STORE_URL_NEW
Still to do by hand (outside Vercel):
 - Reown / WalletConnect dashboard: add $WEB_URL to the project's allowed domains (MetaMask over WalletConnect)
 - WondrPay Business: add $(echo "$STORE_URL_NEW" | sed 's#https://##') to the store's website domains (portal) so its return URLs pass
EOF
