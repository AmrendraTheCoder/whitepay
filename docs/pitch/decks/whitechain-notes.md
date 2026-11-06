# WondrPay: speaker notes for the Whitechain deck

Speaker notes from `WondrPay-Whitechain.pptx`, one block per slide. Lines in brackets are actions; "(Backup)" slides can be skipped to stay inside 3 minutes.

## 1. Title

> WondrPay, UPI for digital dollars, built on Whitechain. (Open Amaron with one product in the bag; phone on the WondrPay home screen.)

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

> Whitechain's relaunch is about distribution: 40 million users across W Group. What a chain needs is a reason for them to come back every day. People trade now and then. They pay daily. At our three-year goal that's about 120 million Whitechain transactions a year, roughly 4.7 million dollars of WBT gas at today's testnet prices, around 80 million dollars of USDT held on Whitechain, and 2.6 million dollars of WBT handed to a million people as cashback.

## 9. Track slide 2

> (Scale.) The payer never touches gas. They sign a USDT authorization for one exact order; our relayer submits it; the PaymentRouter settles that order once. Replays fail, the 5-cent minimum fee covers gas, limits are per human through World ID, and we pause relaying when gas spikes.

## 10. Track slide 3

> (Operate.) Any website adds checkout with one script tag and one button. The shop's server signs the price, webhooks are signed, refunds go only to the original payer and never above what they paid, and subscriptions have limits enforced on-chain.

## 11. Money

> Every 100 dollars spent at a shop: the shop pays 50 cents, against 2 to 3% for cards. 4 cents is Whitechain's gas, 23 cents goes back to the shopper as cashback, 23 cents is ours. On top: a share of currency exchange, business plans, and 3 cents per transfer after ten free a month. About 7 million dollars a year of revenue by year three.

## 12. Proof

> (Backup.) All of this is on testnet today: 110 transactions and 216 USDT transfers on our PaymentRouter, all gas paid by us; 80 receipts, 17 shops, 12 websites with API keys and 16 subscriptions on Arkiv. These are two days of building: proof the flows work, not traction.

## 13. Close

> Every payment pays three ways: we earn the fee, Whitechain earns the gas, shoppers earn cashback. It's live today; Amaron just took a real payment. What we need: WhiteBIT as the ramp partner from UAE to India, the Builder Program for mainnet, and co-marketing to W Group users. Thank you.
