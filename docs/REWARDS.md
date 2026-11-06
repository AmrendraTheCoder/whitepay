# WondrPay Rewards: the math

Rewards exist to pull people into paying **shops** with WondrPay. They are paid out of the merchant fee those
payments generate, so every reward is backed by revenue that has already been earned. Every number below lives
in one place in the code (`ECON` in `packages/shared/src/rewards.ts`), and the Rewards page renders the same values.

## 1. Where the money comes from

| | Value | Why |
|---|---|---|
| Merchant fee (MDR) `f` | **0.50%** of each shop payment | Top of our 0.3–0.5% pricing; cards cost 1.8–3% |
| Share of the fee paid back as rewards `β` | **50%** | The other 50% is WondrPay's margin |
| Reward budget per $100 of shop volume | `f × β × 100` = **$0.25** | |
| P2P transfers | no fee, **no rewards** | Rewards can only be earned where we earn |

## 2. How a card wins

Each shop payment of at least 0.10 USDT earns one scratch card. A winning card pays a **random 1–5%** of the
payment, in WBT. The rate is skewed toward the low end:

| Rate | 1% | 2% | 3% | 4% | 5% |
|---|---|---|---|---|---|
| Weight | 40 | 25 | 15 | 12 | 8 |

Expected rate of a winning card: `E[r] = Σ rate × weight / Σ weight` = **2.23%**.

The win probability is chosen so that, on average, rewards spend **exactly** the budget:

```
p × E[r] = f × β      =>      p = f × β / E[r] = 0.50% × 50% / 2.23% = 11.2%   (about 1 card in 9)
```

Expected reward per $100 of shop volume: `100 × p × E[r]` = **$0.25**. Expected WondrPay margin: **$0.25**.

Cards that don't win cashback can win the shop's own coupon (40% of them, when the shop has one; the shop
funds the coupon itself) or nothing.

## 3. Hard limits (they only lower the cost)

| Limit | Value | What it protects against |
|---|---|---|
| Max cashback per card | **$2** | One big payment draining the pool |
| Welcome: first cards per **person** that always win | **3**, capped at **$0.50** each | Paid from a fixed **$25 launch budget** (customer acquisition), not from fees |
| Claims per person per day | **5** | Automated claiming |
| Cashback per person per 30 days | **$5** | Heavy farming by one person |
| Pool solvency | payouts ≤ fee share earned + launch budget − already paid | The pool can never pay out money it hasn't earned |
| WBT held | payout + gas reserve must be in the pool wallet | Never promise money the wallet can't send |

Because the caps cut off the expensive tail, the real cost comes in **under** the budget. A 200,000-card
simulation with payments spread from $0.10 to $200 (`npx tsx --env-file=.env scripts/rewards-test.ts sim`):

```
model:    fee 0.5%, reward share 50%, E[win rate] 2.23%, win probability 11.21% (1 in 9)
per $100: fee $0.50, expected rewards $0.250, margin $0.250
sim 200000 cards: win rate 11.26%, mean winning rate 2.23%
rewards = 36.7% of fees (target ≤ 50%, caps push it lower)
```

## 4. Why it can't be gamed

**Paying yourself loses money.** Self-payments are excluded outright (payer = shop). Someone who runs their own
shop from a second wallet pays the 0.50% fee and gets back 0.25% on average: they lose **$0.25 per $100** they
cycle. The only "free" money is the welcome bonus, and that is limited per human.

**World ID at claim time.** Scratching a card is free, but WBT cashback is only paid when it's **claimed with a
fresh World ID proof**:

- The proof's signal binds it to *this wallet and this exact set of cards*
  (`claimSignal(owner, cardKeys)`), so it can't be replayed for other cards or another wallet.
- The proof yields a nullifier that is stable per person. WondrPay stores only its hash, and every limit
  above (welcome, daily claims, monthly cap) is counted **per person across all their wallets**.
- An AI agent or bot can create thousands of wallets and earn cards on all of them, but it can't produce a World
  ID proof. Even one real person with 50 wallets still gets 3 welcome wins and $5 a month, in total.

Tested live: a second wallet owned by the same person scratched a welcome card, and the claim refused it
("Welcome bonus already used by this person on another wallet").

## 5. Paid in WBT

Cashback is valued in dollars when the card is scratched (rate × payment) and paid in **WBT** at the live price
(CoinGecko, cached 10 minutes; `WBT_USD` as a fallback) when it's claimed. All of a claim's cards go out as **one**
transfer, so the ~21,000-gas fee (about $0.008 at 5 gwei) is paid once per claim, not once per card. The claim
record stores the price used, so the books can be audited.

## 6. Public books

Every card (`whitepay.reward`) and every claim (`whitepay.rewardclaim`: human hash, wallet, cards, USD, WBT, price,
tx) lives on Arkiv. The Rewards page recomputes the pool from them live: shop volume, the fees on it, the reward
share, what was paid and to how many people, and what's left. Anyone can check that payouts never exceeded what
fees funded.

## 7. The dials

Each lever is one constant. Raising `β` makes rewards more generous; lowering `f` (for example, a promotional
fee for new shops) automatically lowers the win probability, because `p = f × β / E[r]`. Rewards can't outgrow
revenue without someone deliberately changing that formula.
