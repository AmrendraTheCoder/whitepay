# WondrPay: speaker notes for the Arkiv deck

Speaker notes from `WondrPay-Arkiv.pptx`, one block per slide. Lines in brackets are actions; "(Backup)" slides can be skipped to stay inside 3 minutes.

## 1. Title

> WondrPay, UPI for digital dollars. Money settles on Whitechain; every record around it lives on Arkiv. (Phone on WondrPay Transactions, read from Arkiv.)

## 2. Three numbers

> Three numbers. 20 billion: UPI payments in India every month, by scanning a QR. 129 billion: dollars sent home to India every year. Zero: the number of those you can pay with the dollars sitting in a WhiteBIT account. WondrPay fixes the zero. It's UPI for digital dollars.

## 3. Three taps

> (Laptop: Amaron checkout, tap Pay with WondrPay. Phone: scan the QR, confirm.) Scan, fingerprint, done. Paid in USDT on Whitechain, with zero WBT in my wallet. We pay the gas, so shoppers never see it. The store has its order, and I got a scratch card: cashback paid in WBT.

## 4. Everything live

> Also live on testnet: sending money to people with names like priya.wondrpay.eth, subscriptions that renew on their own, refund requests stored on Arkiv with World ID stopping fake claims, and a business portal that gave our demo store Amaron an API key, payment links, webhooks, team roles and prices in local currency in an afternoon.

## 5. How it fits together

> (Backup, skip if short on time.) The phone holds the key and signs one exact order. Our relayer pays the gas and settles it on Whitechain. Arkiv holds the public records: requests, receipts, directories, refunds. World ID keeps it one human per name, shop and reward. ENS gives everyone a readable name.

## 6. Market

> Money crossing borders is where payments are still broken: 685 billion dollars a year goes home to developing countries, and sending it costs about 6%. Cards cost shops 2 to 3%. A WondrPay shop pays 0.5%.

## 7. Where we start

> We start where W Group is already strong: the Gulf to India, since the Gulf sends 38% of India's remittances; Ukraine and Europe, freelancers paid in USDT cashing out through WhiteBIT; and countries that save in dollars: Turkey, Nigeria, Argentina. Three-year goal: 1 million verified people, 50,000 shops, 1.5 billion dollars in shop payments and 3 billion sent home.

## 8. Track slide 1

> Why not Postgres? Because with Arkiv, receipts are public records anyone can match to a Whitechain transaction without our API. A shop QR expires in the data layer itself. Provenance is part of verification: the pay screen trusts a request only if Arkiv says WondrPay wrote it and the shop's signature checks out on-chain. And shop and name directories are open to other apps.

## 9. Track slide 2

> Seventeen entity types: payment requests, receipts and links; people, shops and World ID claims; subscription plans, mandates and dues; refund events and disputes; rewards and offers; and business sites, webhooks and team members. Each has an owner, indexed fields and an expiry that matches what it means: minutes for a QR, months for a receipt.

## 10. Track slide 3

> Here's a QR's life. The shop signs an order; we write a request whose expiry equals the on-chain deadline. The payer's phone checks four things: owner, digest, shop signature, still valid. Payment writes the receipt and flips the request to paid in one batch. After the deadline the request is gone, and the contract rejects it too. Our top asks: an API reference for SDK 1.0, a filterable createdAt, and a status page.

## 11. Money

> Every 100 dollars spent at a shop: the shop pays 50 cents, against 2 to 3% for cards. 4 cents is Whitechain's gas, 23 cents goes back to the shopper as cashback, 23 cents is ours. On top: a share of currency exchange, business plans, and 3 cents per transfer after ten free a month. About 7 million dollars a year of revenue by year three.

## 12. Proof

> (Backup.) All of this is on testnet today: 110 transactions and 216 USDT transfers on our PaymentRouter, all gas paid by us; 80 receipts, 17 shops, 12 websites with API keys and 16 subscriptions on Arkiv. These are two days of building: proof the flows work, not traction.

## 13. Close

> Payments on Whitechain, records on Arkiv: receipts anyone can verify, QR codes that expire on time, and refunds no one can edit. It's live on Rabdi today. Thank you.
