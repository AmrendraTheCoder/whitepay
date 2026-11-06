# World ($12,500)

World ID = prove unique human without revealing identity.

## Prizes
| Prize | Amount | Notes |
|---|---|---|
| World ID Agent Pass (Continuity only) | $2,500 (1.5/1) | existing projects |
| World ID Agent Pass | $5,000 (2.5/1.5/1) | proofs are **mocked** now (fake identities, not for prod); no sandbox app needed |
| Best Use of IDKit | $2,500 (up to 2 × $1,250) | proportionate credential choice |
| [Cont] Best Use of IDKit | $2,500 (up to 2 × $1,250) | Continuity only |

## Agent Pass requirements
- Integrate official World ID Agent Pass; show full journey: request → user completes → **validated result** → protected action.
- Show a **denied/expired/cancelled** path where the action does NOT happen.
- Validate in a secure backend; no exposed secrets; never trust unvalidated client response.
- Short integration debrief: time to first success, friction, missing docs/capability, single highest-impact improvement.
- Want a meaningful action needing human approval, not a login screen.

## IDKit requirements
- Working app/mini app/onchain flow; ≥1 credential (Proof of Human, Passport/NFC, Selfie Check) verified server- or onchain.
- Explain the trust moment and why the chosen credential is the *minimum sufficient*.
- Show success + one alternative path (cancel/ineligible/rejected). Same debrief.

## Fit for WondrPay
Human/agent approval on refunds or high-value payments; AI agent pays via x402 only if World Agent Pass vouches a human is behind it; one-per-human payment links/discounts.

## Resources
Agent Pass https://auth.world.org/ (docs `/docs`, portal `/portal`) · IDKit guide https://docs.world.org/world-id/idkit/integrate · credentials https://docs.world.org/world-id/idkit/credentials · flows https://docs.world.org/world-id/idkit/verification-flows · Dev portal https://developer.worldcoin.org · Simulator https://simulator.worldcoin.org/id/0x18310f83 · iOS sandbox https://testflight.apple.com/join/Tub7zuyD · Workshop https://www.youtube.com/watch?v=MElIfoDffuw
