# WondrPay: speaker notes for the World deck

Speaker notes from `WondrPay-World.pptx`, one block per slide. Lines in brackets are actions; "(Backup)" slides can be skipped to stay inside 3 minutes.

## 1. Title

> WondrPay, UPI for digital dollars. Today I'll show where World ID sits in every payment we make fair. (Phone on WondrPay; World App ready.)

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

> Money apps have a uniqueness problem: one person can make a thousand wallets. We use World ID at five trust moments: claiming a name, verifying a shop, approving a payment over 100 USDT, requesting a refund, and claiming cashback. Each needs a unique human, not an identity, so Proof of Human is the minimum sufficient credential.

## 9. Track slide 2

> Every proof is checked on our backend, never trusted from the browser. Our server signs the request context, World App returns a proof bound to this wallet and this exact action, we verify it, then the protected action runs. Cancel, decline or a replayed proof, and nothing happens: no name, no badge, no payout. We store only the nullifier's hash on Arkiv.

## 10. Track slide 3

> That's what stops farming. One human can link up to five wallets, and limits count per human. A bot with fifty wallets still gets three welcome wins and five dollars a month in total. We tested it live: the second wallet was refused with 'Welcome bonus already used by this person on another wallet'. Our one ask for World: structured errors instead of a bare 'Failed'.

## 11. Money

> Every 100 dollars spent at a shop: the shop pays 50 cents, against 2 to 3% for cards. 4 cents is Whitechain's gas, 23 cents goes back to the shopper as cashback, 23 cents is ours. On top: a share of currency exchange, business plans, and 3 cents per transfer after ten free a month. About 7 million dollars a year of revenue by year three.

## 12. Proof

> (Backup.) All of this is on testnet today: 110 transactions and 216 USDT transfers on our PaymentRouter, all gas paid by us; 80 receipts, 17 shops, 12 websites with API keys and 16 subscriptions on Arkiv. These are two days of building: proof the flows work, not traction.

## 13. Close

> One person, one name, one reward. World ID is what makes digital-dollar payments fair without anyone sharing who they are. It's live on testnet; try it at wondrpay.vercel.app. Thank you.
