#!/usr/bin/env bash
# Attack / hardening checks against a live WhitePay (and optional store). Usage: scripts/security-check.sh [base] [store]
B=${1:-https://whitepay.vercel.app}; S=${2:-https://whitepay-demo-store.vercel.app}
pass=0; fail=0
t() { local name="$1" want="$2" got="$3"; if [[ "$got" == $want ]]; then echo "  ✔ $name ($got)"; pass=$((pass+1)); else echo "  ✘ $name: wanted $want, got $got"; fail=$((fail+1)); fi; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
hdr() { curl -s -D - -o /dev/null "$1" | tr -d '\r' | grep -i "^$2:" | head -1 | cut -d' ' -f2-; }
echo "HEADERS ($B)"
t "CSP with per-request nonce + strict-dynamic" "*nonce-*strict-dynamic*" "$(hdr $B/ content-security-policy)"
t "CSP blocks framing (clickjacking)" "*frame-ancestors 'none'*" "$(hdr $B/ content-security-policy)"
t "HSTS" "max-age=63072000*" "$(hdr $B/ strict-transport-security)"
t "X-Frame-Options" "DENY" "$(hdr $B/ x-frame-options)"
t "nosniff" "nosniff" "$(hdr $B/ x-content-type-options)"
t "no X-Powered-By" "" "$(hdr $B/ x-powered-by)"
n1=$(hdr $B/ content-security-policy | grep -o "nonce-[^']*"); n2=$(hdr $B/ content-security-policy | grep -o "nonce-[^']*")
t "nonce changes every request" "different" "$([[ $n1 != $n2 ]] && echo different || echo same)"
echo "API ABUSE"
t "CSRF: cross-site POST /api/pay blocked" "403" "$(code -X POST $B/api/pay -H 'origin: https://evil.example' -H 'content-type: application/json' -d '{}')"
t "CSRF: form-encoded POST rejected" "415" "$(code -X POST $B/api/send -H 'content-type: application/x-www-form-urlencoded' -d 'a=1')"
t "oversized body rejected" "413" "$(code -X POST $B/api/pay -H 'content-type: application/json' --data-binary @<(head -c 40000 /dev/zero | tr '\0' 'a'))"
t "DELETE method rejected" "405" "$(code -X DELETE $B/api/receipts)"
t "malformed payment rejected" "400" "$(code -X POST $B/api/pay -H 'content-type: application/json' -d '{"entityKey":"0x12"}')"
t "fake refund rejected" "400" "$(code -X POST $B/api/refund -H 'content-type: application/json' -d '{"paymentId":"0x00","amount":"1"}')"
t "SSRF: webhook to cloud metadata refused" "4*" "$(code -X POST $B/api/requests -H 'content-type: application/json' -d '{"order":{"merchant":"0x158D9f52Fe527C85E876ADA9e982B294827EBC14","amount":"1","orderId":"0x'$(printf 'a%.0s' {1..64})'","deadline":"9999999999"},"merchantSig":"0x00","webhook":"https://169.254.169.254/latest"}')"
t "forged order signature rejected" "4*" "$(code -X POST $B/api/requests -H 'content-type: application/json' -d '{"order":{"merchant":"0x158D9f52Fe527C85E876ADA9e982B294827EBC14","amount":"1","orderId":"0x'$(printf 'b%.0s' {1..64})'","deadline":"9999999999"},"merchantSig":"0x'$(printf 'c%.0s' {1..130})'"}')"
t "QR endpoint refuses javascript: URLs" "400" "$(code "$B/api/qr?data=javascript:alert(1)")"
codes=""; for i in $(seq 1 10); do codes="$codes $(code -X POST $B/api/names -H 'content-type: application/json' -d '{}')"; done
t "rate limit kicks in (names: 6/min)" "*429*" "$codes"
echo "SDK"
SDKV=$(grep -o "sdk/v[0-9.]*/checkout.js" apps/demo-store/lib/sdk.ts)
t "SDK served cross-origin" "\*" "$(hdr $B/$SDKV access-control-allow-origin)"
t "pinned SDK version is immutable-cached" "*immutable*" "$(hdr $B/$SDKV cache-control)"
want="sha384-$(curl -s $B/$SDKV | openssl dgst -sha384 -binary | openssl base64 -A)"
t "SDK matches the pinned SRI hash" "$(grep -o 'sha384-[A-Za-z0-9+/=]*' apps/demo-store/lib/sdk.ts)" "$want"
t "webhook signer published" "*0x27d2F6770F18E1C0Eefc129124747407Ef44aBe1*" "$(curl -s $B/api/webhook-key)"
if [[ -n "$S" ]]; then
  echo "STORE ($S)"
  t "store CSP nonce" "*nonce-*" "$(hdr $S/ content-security-policy)"
  t "store: unknown product refused" "400" "$(code -X POST $S/api/create-order -H 'content-type: application/json' -d '{"payload":{"sku":"__proto__"}}')"
  t "store: price can't be injected" "400" "$(code -X POST $S/api/create-order -H 'content-type: application/json' -d '{"payload":{"sku":"free"},"amount":"0.000001"}')"
  t "store: cross-site order spam blocked" "403" "$(code -X POST $S/api/create-order -H 'origin: https://evil.example' -H 'content-type: application/json' -d '{"payload":{"sku":"chai-kit"}}')"
  t "store: unsigned webhook rejected" "401" "$(code -X POST $S/api/webhook -H 'content-type: application/json' -d '{"event":"payment.settled","txHash":"0x00","orderId":"0x00","amount":"1"}')"
  ts=$(( $(date +%s) - 3600 ))
  t "store: replayed (1h old) webhook rejected" "401" "$(code -X POST $S/api/webhook -H 'content-type: application/json' -H "x-whitepay-timestamp: $ts" -H "x-whitepay-signature: 0x$(printf 'd%.0s' {1..130})" -d '{}')"
  t "store: plain.html CSP" "*script-src 'self' https://whitepay.vercel.app*" "$(hdr $S/plain.html content-security-policy)"
fi
echo; echo "$pass passed, $fail failed"; [[ $fail == 0 ]]
