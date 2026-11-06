# WondrPay: 3-minute motion presentation, full production prompt

Use this file three ways:
1. **Master prompt** (section 1): paste into an AI video / motion tool (Runway, Sora, Veo, Kling, Pika, Hera, Jitter, etc.) to set the look.
2. **Scene prompts** (section 4): generate each shot separately, then cut them together on the timeline.
3. **Editor brief** (sections 2-7): for After Effects / Rive / Figma Smart Animate / Remotion, with exact screens, numbers and chart data.

> Numbers marked **[verify]** are public market figures that change every quarter. Check them against the named source on the day you publish. Numbers marked **[measured]** come from our own production tests and are safe to show.

---

## 1. Master prompt (paste first)

```
A 3-minute, 16:9, 60 fps fintech product launch film for "WondrPay": scan-to-pay digital dollars (USDT)
on the Whitechain blockchain, with zero gas fees, human-readable names (ENS), receipts stored on Arkiv,
and one-person-one-account verification (World ID).

Visual style: premium, calm, Apple-keynote-meets-Stripe-Sessions. Deep navy background #0B1033 with a
subtle dot grid, electric blue #2448FF as the hero color, lime #DDF05A as the accent for success, money
in and live timers, red #FF5A6E only for money going out. Typeface: Manrope (geometric grotesk), tight
tracking, big numbers with tabular figures. Glassmorphism for floating UI (frosted, 20 px blur, thin
light border). Real phone mockups (iPhone 16 Pro, titanium black) showing a dark-mode mobile wallet UI.

Motion language: everything moves on springy ease-out curves (cubic-bezier .2,.9,.3,1); numbers count
up; charts draw left to right; cards rise 10 px and settle; QR codes scan with a lime sweep line; a
success checkmark draws itself with two pulse rings. Camera: slow push-ins on phones, parallax between
foreground UI cards and the dot-grid background, occasional 3D tilt of the phone (max 12 degrees).
No stock footage of people's faces; use hands holding phones, shop counters, city street light bokeh.

Sound: minimal electronic bed, 100 BPM, soft sub bass, glassy UI clicks on taps, a bright two-note chime
on every successful payment. Voiceover: warm, confident, mid-paced (150 wpm), global English.
```

---

## 2. Brand and UI kit (recreate these exactly)

**Colors**: navy `#0B1033` (bg), surface `#141A3A`, blue `#2448FF`, blue-2 `#1D39D9`, lime `#DDF05A` (lime ink `#1B2108`), success green `#12A86B`, out-red `#FF5A6E`, muted `#8A92C8`, ring colors for subscriptions: lime `#DDF05A`, cyan `#3DE0FF`, pink `#FF5CC8`, orange `#FFA53D`.
**Type**: Manrope 800 for numbers and titles, 600 for labels. Balance numbers 46-56 px, tabular.
**Shapes**: cards 28 px radius, chips fully round, glass tab bar 26 px radius floating 10 px above the bottom.

**Screens to build as motion assets** (all from the live app, wondrpay.vercel.app):

| # | Screen | Key elements to animate |
|---|---|---|
| S1 | **Home** | search pill, blue balance card with dot grid + lime glow, count-up balance "3.70 USDT", lime "0 gas" pill, avatar with **colored timer rings** (one per subscription, draining), 4 blue action tiles (Scan, Pay anyone, Receive, Shop QR), "Pay again" row of **identicons**, floating glass tab bar with sliding pill |
| S2 | **Scanner** | full-black camera view, lime/blue corner brackets, lime sweep line |
| S3 | **Pay** | merchant identity card, ✓ Verified badge, 4 trust checks ticking in ("Created by WondrPay", "Amount untampered", "Signed by the merchant", "Still valid"), countdown, "Pay with fingerprint" button, Face ID / fingerprint glyph |
| S4 | **Success** | self-drawing check with two pulse rings, "Paid 2.50 USDT", "Settled on Whitechain · receipt on Arkiv", explorer link chip |
| S5 | **Shop terminal** | amount keypad → QR appears instantly → "Waiting for payment · 4:59" → "Received 2.50 USDT" lime toast |
| S6 | **Checkout on any website** | demo store "Chai & Co.", product cards, `<wondrpay-button>` → modal with QR → "Paid ✓"; "Show integration points" overlay with numbered blue pins ①–⑤ |
| S7 | **Subscriptions** | subscribe page with "Ask me each time" vs "Autopay" choice, schedule list, lime countdown ring, "Payment due" glowing card, one-tap approve |
| S8 | **Money** | balance hero with glass quick actions, This month: Sent (red) / Received (green) / Net, 6-month bar chart, "Where it went" stacked bar |
| S9 | **Transactions** | filter chips with counts, month header with −/+/net, rows with identicons and ↓/↑ badges |
| S10 | **Refund + CSV** | shop dashboard row → Refund sheet → "Refunded to the original payer" → CSV download |

---

## 3. Facts you can put on screen

**Measured on our production build [measured]**
- Payer pays **0 gas**; WondrPay's relayer pays the network fee.
- Whitechain block time **~1 second**; payment confirmed on-chain in about a second.
- QR appears in **~0.5 s** (down from ~6.5 s): order signed by the shop, saved to Arkiv in the background.
- Confirm on phone → success screen in **~4 s** end to end (signature, relay, on-chain confirmation).
- **1 signature** per payment; subscriptions: 1 signature to start, 1 tap per renewal, 1 to cancel.
- Refunds go **only to the original payer**, capped at what was paid, enforced by the contract.
- **28/28** live security checks (CSP, signed webhooks, SSRF guard, rate limits, CSRF, SRI-pinned SDK).
- Merchant integration: **~20 lines** (one script tag, one button, one server call, one webhook).

**Market context [verify before publishing]**
- Global remittances to low- and middle-income countries: roughly **$650-700 B per year**. Source: World Bank / KNOMAD *Migration and Development Brief* (latest edition).
- Average cost of sending $200 abroad: about **6%+**, far above the UN SDG target of **3%** (SDG 10.c). Source: World Bank *Remittance Prices Worldwide*.
- Card acceptance costs merchants roughly **1.5-3.5%** per transaction plus fixed fees, with **T+1 to T+3** settlement. Source: card network / acquirer published rates (pick one region).
- India's UPI processes **well over 15 B transactions per month** at near-zero cost to users. Source: NPCI monthly statistics.
- Stablecoin supply: **$200 B+**, with USDT the largest. Source: DefiLlama / CoinGecko stablecoin dashboards.

---

## 4. Storyboard, voiceover and shot prompts (3:00)

VO total ≈ 430 words at 150 wpm. Timecodes are cut points.

### 0:00-0:12 · Cold open: the problem
**On screen:** a street-food counter at night, a hand taps a card, a spinner, "Declined". Cut to a remittance app showing "$200 sent · $187 received · arrives in 3 days". Red numbers tick: **−6%**, **3 days**, **2.9% + 30¢**.
**VO:** "Every day, billions of small payments lose money on the way. Fees on the sender, fees on the shop, and days of waiting for the money to land."
**Shot prompt:** `Cinematic night street-food stall, shallow depth of field, hand holding a payment card over a terminal, red "DECLINED" UI overlay, then a floating phone UI showing an international transfer losing value, red fee numbers counting up, navy and blue grade, 4 seconds.`

### 0:12-0:24 · Reveal
**On screen:** screen goes navy, dot grid fades in, WondrPay logo assembles (blue "W" stroke draws on a white rounded square), tagline types in: **"Scan. Verify. Pay."** Lime pill pops: **0 gas**.
**VO:** "This is WondrPay. Digital dollars that move like a text message. Scan, verify, pay. No gas, no seed phrase, no waiting."
**Shot prompt:** `Logo reveal on deep navy #0B1033 with subtle white dot grid, an electric blue "W" stroke draws itself inside a white rounded square, then the words "Scan. Verify. Pay." type in Manrope ExtraBold, a lime #DDF05A pill "0 gas" springs in, soft glow, 60fps motion graphics.`

### 0:24-0:50 · Paying a shop (S1 → S2 → S3 → S4)
**On screen:** phone push-in on Home (balance counts up to 3.70), thumb taps **Scan**, lime sweep reads a QR on a chai stall counter, Pay screen: the 4 trust checks tick one by one, fingerprint glyph pulses, success check draws itself, chime. Small caption bottom-left: **"~4 s from fingerprint to receipt · 0 gas"**.
**VO:** "At the counter, scan the shop's code. WondrPay checks it before you pay: created by WondrPay, amount untouched, signed by the real merchant, still valid. Touch the fingerprint sensor, and it's done. Settled on Whitechain in about a second, with a permanent receipt on Arkiv. You never paid a cent in gas."
**Shot prompt:** `Close-up of a hand holding a black iPhone over a chai stall QR code, dark-mode fintech app UI: a lime scan line sweeps across the code, a payment screen shows four green checkmarks appearing one by one, a fingerprint icon pulses, then a large animated success checkmark with two expanding rings and the text "Paid 2.50 USDT", warm street lights bokeh, premium product film.`

### 0:50-1:08 · The merchant side (S5, S10)
**On screen:** split screen. Left: shop terminal, keypad "2.50", QR appears instantly (stopwatch overlay **0.5 s**). Right: the customer pays. Left updates to lime toast "Received 2.50 USDT". Then a Refund sheet slides up → "Refunded to the original payer only". A CSV file icon flies into a folder.
**VO:** "For the shop, the QR appears in half a second. Money arrives in seconds, not days, at no card fee. Refunds can only go back to the person who paid, and the books export to CSV in one tap."
**Shot prompt:** `Split-screen motion graphic: left phone shows a merchant keypad typing 2.50 then a QR code appearing instantly with a 0.5s stopwatch badge, right phone shows a customer paying; left phone flashes a lime toast "Received 2.50 USDT"; glassmorphism cards, navy background, electric blue accents.`

### 1:08-1:30 · Any website, ~20 lines (S6)
**On screen:** desktop browser with the "Chai & Co." store, click "Pay 2.50 USDT" → modal QR → phone scans → modal turns to "Paid ✓". Toggle "Show integration points": five blue numbered pins pop onto the page, a code panel slides in showing 4 short snippets, counter "≈ 20 lines".
**VO:** "Any website can accept it. One script tag, one button, one server call, and a signed webhook that the shop verifies on-chain. Prices are signed by the shop, so nobody can change them in the browser."
**Shot prompt:** `Laptop screen showing a warm-toned online tea shop, cursor clicks a blue "Pay with WondrPay" button, a frosted modal with a QR code appears, a phone scans it, the modal turns into a green success state; then five numbered blue pins pop onto the page and a dark code panel slides in with short code snippets, clean developer-marketing aesthetic.`

### 1:30-1:48 · Subscriptions without surprise charges (S7, S1 rings)
**On screen:** Subscribe page, the choice "Ask me each time (recommended)" highlighted. Home avatar grows **colored rings**, each draining like a timer. One ring hits zero → glowing lime "Payment due · Chai Club" card → one tap → paid. Second card: "Cancel" → "Won't be charged: 1 payment · 0.10 USDT".
**VO:** "Subscriptions, done right. You approve only today's payment. When the next one is due, the ring around your avatar runs out and WondrPay asks you. One tap to pay, one tap to cancel. Nothing is charged behind your back."
**Shot prompt:** `Mobile UI close-up: a circular profile avatar surrounded by three concentric glowing rings in lime, cyan and pink, each slowly draining clockwise like a countdown timer; one ring empties and a glowing lime notification card "Payment due" slides in, a thumb taps "Pay", success chime; dark navy UI, neon glow, smooth 60fps.`

### 1:48-2:15 · Web2 vs Web3 comparison
**On screen:** two columns build row by row, Web2 on the left (grey), WondrPay on Whitechain on the right (blue/lime). Rows flip in with a card-flip:

| | Cards / bank rails (Web2) | WondrPay on Whitechain (Web3) |
|---|---|---|
| Fee for the shop | ~1.5-3.5% + fixed **[verify]** | 0 gas for payer; near-zero network cost |
| Settlement | T+1 to T+3 | ~1 second, final |
| Cross-border | 6%+, days **[verify]** | same as local: one USDT transfer |
| Chargeback fraud | merchant loses | refunds only to original payer, capped on-chain |
| Receipts | private, siloed | permanent, verifiable on Arkiv |
| Identity | card number | `name.wondrpay.eth` + one human per account (World ID) |
| Opening hours | banking days | 24/7/365 |

**VO:** "Compare that to card rails: a few percent per sale, money that lands days later, chargebacks the shop pays for. On WondrPay, settlement is final in a second, cross-border costs the same as paying next door, and every receipt can be checked by anyone."
**Shot prompt:** `Split comparison table motion graphic, left column muted grey labeled "Cards & banks", right column glowing electric blue and lime labeled "WondrPay on Whitechain", rows flip in one by one with numbers counting, checkmarks in lime on the right, navy background with dot grid.`

### 2:15-2:40 · Growth: how users grow the chain (charts)
**On screen:** three charts animate in sequence (specs in section 5): (A) users curve rising, (B) transactions and on-chain volume stacked area, (C) a flywheel diagram.
**VO:** "Every new user is new activity on Whitechain. More shops bring more customers. More customers bring more shops. Each payment is a real on-chain transaction and a real receipt on Arkiv, which means more fees for validators, more USDT moving on Whitechain, and a network that gets more useful the bigger it gets."
**Shot prompt:** `Data-visualization motion graphics on navy: a glowing blue line chart of users rising exponentially with milestone labels, morphing into a stacked area chart of daily transactions and dollar volume, then a circular flywheel diagram with four nodes (Users → Shops → Transactions → Network value) rotating with lime arrows; clean, minimal, Manrope labels, tabular numbers counting up.`

### 2:40-2:52 · International reach
**On screen:** dark globe, lime arcs fly between corridors (Mumbai → Dubai, Lagos → London, Manila → Riyadh, Mexico City → Los Angeles, Kyiv → Warsaw). Counter on each arc: **"$200 → $200"**. Caption: **"Same app. Same digital dollar. Every country."**
**VO:** "And because it's a digital dollar, borders stop mattering. A worker in Dubai can pay a shop in Mumbai the same way they pay the one downstairs, in seconds, without losing a slice on the way."
**Shot prompt:** `Rotating dark navy 3D globe with thin blue country outlines, glowing lime arcs launching between Mumbai and Dubai, Lagos and London, Manila and Riyadh, Mexico City and Los Angeles, each arc ending with a small label "$200 → $200", cinematic, elegant, 60fps.`

### 2:52-3:00 · Close
**On screen:** Home screen phone centered, rings glowing, the tagline: **"Scan. Verify. Pay. Everywhere."** Below: logos row (Whitechain · ENS · Arkiv · World ID), URL **wondrpay.vercel.app**, "Built at ETHGlobal".
**VO:** "WondrPay. Scan, verify, pay. Everywhere."
**Shot prompt:** `Hero end card: centered black iPhone showing a dark fintech home screen with a blue balance card and a glowing ringed avatar, tagline "Scan. Verify. Pay. Everywhere." in Manrope ExtraBold, partner logos row beneath, URL text, navy background with dot grid and soft lime glow, slow push-in.`

---

## 5. Chart specs (for After Effects / Remotion / Flourish)

All charts: navy background, gridlines `#FFFFFF` at 8% opacity, labels muted `#8A92C8`, series colors blue `#2448FF`, lime `#DDF05A`, cyan `#3DE0FF`. Draw left to right over 1.2 s, numbers count up, end values labeled directly on the line (no legend boxes). Put the subtitle **"Illustrative model; assumptions on screen"** on charts B and C.

**A. Users (line, 0 → 24 months)**: illustrative S-curve. Month 0: 1 k · 6: 25 k · 12: 250 k · 18: 1 M · 24: 3 M. Milestone dots with labels "First 100 shops", "First corridor", "1 M users".

**B. Network activity (stacked area, same x axis)**: derived from A with the on-screen assumptions:
- payments per active user per day = **0.8**
- average payment = **$6** (street retail + transfers)
- daily transactions = users × 0.8 → at 3 M users ≈ **2.4 M tx/day**
- daily volume = tx × $6 → ≈ **$14.4 M/day** (≈ **$5.3 B/year**)
- each payment = 1 Whitechain transaction (validator fees, paid in WBT by the relayer) + 1 Arkiv receipt
Plot layers: "Payments / day" (blue) and "USDT volume / day" (lime, right axis).

**C. Flywheel (radial diagram, rotating)**: 4 nodes clockwise with arrow captions:
Users → *"more places to pay"* → Shops → *"zero fees, instant money"* → Transactions → *"fees + liquidity on Whitechain"* → Network value → *"better UX, more corridors"* → Users.

**D. Fee comparison (horizontal bars, $100 sale)**: Card rails **$1.50-$3.50** (grey) **[verify]** · Cross-border transfer **~$6** (grey) **[verify]** · WondrPay (blue, lime label) **$0 for the payer, network fee covered**. Bars grow left to right, WondrPay bar pulses.

**E. Settlement time (log-scale timeline)**: Bank transfer "1-3 days", Card payout "T+1 to T+3", WondrPay "~1 s". The WondrPay marker zooms in with a lime glow.

---

## 6. Marketing points checklist (each appears at least once)

- **Zero gas for users**: payers never need the chain's native token.
- **No seed phrase**: key stays on the phone, unlocked by fingerprint or a 6-digit PIN, like UPI.
- **Verified before you pay**: 4 on-screen checks, ✓ Verified shops (one shop per real person via World ID).
- **Human-readable names**: pay `chai-shop.wondrpay.eth`, not `0x…`.
- **Instant for shops**: QR in ~0.5 s, money in seconds, refunds only to the original payer, CSV export.
- **Works on any website**: ~20-line SDK, signed webhooks, works in plain HTML, React, Vue, WordPress.
- **Subscriptions without surprises**: ask-each-time by default, timer rings, one-tap cancel.
- **Permanent, checkable receipts** on Arkiv; every payment visible on the Whitechain explorer.
- **Security by default**: signed orders, on-chain caps, 28/28 security checks, pinned SDK.
- **Global by design**: one digital dollar, same cost locally and across borders, 24/7.
- **Good for the chain**: every user brings real transactions, fees and USDT liquidity to Whitechain.

---

## 7. Delivery checklist

- 16:9 master 3840×2160 @ 60 fps; 9:16 cutdown (60 s: scenes 0:12-1:08 + 2:52-3:00) for socials.
- Burned-in captions (Manrope 600, lime on dark pill) for accessibility and muted autoplay.
- Every **[verify]** number checked against its source with the date in the end credits.
- Phone screens recorded from the live app at 3× resolution (Chrome DevTools device mode 390×844, DPR 3) so text stays crisp; replace any test wallet balances and addresses before export.
- Music cleared for commercial use; SFX: soft UI click, two-note success chime, whoosh on card flips.
