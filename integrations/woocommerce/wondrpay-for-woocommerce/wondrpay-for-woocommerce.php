<?php
/**
 * Plugin Name:       WondrPay for WooCommerce
 * Plugin URI:        https://wondrpay.vercel.app/developers#woocommerce
 * Description:       Accept USDT on Whitechain with WondrPay: hosted checkout, customers pay no gas, money goes straight to your wallet. Refunds from WooCommerce via your WondrPay refund allowance.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * WC requires at least: 7.0
 * Author:            WondrPay
 * License:           MIT
 * Text Domain:       wondrpay
 *
 * How it works
 *  1. At checkout the plugin creates a WondrPay checkout session with your secret key (server-side only) and sends the
 *     customer to WondrPay's hosted checkout.
 *  2. WondrPay sends `checkout.session.completed` to  https://your-shop/?wc-api=wondrpay  (set it as the website's
 *     webhook URL in WondrPay Business). The plugin never trusts the webhook body: it re-reads the session from the
 *     WondrPay API with your secret key and only then marks the order paid. The same check runs when the customer
 *     lands back on the thank-you page, so orders complete even if the webhook is late.
 *  3. Refunds from the WooCommerce order screen use POST /api/v1/refunds (needs a refund allowance in WondrPay Business).
 */

if (!defined('ABSPATH')) exit;

add_action('plugins_loaded', function () {
    if (!class_exists('WC_Payment_Gateway')) return;

    class WC_Gateway_WondrPay extends WC_Payment_Gateway {
        const META_SESSION = '_wondrpay_session_id';
        const META_AMOUNT  = '_wondrpay_usdt';

        public function __construct() {
            $this->id                 = 'wondrpay';
            $this->method_title       = 'WondrPay (USDT)';
            $this->method_description = 'Accept USDT on Whitechain. Customers pay with the WondrPay app or a browser wallet, with no gas. Get your keys at WondrPay Business.';
            $this->has_fields         = false;
            $this->supports           = array('products', 'refunds');
            $this->init_form_fields();
            $this->init_settings();
            $this->title       = $this->get_option('title', 'Pay with WondrPay (USDT)');
            $this->description = $this->get_option('description', 'Pay in USDT on Whitechain. No network fee.');
            add_action('woocommerce_update_options_payment_gateways_' . $this->id, array($this, 'process_admin_options'));
            add_action('woocommerce_api_wondrpay', array($this, 'handle_webhook'));
            add_action('woocommerce_thankyou_' . $this->id, array($this, 'confirm_on_return'));
        }

        public function init_form_fields() {
            $this->form_fields = array(
                'enabled'     => array('title' => 'Enable', 'type' => 'checkbox', 'label' => 'Enable WondrPay', 'default' => 'no'),
                'title'       => array('title' => 'Title', 'type' => 'text', 'default' => 'Pay with WondrPay (USDT)'),
                'description' => array('title' => 'Description', 'type' => 'textarea', 'default' => 'Pay in USDT on Whitechain. No network fee.'),
                'secret_key'  => array('title' => 'Secret key', 'type' => 'password', 'description' => 'wp_sk_test_… from WondrPay Business → Websites & API keys. Add this shop\'s domain to the website first.', 'default' => ''),
                'api_base'    => array('title' => 'WondrPay URL', 'type' => 'text', 'default' => 'https://wondrpay.vercel.app'),
            );
        }

        private function api($method, $path, $body = null, $idempotency = null) {
            $headers = array('Authorization' => 'Bearer ' . trim($this->get_option('secret_key')), 'Content-Type' => 'application/json');
            if ($idempotency) $headers['Idempotency-Key'] = $idempotency;
            // refunds wait for the on-chain transfer and the ledger: allow a minute
            $args = array('method' => $method, 'headers' => $headers, 'timeout' => 60);
            if ($body !== null) $args['body'] = wp_json_encode($body);
            $res = wp_remote_request(rtrim($this->get_option('api_base', 'https://wondrpay.vercel.app'), '/') . $path, $args);
            if (is_wp_error($res)) return new WP_Error('wondrpay_network', 'Could not reach WondrPay: ' . $res->get_error_message());
            $code = wp_remote_retrieve_response_code($res);
            $data = json_decode(wp_remote_retrieve_body($res), true);
            if ($code < 200 || $code >= 300) {
                $msg = is_array($data) && isset($data['error']['message']) ? $data['error']['message'] : ('WondrPay error ' . $code);
                return new WP_Error('wondrpay_api', $msg);
            }
            return is_array($data) ? $data : new WP_Error('wondrpay_api', 'Unexpected response from WondrPay');
        }

        /** Store money -> USDT decimal string. USD/USDT 1:1; other currencies at WondrPay's display rate. */
        private function to_usdt($amount, $currency) {
            $currency = strtoupper($currency);
            if (in_array($currency, array('USD', 'USDT'), true)) return number_format((float) $amount, 2, '.', '');
            $res = wp_remote_get(rtrim($this->get_option('api_base', 'https://wondrpay.vercel.app'), '/') . '/api/fx', array('timeout' => 10));
            $data = is_wp_error($res) ? null : json_decode(wp_remote_retrieve_body($res), true);
            $rate = isset($data['rates'][$currency]) ? (float) $data['rates'][$currency] : 0;
            if ($rate <= 0) return new WP_Error('wondrpay_fx', 'WondrPay has no rate for ' . $currency . '. Set the store currency to USD.');
            return number_format(((float) $amount) / $rate, 2, '.', '');
        }

        public function process_payment($order_id) {
            $order = wc_get_order($order_id);
            $usdt = $this->to_usdt($order->get_total(), $order->get_currency());
            if (is_wp_error($usdt)) { wc_add_notice($usdt->get_error_message(), 'error'); return array('result' => 'failure'); }
            $names = array();
            foreach ($order->get_items() as $item) $names[] = $item->get_name() . ' ×' . $item->get_quantity();
            // WondrPay stores return URLs in 128-character fields: fall back to shorter pages when needed
            $success = $this->get_return_url($order);
            if (strlen($success) > 128) $success = home_url('/');
            $cancel = $order->get_cancel_order_url_raw();
            if (strlen($cancel) > 128) $cancel = wc_get_cart_url();
            $session = $this->api('POST', '/api/v1/checkout/sessions', array(
                'amount'      => $usdt,
                'reference'   => 'wc_' . $order->get_id(),
                'description' => mb_substr(implode(', ', $names), 0, 110),
                'successUrl'  => $success,
                'cancelUrl'   => $cancel,
            ), 'wc_' . $order->get_id() . '_' . substr(md5($usdt . '|' . $order->get_currency() . '|' . $order->get_total()), 0, 12) . '_' . floor(time() / 900)); // same order + same total within 15 min = one session; a changed cart gets a new one
            if (is_wp_error($session)) { wc_add_notice('WondrPay: ' . $session->get_error_message(), 'error'); return array('result' => 'failure'); }
            $order->update_meta_data(self::META_SESSION, sanitize_text_field($session['id']));
            $order->update_meta_data(self::META_AMOUNT, sanitize_text_field($session['amount']));
            $order->add_order_note(sprintf('WondrPay checkout started: %s USDT (session %s).', $session['amount'], $session['id']));
            $order->update_status('pending', 'Waiting for the WondrPay payment.');
            $order->save();
            return array('result' => 'success', 'redirect' => esc_url_raw($session['url']));
        }

        /** Ask WondrPay (with the secret key) whether this order's session is paid, and complete the order if so. */
        private function sync_order($order) {
            if (!$order || $order->is_paid()) return;
            $sid = $order->get_meta(self::META_SESSION);
            if (!preg_match('/^0x[0-9a-fA-F]{64}$/', (string) $sid)) return;
            $s = $this->api('GET', '/api/v1/checkout/sessions/' . $sid);
            if (is_wp_error($s)) { $order->add_order_note('WondrPay check failed: ' . $s->get_error_message()); return; }
            if (($s['reference'] ?? '') !== 'wc_' . $order->get_id()) return; // never trust a session for another order
            // and never for another price: the session's amount must be what this order asked for
            $expected = (string) $order->get_meta(self::META_AMOUNT);
            if ($expected === '' || abs(((float) ($s['amount'] ?? 0)) - (float) $expected) > 0.000001) {
                $order->add_order_note('WondrPay session amount does not match this order; not marked paid.');
                return;
            }
            if (($s['status'] ?? '') === 'paid' && !empty($s['payment']['txHash'])) {
                $order->payment_complete(sanitize_text_field($s['payment']['txHash']));
                $order->add_order_note('Paid with WondrPay on Whitechain: ' . esc_url_raw($s['payment']['explorer']));
            } elseif (($s['status'] ?? '') === 'expired') {
                $order->update_status('failed', 'WondrPay checkout expired unpaid.');
            }
        }

        public function confirm_on_return($order_id) { $this->sync_order(wc_get_order($order_id)); }

        /** /?wc-api=wondrpay : WondrPay webhook. The body only tells us WHICH order to re-check. */
        public function handle_webhook() {
            $body = json_decode(file_get_contents('php://input'), true);
            $ref = is_array($body) ? (string) ($body['reference'] ?? '') : '';
            if (($body['event'] ?? '') === 'test.ping') { status_header(200); exit('ok'); }
            if (!preg_match('/^wc_(\d+)$/', $ref, $m)) { status_header(200); exit('ignored'); }
            $this->sync_order(wc_get_order((int) $m[1]));
            status_header(200);
            exit('ok');
        }

        public function process_refund($order_id, $amount = null, $reason = '') {
            $order = wc_get_order($order_id);
            $sid = $order ? $order->get_meta(self::META_SESSION) : '';
            if (!preg_match('/^0x[0-9a-fA-F]{64}$/', (string) $sid)) return new WP_Error('wondrpay_refund', 'This order has no WondrPay payment.');
            $usdt = $amount === null ? null : $this->to_usdt($amount, $order->get_currency());
            if (is_wp_error($usdt)) return $usdt;
            $body = array('paymentId' => $sid, 'reason' => mb_substr((string) $reason, 0, 90));
            if ($usdt !== null) $body['amount'] = $usdt;
            $refund_no = count($order->get_refunds());
            $r = $this->api('POST', '/api/v1/refunds', $body, 'wc_refund_' . $order->get_id() . '_' . $refund_no);
            if (is_wp_error($r)) return $r;
            $order->add_order_note(sprintf('Refunded %s USDT with WondrPay: %s', number_format(((float) $r['amount']) / 1e6, 2), esc_url_raw($r['explorer'])));
            return true;
        }
    }

    add_filter('woocommerce_payment_gateways', function ($gateways) { $gateways[] = 'WC_Gateway_WondrPay'; return $gateways; });
});
