# All Tracks & Sub-tracks (ETHGlobal Mumbai 2026)

16 sub-tracks across 4 sponsors. **6 are Continuity-only** (existing projects). A team starting fresh can enter the other 10.
You can select **3 partner prizes** per submission; all Arkiv sub-tracks together count as **one** pick.

Legend: 🆕 = from scratch OK · 🔁 = Continuity only (needs a pre-hackathon product)

## Whitechain — $15,000 (EVM L2 on OP Stack, chain 1874, official USDT)
| # | Sub-track | $ (places) | Who | One-line brief | Explicitly won't place |
|---|---|---|---|---|---|
| W1 | **Operate**: Stablecoin Payments for Business | 5,000 (2.5k/1.5k/1k) | 🆕 | Merchant USDT payment flow: SDK/widget a demo app adds in ~20 lines; merchant + customer views; refunds/renewals/export | plain transfer button, tipping jar, **bill splitter**, custodial bridge, payroll/escrow/splits alone |
| W2 | **Tokenize**: Real World Finance | 4,000 (2.5k/1.5k) | 🆕 | RWA lifecycle with rules enforced in the contract (allowlist, transfer limits, maturity), paid in USDT | mint-button token, unenforced ownership NFTs |
| W3 | **Scale**: Payments Nobody Notices | 3,000 (2k/1k) | 🆕 | Payer (human or AI agent) pays USDT with no gas, seed phrase or chain knowledge: relayer, smart account, x402 | payer signs a gas tx; AI chat that never pays |
| W4 | **Continuity**: Bring Your Product | 3,000 (1.5k/1.5k) | 🔁 | Add USDT payments or an onchain feature to an existing product | repackaging old work |

All four require: verified contracts on 1874, ≥1 real USDT payment with tx link, a "why onchain" line, steady commits, a 2–4 min video, and `WHITECHAIN_FEEDBACK.md`.

## ENS — $10,000 (ENSv2, Ethereum mainnet / Sepolia)
| # | Sub-track | $ | Who | Brief |
|---|---|---|---|---|
| E1 | **Best Use of ENSv2** | 7,000 (3k/2k/1k/1k) | 🆕 | Subname registries, Permissioned Resolver, Enhanced Access Control, aliasing; bonus for AI agents as namespaces |
| E2 | Best Integration into Existing Project | 3,000 (2k/1k) | 🔁 | ENSv2 (mainnet) added to an existing project |

Requires ENSv2 at the core, no hard-coded values, a live demo link, and open source.

## World — $12,500 (World ID)
| # | Sub-track | $ | Who | Brief |
|---|---|---|---|---|
| D1 | **World ID Agent Pass** | 5,000 (2.5k/1.5k/1k) | 🆕 | A meaningful action gated by fresh human verification (proofs are mocked, no sandbox needed) |
| D2 | **Best Use of IDKit** | 2,500 (2 × 1,250) | 🆕 | A "trust moment" using the minimum sufficient credential (Proof of Human, Passport, Selfie) |
| D3 | Agent Pass (Continuity) | 2,500 (1.5k/1k) | 🔁 | Same as D1, for an existing product |
| D4 | [Cont] Best Use of IDKit | 2,500 (2 × 1,250) | 🔁 | Same as D2, for an existing product |

All require backend validation, a success path plus a denied/cancelled path, and an integration debrief.

## Arkiv — $15,000 (DB-chain, chain 7794095; one track win per team + Swarm bonus)
| # | Sub-track | $ | Who | Brief |
|---|---|---|---|---|
| A1 | **Mirror something Ethereum depends on** | 4,000 (3k/1k) | 🆕 | Import public Ethereum data (token lists, chain registries, labels, 4byte signatures) into queryable entities; not Sourcify |
| A2 | **Build on Arkiv (from scratch)** | 4,000 (3k/1k) | 🆕 | An app whose data lives in Arkiv entities (owner wallet + expiry + filters) |
| A3 | Build on Arkiv (existing) | 4,000 (3k/1k) | 🔁 | Move part of an existing product's data into Arkiv |
| A4 | **Node tooling** | 2,000 | 🆕 | Operator dashboard or slow-query finder that runs next to a node |
| A5 | **Arkiv + Swarm bonus** | 500 | 🆕 | Stacks on A1/A2/A4: files on Swarm, referenced from entities |
| A6 | Arkiv + Swarm bonus (existing) | 500 | 🔁 | Stacks on A3 |

All are judged on friction (25%) plus three other criteria, each needing its own `/arkiv/*.md` file.

---

## What a fresh team can actually enter (10)
W1, W2, W3 · E1 · D1, D2 · A1, A2, A4 (+A5)

## Rough effort vs. reward (fresh team, 1 weekend)
| Sub-track | $ top | Effort | Notes |
|---|---|---|---|
| W1 Operate | 2.5k | Medium | Biggest Whitechain pool, 3 places; needs a polished SDK + 2 views |
| W3 Scale | 2k | Medium | Shares contracts with W1 (permit/EIP-3009 + relayer) |
| W2 Tokenize | 2.5k | Medium-High | Compliance logic in the contract; fewer competitors likely |
| E1 ENSv2 | 3k | Medium | 4 places; ENSv2 is brand new, so expect doc gaps |
| D1 Agent Pass | 2.5k | Low-Medium | Mocked proofs; bolt-on gate around any sensitive action |
| D2 IDKit | 1.25k | Low | Small prize |
| A1 Mirror | 3k | Low-Medium | Mostly an import script + query UI; standalone, no chain overlap |
| A2 Build | 3k | Medium | Any app with expiring, queryable data |
| A4 Node tooling | 2k | Medium | Needs a local node; niche, likely few entrants |

## Pairings that share one codebase naturally
- **W1 + W3**: same payment contracts, plus a gasless relayer. Note that these are two Whitechain sub-tracks; whether one project may enter both is a question for the Whitechain booth.
- **W1/W3 + D1**: AI agent pays per request, and World Agent Pass proves a human authorised the agent.
- **W1 + A2**: invoices/payment links as expiring Arkiv entities; settlement on Whitechain.
- **W2 + D2**: investor allowlist gated by an IDKit credential (Passport = KYC-lite).
- **E1 + D1**: agents as ENS subnames with permissions, human-verified via Agent Pass.

> A GPay + Splitwise idea collides with W1's "bill splitters won't place" rule, which is one more reason to drop it.
