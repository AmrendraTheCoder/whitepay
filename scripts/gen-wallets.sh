#!/usr/bin/env bash
# Generates fresh WhitePay wallets with Foundry's `cast` and writes the private keys into .env.
# Private keys are NEVER printed; only public addresses are shown.
# Refuses to overwrite a key that is already set.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env
grep -q '^CUSTOMER_PK=' .env || printf '\n# Demo customer (pays in USDT, holds no WBT)\nCUSTOMER_PK=\n' >> .env
for v in ARKIV_WRITER_PK ENS_ADMIN_PK STORE_MERCHANT_PK; do grep -q "^$v=" .env || printf '\n%s=\n' "$v" >> .env; done
grep -q '^MERCHANT_PK=' .env || printf '\n# Demo merchant payout wallet (receives USDT, signs gasless refunds)\nMERCHANT_PK=\n' >> .env

new_key() { cast wallet new --json | sed -n 's/.*"private_key": *"\(0x[0-9a-fA-F]*\)".*/\1/p'; }

set_key() {
  local var="$1" current
  current=$(grep "^${var}=" .env | head -1 | cut -d= -f2-)
  if [ -n "$current" ]; then
    echo "${var}: already set, keeping it"
  else
    local pk; pk=$(new_key)
    [ -n "$pk" ] || { echo "failed to generate key for $var" >&2; exit 1; }
    # replace the empty line in place (macOS + GNU sed compatible)
    sed -i.bak "s|^${var}=.*$|${var}=${pk}|" .env && rm -f .env.bak
  fi
}

for v in DEPLOYER_PK RELAYER_PKS ORDER_SIGNER_PK CUSTOMER_PK MERCHANT_PK ARKIV_WRITER_PK ENS_ADMIN_PK STORE_MERCHANT_PK; do set_key "$v"; done
chmod 600 .env

echo
echo "Public addresses (safe to share):"
for v in DEPLOYER_PK RELAYER_PKS ORDER_SIGNER_PK CUSTOMER_PK MERCHANT_PK ARKIV_WRITER_PK ENS_ADMIN_PK STORE_MERCHANT_PK; do
  pk=$(grep "^${v}=" .env | head -1 | cut -d= -f2- | cut -d, -f1)
  printf '  %-16s %s\n' "${v%_PK*}" "$(cast wallet address --private-key "$pk")"
done
