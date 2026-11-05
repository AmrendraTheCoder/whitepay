# Whitechain feedback (ETHGlobal Mumbai, Nov 2026)

## In short
Building on Whitechain Sepolia felt like any fast EVM L2. The chain and the official USDT worked well. Most of our time went into finding facts that the docs don't state: where to get the hackathon USDT, whether it supports gasless signatures, and which RPC or viem chain is current.

## What worked
- **EIP-3009 on the hackathon USDT** `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` (TetherTokenV2, 6 decimals, domain `Tether USD` / `1` / 1874). `receiveWithAuthorization` gives us gasless, order-bound, front-run-safe payments. Example: [first payment, payer held 0 WBT](https://explorer.testnet.whitechain.io/tx/0x1c9057fc24477b69f37e8da80b2c1e1bf80908a55a84e908139e07cac86c362f).
- **Foundry + Blockscout verification** worked first try once we used `--verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/`. `PaymentRouter` `0x9f38…026e` and `MerchantRegistry` `0xe063…1f68` are both verified.
- **1 s blocks** make the UX feel instant: QR → signed → settled in about 2–3 s, including our relayer.
- **Explorer API** (`/api/v2/addresses/{addr}/token-transfers`) let us show every USDT transfer for a wallet, not only our own receipts.
- **Standard infra was already deployed:** EntryPoint v0.6/0.7/0.8, Permit2 and Multicall3.

## Where we got stuck
| Issue | What happened | Cost |
|---|---|---|
| Two "USDT"s | The docs only mention **USDT.e** `0xaa79…8f46` (bridged, permit only, **no EIP-3009**). The hackathon requires `0xcedf…55a7`, which isn't in the docs. | Had to read the token's code on the explorer to confirm EIP-3009 support |
| No way to get test USDT | The faucet gives **WBT only**. We found the hackathon USDT by tracing on-chain transfers to a WWBT/USDT pool, then swapped on YetiTrade testnet. Nothing in the docs explains this. | About an hour, plus a user confused by many "Mock USDT" tokens in the swap list |
| Retired RPC/chain still looks current | `rpc-testnet.whitechain.io` and viem's `whitechainTestnet` both point to the **retired chain 2625**. The correct pairing is `rpc.testnet.whitechain.io` / `whitechainSepolia` (1874). | Easy trap for newcomers |
| OpenZeppelin 5.7 | It uses the `CLZ` opcode, which won't compile for Whitechain's `prague` EVM target. We pinned OZ 5.4.0. | Short, but non-obvious |
| No AA / embedded-wallet providers | No bundler, paymaster or embedded-wallet provider is listed for 1874, so we built passkey device wallets plus our own relayer. | Design time |
| RPC rate limit (50 req/s per IP) | Occasional `HTTP request failed` during scripted test runs; succeeded on retry. | Needs a retry/backoff note |
| Faucet limits | 0.5 WBT per 24 h, GitHub account ≥30 days old. Teammates on one network share the IP limit. | Pooling claims |

## What the docs were missing
1. **Where to get the official hackathon USDT** (`0xcedf…`), and that USDT.e is a different token.
2. **That this USDT supports EIP-3009 and EIP-2612**, with its EIP-712 domain values.
3. **A recommended gasless pattern** for the Scale track: relayer and paymaster guidance, how relayers get WBT, anti-drain checklist.
4. **The Blockscout verifier URL needs a trailing slash** for Foundry (`…/api/`), and no slash for Hardhat.
5. **A "current vs retired" note** for RPC endpoints and viem chain names.
6. **EVM target note:** set `evm_version = prague`, and avoid toolchains that emit newer opcodes.
