# WhitePay – Project Context (ETHGlobal Mumbai, Nov 2026)

Master index. Per-sponsor detail lives in `docs/`. Agents live in `.claude/agents/`.

## Event
- ETHGlobal Mumbai. Workshops Thu Nov 5, 2026 (Whitechain 4:30 PM IST Room 2; ENS 4:00 PM IST Room 1).
- Continuity Track exists: some prizes are ONLY for existing projects (marked below).
- Arkiv counts as one partner prize (one of your three picks), plus optional Swarm bonus.

## Prize map (total available to us)
| Sponsor | Pool | Docs |
|---|---|---|
| Whitechain | $15,000 (Operate $5k, Tokenize $4k, Scale $3k, Continuity $3k) | [docs/whitechain.md](docs/whitechain.md) |
| ENS | $10,000 (ENSv2 $7k; Existing-project integration $3k, Continuity only) | [docs/ens.md](docs/ens.md) |
| World | $12,500 (Agent Pass x2, IDKit x2; Continuity variants) | [docs/world.md](docs/world.md) |
| Arkiv | $15,000 (Mirror, Build, Build-existing, Node tooling, Swarm bonus) | [docs/arkiv.md](docs/arkiv.md) |

## Working assumption (change if wrong)
The folder name `whitepay` → primary target is **Whitechain · Operate** (stablecoin payments for business, USDT on Whitechain Sepolia, chain 1874). Stackable add-ons that fit naturally:
- **Whitechain Scale** angle: gasless payer (EIP-3009/permit + relayer), same contracts.
- **ENS**: merchant/agent names via ENSv2 subnames (`shop.merchant.eth`) for payment links.
- **World ID Agent Pass / IDKit**: human/agent approval gate on refunds or large payments.
- **Arkiv**: invoice/receipt index queryable by filters, expiring payment links.
## Status (Nov 5): Splitwise part DROPPED. Project = "GPay on Whitechain" with ENS names, Arkiv data, World verification. Spec: [docs/project.md](docs/project.md). UPI-inspired architecture: [docs/upi-inspired-architecture.md](docs/upi-inspired-architecture.md). Risks: [docs/risks.md](docs/risks.md). All tracks: [docs/all-tracks.md](docs/all-tracks.md).

## (Superseded) Decision: build all four sponsors (Whitechain, ENS, World, Arkiv)
ETHGlobal allows only **3 partner prizes per submission** (per the Arkiv rules text). We build all four integrations, but must choose which 3 to select at submission. Default plan: Whitechain (core) + two of ENS / World / Arkiv, chosen by which integration is most polished by the deadline. Keep each integration modular so dropping one costs nothing.
Build order: Whitechain Operate core → Arkiv (invoice index) → ENS (merchant names) → World (refund approval gate). See [docs/checklist.md](docs/checklist.md).

**Build guide (verified 2026-11-05, supersedes older facts below): [docs/BUILD_GUIDE.md](docs/BUILD_GUIDE.md)**
- Whitechain RPC: `https://rpc.testnet.whitechain.io` (NOT rpc-testnet.*; that is retired chain 2625). USDT 0xcedf… supports EIP-3009 + permit. Faucet = WBT only.

## Hard shared facts
- Whitechain Sepolia chain ID **1874**; USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` (must use this, not self-minted token).
- Faucet https://faucet.testnet.whitechain.io · Explorer https://explorer.testnet.whitechain.io · Docs https://docs.whitechain.io
- Free Ankr RPC (1,500 rps, 7 days): https://www.ankr.com/rpc/?utm_referral=Whitechain2026
- Arkiv testnet: RPC https://rpc.rabdi.db-chain.testnet.arkiv.network · chain ID 7794095 · explorer https://rabdi.explorer.arkiv.network · faucet https://hub.arkiv.network/faucet
- Test tokens (WBT, USDT) have no value. Prizes paid in USDC by ETHGlobal.

## Universal rules
Public GitHub repo with steady commits (not one upload), README (setup, architecture, limitations), demo video 2–4 min showing every party, open-source license, disclose AI use, feedback file per sponsor.
