# WondrPay: speaker notes for the World deck

Speaker notes from `WondrPay-World.pptx`, one block per slide. Spoken text comes from `docs/pitch/world.md`; lines in brackets are actions; "(Backup)" slides are not in the 3-minute script.

## 1. Title

> [Title slide. Setup: laptop on Amaron checkout; phone 1 on WondrPay with a cashback card waiting; phone 2 with World App open] Start the script on the next slide.

## 2. Hook

> "Every rewards program in crypto has the same favourite customer: a bot. Airdrops, referral bonuses, cashback: farmed by fake accounts.
> 
> So we built a payments app where money only moves for humans.
> 
> WondrPay is UPI for digital dollars: pay any shop by QR, in USDT, with no gas. And World ID is in every moment where a bot could steal."

## 3. Three taps

> [Laptop: Amaron checkout. Phone 1: scan, PIN.]
> "I buy from Amaron: scan, PIN, paid. The shop has a verified-human badge, so I know a real person runs it.

## 4. Everything live

> [Phone 1: open Rewards, tap Claim with World ID. Phone 2: approve in World App.]
> "I won cashback. To claim it, World App does a fresh check every time. One person gets one set of limits, however many wallets they create. [The WBT arrives.] Paid.
> 
> Want a refund? Same rule: World ID first. The shop sees 'verified human, 1 request in 30 days', counted across every wallet and every shop. Payments over $100 ask again too."

## 5. How it fits together

> (Backup: not in the 3-minute script.) The phone holds the key and signs one exact order. Our relayer pays the gas and settles it on Whitechain. Arkiv holds the public records: requests, receipts, directories, refunds. World ID keeps it one human per name, shop and reward. ENS gives everyone a readable name.

## 6. Market

> "Now the business. $685 billion a year is sent home to developing countries, at about 6% in fees.

## 7. Where we start

> We start where people already use digital dollars:
> 1. The Gulf to India. The Gulf sends 38% of India's remittances, and Dubai already has Orbs.
> 2. Argentina, Turkey and Nigeria, where people save in dollars.
> 3. Freelancers in India and Ukraine, paid in USDT by clients abroad.
> 
> Three-year goal: 1 million verified people and 50,000 shops."

## 8. Track slide 1

> "For World, that's a million people with a reason to verify that pays them back. Cashback only goes to verified humans, so getting Orb-verified is worth money from day one.
> 
> At our goal, that's around 28 million World ID checks a year:
> • cashback claims;
> • refund requests;
> • big payments;
> • names and shops.
> 
> Every one opens World App. And 50,000 shops show a World ID badge at the counter.
> 
> You've brought World ID to Tinder, Zoom and Docusign. WondrPay brings it to the checkout."

## 9. Track slide 2

> (Backup: not in the 3-minute script.) Every proof is checked on our backend, never trusted from the browser. Our server signs the request context, World App returns a proof bound to this wallet and this exact action, we verify it, then the protected action runs. Cancel, decline or a replayed proof, and nothing happens: no name, no badge, no payout. We store only the nullifier's hash on Arkiv.

## 10. Track slide 3

> (Backup: not in the 3-minute script.) That's what stops farming. One human can link up to five wallets, and limits count per human. A bot with fifty wallets still gets three welcome wins and five dollars a month in total. We tested it live: the second wallet was refused with 'Welcome bonus already used by this person on another wallet'. Our one ask for World: structured errors instead of a bare 'Failed'.

## 11. Money

> "Of every $100 spent at a shop, the shop pays 50 cents: 4 cents of gas, 23 cents back to the shopper as cashback, 23 cents for us. With currency exchange and business plans, that's about $7 million a year by year three.
> 
> That cashback is only affordable because of World ID: 5 claims a day and $5 a month, per human. Without it, bots would take the cashback, and shops would lose money to fake refunds."

## 12. Proof

> (Backup: not in the 3-minute script.) All of this is on testnet today: 110 transactions and 216 USDT transfers on our PaymentRouter, all gas paid by us; 80 receipts, 17 shops, 12 websites with API keys and 16 subscriptions on Arkiv. These are two days of building: proof the flows work, not traction.

## 13. Close

> "Money that only moves for humans. Live on testnet, and you just watched a real claim. We'd love a World App mini app listing and more Orbs in our corridors. Thank you."
