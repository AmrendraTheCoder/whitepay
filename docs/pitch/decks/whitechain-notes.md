# WondrPay: speaker notes for the Whitechain deck

Speaker notes from `WondrPay-Whitechain.pptx`, one block per slide. Spoken text comes from `docs/pitch/whitechain.md`; lines in brackets are actions; "(Backup)" slides are not in the 3-minute script.

## 1. Title

> [Title slide. Setup: laptop on Amaron (wondrpay-demo-store.vercel.app) with one product in the bag; phone on the WondrPay home screen] Start the script on the next slide.

## 2. Hook

> "Three numbers.
> 
> 20 billion: UPI payments in India every month, by scanning a QR.
> 129 billion: dollars sent home to India every year.
> Zero: the number of those you can pay with the dollars sitting in a WhiteBIT account.
> 
> WondrPay fixes the zero. It's UPI for digital dollars, built on Whitechain."

## 3. Three taps

> [Laptop: Amaron checkout, tap Pay with WondrPay.]
> "Amaron, a fashion store. I check out with WondrPay." [Phone: scan the QR, enter the PIN.] "Scan, PIN, done. Paid in USDT on Whitechain, with zero WBT in my wallet. We pay the gas, so shoppers never see it."
> 
> [Laptop shows the order confirmed. Phone shows a scratch card.]
> "The store has its order. I got a scratch card: cashback paid in WBT.

## 4. Everything live

> Also live on testnet:
> • Sending money to people using names like priya.wondrpay.eth.
> • Subscriptions that renew on their own.
> • Refund requests stored on Arkiv, so no one can edit them, with World ID stopping fake claims.
> 
> And Amaron joined in an afternoon. Our business portal gives any website an API key, payment links, webhooks, team roles and prices in local currency."

## 5. How it fits together

> (Backup: not in the 3-minute script.) The phone holds the key and signs one exact order. Our relayer pays the gas and settles it on Whitechain. Arkiv holds the public records: requests, receipts, directories, refunds. World ID keeps it one human per name, shop and reward. ENS gives everyone a readable name.

## 6. Market

> "Money crossing borders is where payments are still broken: $685 billion a year goes home to developing countries, and sending it costs about 6%.

## 7. Where we start

> We start in three places where W Group is already strong:
> 1. The Gulf to India. The Gulf sends 38% of India's remittances.
> 2. Ukraine and Europe. Freelancers and online sellers paid in USDT, cashing out through WhiteBIT.
> 3. Countries that save in dollars: Turkey, Nigeria, Argentina.
> 
> Our three-year goal: 1 million verified people, 50,000 shops, $1.5 billion in shop payments and $3 billion sent home."

## 8. Track slide 1

> "Whitechain's relaunch is about distribution. You have 40 million users across W Group. What a chain needs is a reason for them to come back every day. People trade now and then. They pay daily.
> 
> At our three-year goal that's about 120 million Whitechain transactions a year:
> • roughly $4.7 million of WBT gas at today's testnet prices;
> • around $80 million in USDT sitting on Whitechain in shop and wallet balances;
> • $2.6 million a year of WBT handed to a million ordinary people as cashback, most of them holding WBT for the first time.
> 
> And WhiteBIT earns on every dollar that turns into rupees or hryvnias."

## 9. Track slide 2

> (Backup: not in the 3-minute script.) (Scale.) The payer never touches gas. They sign a USDT authorization for one exact order; our relayer submits it; the PaymentRouter settles that order once. Replays fail, the 5-cent minimum fee covers gas, limits are per human through World ID, and we pause relaying when gas spikes.

## 10. Track slide 3

> (Backup: not in the 3-minute script.) (Operate.) Any website adds checkout with one script tag and one button. The shop's server signs the price, webhooks are signed, refunds go only to the original payer and never above what they paid, and subscriptions have limits enforced on-chain.

## 11. Money

> "Here's every $100 spent at a shop. The shop pays 50 cents, against 2 to 3% for cards.
> • 4 cents is Whitechain's gas.
> • 23 cents goes back to the shopper as cashback.
> • 23 cents is ours.
> 
> On top: a share of the currency exchange, paid business plans, and 3 cents per transfer after ten free a month. That's about $7 million a year in revenue by year three."

## 12. Proof

> (Backup: not in the 3-minute script.) All of this is on testnet today: 110 transactions and 216 USDT transfers on our PaymentRouter, all gas paid by us; 80 receipts, 17 shops, 12 websites with API keys and 16 subscriptions on Arkiv. These are two days of building: proof the flows work, not traction.

## 13. Close

> "Every payment pays three ways: we earn the fee, Whitechain earns the gas, shoppers earn cashback. It's live today. Amaron just took a real payment. Give it W Group's distribution, and the zero becomes millions. Thank you."
