# World ID integration debrief

## What we built (IDKit 4.6, proofs verified only on our backend)
| Trust moment | Action | Signal | Effect | Denied / cancelled path |
|---|---|---|---|---|
| Claim a personal name `you.whitepay.eth` | `whitepay-name` | wallet address | ENSv2 subname issued; nullifier stored on Arkiv (`whitepay.worldclaim`), so **one name per human** | No name is issued; the claim card stays |
| Verified-shop badge | `whitepay-shop` | shop wallet | `MerchantRegistry.setStatus(verified)` on Whitechain, Arkiv profile `verified=true`, ENS text `verified=true`; **one verified shop per human** | Badge stays "Unverified" |
| Same human, new wallet | `whitepay-name` | new wallet | Same nullifier recognised, so the name **moves** to the new wallet (ENS addr records re-pointed) | n/a |

**Why Proof of Human:** these are uniqueness problems (one name, one shop, one person approving a large transfer). They need "a unique human", not identity attributes, so Passport/Selfie would ask for more than we need.

## Time to first success
- Setup and RP signing worked within about an hour.
- The **first end-to-end success took several hours** across four failures (below). In the end, the claim had actually succeeded server-side while the widget showed "declined".

## Friction encountered
1. **Staging vs production.**
   - We started with `environment: "staging"`, but a real World App produces **production** proofs.
   - The Developer Portal accepted the proof (consuming the user's one verification for that action), then our server rejected it for the environment mismatch.
   - From then on, World App showed "**Already verified**" for that action, and we couldn't recover it. We retired the action.
2. **`RP_SIGNING_KEY` format.** The first value we were given was 40 hex characters (an address), not the 32-byte private key. Nothing in the portal UI made the difference obvious.
3. **Uniqueness actions are one-time per action.** That's correct for uniqueness, but surprising for a "step-up" use case, and the docs don't say it clearly.
4. **Unregistered action names fail inside World App** with a bare "**Failed**". We'd tried a fresh action per payment, assuming on-the-fly actions. Nothing reached our backend to debug with.
5. **Host verification timeout.**
   - Our `handleVerify` did slow work (two Sepolia ENS transactions, about 30 s).
   - The widget gave up and showed "**Verification declined**" even though the backend completed and the name was issued.
   - Fix: respond in about 2 s (verify, then record on Arkiv) and finish the ENS work after the response.
6. **Naming.** The prize says "World ID **Agent Pass**", but the docs and site only say "World IdP"/OIDC. It was unclear whether IDKit or IdP was expected.
7. **Docs conflict on testing.** The IDKit pages point to the simulator with `staging`; the newer Sandbox docs describe TestFlight/Play builds and don't mention the simulator.

## Missing capability / documentation
- A clear statement: "**one proof per (human, action)**; the second attempt is rejected as `nullifier_replayed`", plus the recommended pattern for repeat checks (session proofs vs unlimited-verification actions).
- An **error surfaced to the RP** when World App rejects an unknown or misconfigured action, instead of a generic "Failed".
- A guide to **environment mismatch**: what happens if staging and production are mixed, and how to reset a consumed test verification.
- A **documented timeout** for `handleVerify`, with a recommendation to keep it fast.
- A key-format hint in the portal ("the signing key is 0x + 64 hex characters").

## The one improvement with the greatest impact
**Return structured, specific errors to the app.** For example `unknown_action`, `environment_mismatch`, `already_verified_for_action` (with the action name) and `host_verification_timeout`. Every hour we lost was a generic "Failed", "Declined" or "Already verified" with no way to see which rule we'd hit.
