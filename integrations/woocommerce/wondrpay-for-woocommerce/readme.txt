=== WondrPay for WooCommerce ===
Tags: usdt, stablecoin, payments, whitechain, crypto
Requires at least: 6.0
Requires PHP: 7.4
Stable tag: 0.1.0
License: MIT

Accept USDT on Whitechain. Customers pay with the WondrPay app or a browser wallet and pay no gas; the money goes straight to your own wallet.

== Setup ==

1. In WondrPay Business (https://wondrpay.vercel.app/portal):
   * set up your shop and add a website with your shop's domain (for example shop.example.com);
   * set the website's webhook URL to  https://shop.example.com/?wc-api=wondrpay
   * copy the secret key (shown once).
2. Install this plugin (Plugins → Add New → Upload Plugin → the zip) and activate it.
3. WooCommerce → Settings → Payments → WondrPay (USDT): enable it and paste the secret key.
4. Optional, for refunds from the order screen: in WondrPay Business → Refunds by API, approve a refund cap.

Test mode runs on Whitechain Sepolia with test USDT.

== How payments are confirmed ==

The plugin never trusts a webhook body. When WondrPay calls the webhook, or the customer comes back to the thank-you page, the plugin asks the WondrPay API (with your secret key) for the session's status and only marks the order paid when it's `paid` and belongs to that order.

== Currencies ==

USD stores charge 1 USD = 1 USDT. Other store currencies are converted at WondrPay's display rate (refreshed every 10 minutes) when the checkout starts.

== Changelog ==

= 0.1.0 =
* Hosted checkout, webhook + return-page confirmation, refunds via refund allowance.
