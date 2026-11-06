# WondrPay: speaker notes for the Arkiv deck

Speaker notes from `WondrPay-Arkiv.pptx`, one block per slide. Spoken text comes from `docs/pitch/arkiv-script.md`; lines in brackets are actions; "(Backup)" slides are not in the 3-minute script.

## 1. Title

> [Title slide. Setup: laptop on Amaron checkout with the orders tab ready; phone on WondrPay] Start the script on the next slide.

## 2. Hook

> "Five minutes. Seven days. Six months.
> 
> That's how long WondrPay's data lives. A payment request: five minutes. A refund request: seven days. A receipt: six months, the longest Arkiv allows, and renewable.
> 
> Elsewhere, those are promises on someone's server. On WondrPay they're rules, because the data lives on Arkiv.
> 
> WondrPay is UPI for digital dollars: pay any shop by QR, in USDT, with no gas."

## 3. Three taps

> [Laptop: Amaron checkout, tap Pay with WondrPay.]
> "Amaron, a fashion store. That QR is a payment request on Arkiv, signed by the shop. In five minutes it deletes itself." [Phone: scan, PIN.] "My app checks the request on Arkiv against the shop's key on Whitechain. Paid."

## 4. Everything live

> [Laptop: switch to the orders tab.]
> "Amaron's order list comes straight from Arkiv, the same query anyone can run. No private database behind it.
> 
> And refunds. When a customer asks for money back, they sign the request, and then it's handed to an address nobody owns. Not the shop, not us, no one can edit or delete it. World ID makes sure it's one real person asking, not a bot farming refunds."

## 5. How it fits together

> (Backup: not in the 3-minute script.) The phone holds the key and signs one exact order. Our relayer pays the gas and settles it on Whitechain. Arkiv holds the public records: requests, receipts, directories, refunds. World ID keeps it one human per name, shop and reward. ENS gives everyone a readable name.

## 6. Market

> "Payments are a data business. Every payment needs a request, a receipt, and sometimes a refund. And $685 billion a year is sent home to developing countries, still at about 6% in fees.

## 7. Where we start

> We start in three places:
> 1. The Gulf to India, which sends 38% of India's remittances.
> 2. Freelancers in India and Ukraine, paid in USDT by clients abroad.
> 3. Countries that save in dollars: Turkey, Nigeria, Argentina.
> 
> Three-year goal: 1 million verified people, 50,000 shops, and 120 million payments a year."

## 8. Track slide 1

> "Every shop payment writes about four Arkiv records: the request, its paid status, the receipt and a reward card. Add webhooks, refunds and subscriptions, and our three-year goal means roughly 350 million Arkiv writes a year, every one paid in GLM.
> 
> Most of that data should expire. A five-minute QR costs almost nothing to store, so we only pay to keep what matters. That's exactly Arkiv's 'pay for the lifetime you choose' model.
> 
> And it's open. Receipts, the shop directory and verification records are public. Wallets, accountants and tax tools can build on WondrPay data without asking us, and every app that does becomes another Arkiv user."

## 9. Track slide 2

> (Backup: not in the 3-minute script.) Fifteen kinds of live data: payment requests, receipts and links; people, shops and World ID claims; subscription plans, mandates and dues; refund events and disputes; rewards and offers; and business sites, webhooks and team members. Each has an owner, indexed fields and an expiry that matches what it means: minutes for a QR, months for a receipt.

## 10. Track slide 3

> (Backup: not in the 3-minute script.) Here's a QR's life. The shop signs an order; we write a request whose expiry equals the on-chain deadline. The payer's phone checks four things: owner, digest, shop signature, still valid. Payment writes the receipt and flips the request to paid in one batch. After the deadline the request is gone, and the contract rejects it too. Our top asks: an API reference for SDK 1.0, a filterable createdAt, and a status page.

## 11. Money

> "Of every $100 spent at a shop, the shop pays 50 cents: 4 cents of gas, 23 cents back to the shopper as cashback, 23 cents for us. Add currency exchange and business plans, and that's about $7 million a year by year three.
> 
> Arkiv also gives us a second product: verified income. A freelancer's receipts, checkable by anyone, become a statement a bank or a visa office can trust."

## 12. Proof

> (Backup: not in the 3-minute script.) All of this is on testnet today: 110 transactions and 216 USDT transfers on our PaymentRouter, all gas paid by us; 80 receipts, 17 shops, 12 websites with API keys and 16 subscriptions on Arkiv. These are two days of building: proof the flows work, not traction.

## 13. Close

> "Five minutes, seven days, six months: enforced by Arkiv, not by trust. It's live on testnet, with 444 Arkiv writes across 15 kinds of data in two days. We'd love to be Arkiv's first real payments customer on mainnet. Thank you."
