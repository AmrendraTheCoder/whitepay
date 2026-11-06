/*! WondrPay Checkout SDK v1.2.1 · USDT on Whitechain · MIT
 *
 * Works on ANY website (plain HTML, React, Vue, Svelte, WordPress, Shopify custom theme):
 *
 *   <script src="https://wondrpay.vercel.app/sdk/v1/checkout.js" integrity="sha384-…" crossorigin="anonymous" defer></script>
 *   <wondrpay-button order-endpoint="/api/create-order" payload='{"sku":"chai-kit"}' label="Pay 2.50 USDT"></wondrpay-button>
 *   <script>document.addEventListener("wondrpay:paid", (e) => showThankYou(e.detail))</script>
 *
 * Subscriptions (Autopay): <wondrpay-button mode="subscribe" order-endpoint="/api/create-subscription" …>
 *   your endpoint returns createWondrPaySubscription(...) → QR to approve autopay → wondrpay:subscribed {mandateKey, subscriber}
 *
 * Attributes: order-endpoint (YOUR same-origin route that signs the order with @whitepay/checkout/server),
 *             payload (JSON sent to it, e.g. sku/cart id; the PRICE must come from your server), label, theme="dark".
 * Events (bubble, composed): wondrpay:subscribed {planKey,mandateKey,subscriber,amount,cycles} (subscribe mode)
 *                            wondrpay:created {entityKey,payUrl,deadline} · wondrpay:paid {entityKey,orderId,txHash,explorer,amount}
 *                            wondrpay:expired {entityKey} · wondrpay:error {message}
 *
 * Security model: the SDK never handles keys or money. It renders the WondrPay QR for an order YOUR server
 * signed, then polls WondrPay for the result. Every value from the network is validated against a strict
 * pattern and written with textContent / setAttribute only (no innerHTML with data), the order endpoint must
 * be same-origin, links are rel="noopener noreferrer", and "paid" in the browser is only a UI hint: fulfil
 * orders from the signed webhook + on-chain check on your server.
 */
(() => {
  "use strict"
  if (typeof window === "undefined" || customElements.get("wondrpay-button")) return
  const VERSION = "1.3.0"
  const ORIGIN = (document.currentScript && new URL(document.currentScript.src).origin) || "https://wondrpay.vercel.app"
  const RE = {
    key: /^0x[0-9a-fA-F]{64}$/, uint: /^\d{1,30}$/, tx: /^0x[0-9a-fA-F]{64}$/,
    explorer: /^https:\/\/explorer\.testnet\.whitechain\.io\/tx\/0x[0-9a-fA-F]{64}$/,
  }

  const css = `
  :host { display: inline-block; font-family: Manrope, ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; }
  button.pay { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    padding: 14px 22px; border-radius: 999px; background: #2448ff; color: #fff; font-weight: 700; font-size: 16px; width: 100%;
    box-shadow: 0 8px 22px rgba(36,72,255,.35); transition: transform .12s, box-shadow .2s; }
  button.pay:hover { box-shadow: 0 12px 28px rgba(36,72,255,.45); } button.pay:active { transform: scale(.97); }
  button.pay:focus-visible { outline: 3px solid #ddf05a; outline-offset: 2px; }
  button.pay[disabled] { opacity: .85; cursor: progress; }
  button.pay .bspin { width: 16px; height: 16px; border-radius: 50%; border: 3px solid rgba(255,255,255,.35); border-top-color: #fff; animation: s .8s linear infinite; }
  .logo { width: 22px; height: 22px; border-radius: 6px; background: #fff; display: grid; place-items: center; }
  .back { position: fixed; inset: 0; background: rgba(4,6,20,.62); backdrop-filter: blur(3px); display: grid; place-items: center; z-index: 2147483000; animation: f .2s; }
  .card { width: min(92vw, 380px); background: #fff; color: #0b1033; border-radius: 24px; padding: 22px; text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,.4); animation: up .25s cubic-bezier(.2,.9,.3,1.2); }
  .top { display: flex; justify-content: space-between; align-items: center; font-weight: 800; }
  .x { all: unset; cursor: pointer; font-size: 22px; padding: 4px 10px; color: #5b6488; border-radius: 10px; } .x:focus-visible { outline: 2px solid #2448ff; }
  .amt { font-size: 40px; font-weight: 800; letter-spacing: -.03em; margin: 10px 0 2px; } .unit { font-size: 18px; color: #5b6488; }
  .sub { color: #5b6488; font-size: 13.5px; }
  .qr { margin: 14px auto; width: 230px; height: 230px; border-radius: 16px; border: 1px solid #dde2f3; padding: 8px; background: #fff; }
  .qr img { width: 100%; height: 100%; image-rendering: pixelated; }
  a.open { display: block; margin-top: 10px; padding: 13px; border-radius: 999px; background: #2448ff; color: #fff; font-weight: 700; text-decoration: none; }
  .status { margin-top: 12px; font-weight: 700; display: flex; gap: 8px; justify-content: center; align-items: center; }
  .spin { width: 16px; height: 16px; border-radius: 50%; border: 3px solid #dde2f3; border-top-color: #2448ff; animation: s .8s linear infinite; }
  .ok { width: 72px; height: 72px; margin: 10px auto; border-radius: 50%; background: #12a86b; color: #fff; display: grid; place-items: center; font-size: 38px; animation: up .3s; }
  .pill { display: inline-block; margin-top: 6px; background: #ddf05a; color: #1b2108; font-weight: 800; font-size: 12px; padding: 4px 10px; border-radius: 999px; }
  .tx { display: block; margin-top: 10px; color: #2448ff; font-weight: 600; font-size: 14px; }
  .bad { color: #d63c3c; } .foot { margin-top: 12px; font-size: 11px; color: #8a92b2; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  @keyframes s { to { transform: rotate(360deg) } } @keyframes f { from { opacity: 0 } } @keyframes up { from { transform: translateY(16px) scale(.97); opacity: 0 } }`

  const fmt = (base) => { const n = BigInt(base); return `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, "0").slice(0, 2)}` }
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` }
  /** tiny safe element builder: text is always textContent, attributes via setAttribute */
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v)
    for (const c of kids) if (c != null) el.append(typeof c === "string" ? document.createTextNode(c) : c)
    return el
  }
  const logo = () => {
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path")
    svg.setAttribute("viewBox", "0 0 512 512"); svg.setAttribute("width", "16"); svg.setAttribute("height", "16"); svg.setAttribute("aria-hidden", "true")
    p.setAttribute("d", "M110 168l50 176 56-128 40 92 40-92 56 128 50-176"); p.setAttribute("fill", "none"); p.setAttribute("stroke", "#2448ff")
    p.setAttribute("stroke-width", "56"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round")
    svg.append(p); return svg
  }

  class WondrPayButton extends HTMLElement {
    static get observedAttributes() { return ["label"] }
    constructor() { super(); this.root = this.attachShadow({ mode: "open" }) }
    connectedCallback() {
      if (this.btn) return
      const style = h("style"); style.textContent = css
      this._labelEl = h("span")
      this.btn = h("button", { class: "pay", part: "button", type: "button" }, h("span", { class: "logo" }, logo()), this._labelEl)
      this.root.append(style, this.btn)
      this.attributeChangedCallback()
      this.btn.addEventListener("click", () => this.start())
    }
    attributeChangedCallback() { if (this._labelEl && !this.busy) this._labelEl.textContent = this.getAttribute("label") || "Pay with WondrPay" }
    // frameworks (React 19, Vue, Lit) may set these as properties: reflect them to attributes
    get label() { return this.getAttribute("label") } set label(v) { v == null ? this.removeAttribute("label") : this.setAttribute("label", String(v)) }
    get payload() { return this.getAttribute("payload") } set payload(v) { v == null ? this.removeAttribute("payload") : this.setAttribute("payload", typeof v === "string" ? v : JSON.stringify(v)) }
    get mode() { return this.getAttribute("mode") } set mode(v) { v == null ? this.removeAttribute("mode") : this.setAttribute("mode", String(v)) }
    disconnectedCallback() { this.cleanup && this.cleanup() }
    emit(name, detail) {
      for (const ns of ["wondrpay", "whitepay"]) // whitepay:* kept for sites integrated before the rename
        this.dispatchEvent(new CustomEvent(`${ns}:${name}`, { detail, bubbles: true, composed: true }))
    }
    fail(message) { this.emit("error", { message }); console.warn(`[WondrPay] ${message}`) }

    async start() {
      if (this.busy) return
      this.busy = true; this.btn.disabled = true
      this.btn.setAttribute("aria-busy", "true")
      const logoEl = this.btn.querySelector(".logo"), spin = h("span", { class: "bspin", "aria-hidden": "true" })
      logoEl.replaceWith(spin)
      this._labelEl.textContent = "Preparing secure checkout…"
      try {
        const ep = new URL(this.getAttribute("order-endpoint") || "", location.href)
        if (ep.origin !== location.origin) throw new Error("order-endpoint must be on this site (same origin)")
        let payload
        const raw = this.getAttribute("payload")
        if (raw) { try { payload = JSON.parse(raw) } catch { throw new Error("payload attribute is not valid JSON") } }
        const r = await fetch(ep, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload }) })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(typeof d.error === "string" ? d.error.slice(0, 160) : "Couldn't create the order")
        if (this.getAttribute("mode") === "subscribe") {
          if (!RE.key.test(d.planKey) || !RE.uint.test(String(d.amount)) || !/^\d{1,9}$/.test(String(d.period)) || !/^\d{1,2}$/.test(String(d.cycles)))
            throw new Error("unexpected plan response")
          const subscribeUrl = `${ORIGIN}/subscribe?plan=${d.planKey}`
          if (d.subscribeUrl !== subscribeUrl) throw new Error("plan points to an unknown page")
          const label = typeof d.periodLabel === "string" ? d.periodLabel.slice(0, 40) : `every ${d.period}s`
          this.emit("created", { planKey: d.planKey, subscribeUrl })
          return this.openSubscription({ planKey: d.planKey, amount: String(d.amount), cycles: Number(d.cycles), label, url: subscribeUrl, deadline: Number(d.expiresAt) || Date.now() / 1000 + 900 })
        }
        // never trust the response shape: validate every field we use
        if (!RE.key.test(d.entityKey) || !RE.uint.test(String(d.amount)) || !RE.uint.test(String(d.deadline)) || (d.orderId && !RE.key.test(d.orderId)))
          throw new Error("unexpected order response")
        const payUrl = `${ORIGIN}/pay?req=${d.entityKey}`
        if (d.payUrl !== payUrl) throw new Error("order points to an unknown payment page")
        const order = { entityKey: d.entityKey, orderId: d.orderId, amount: String(d.amount), deadline: Number(d.deadline), payUrl }
        this.emit("created", { entityKey: order.entityKey, payUrl, deadline: order.deadline })
        this.open(order)
      } catch (e) { this.fail(e.message) ; this.toast(e.message) }
      finally {
        this.busy = false; this.btn.disabled = false; this.btn.removeAttribute("aria-busy")
        const sp = this.btn.querySelector(".bspin"); if (sp) sp.replaceWith(h("span", { class: "logo" }, logo()))
        this.attributeChangedCallback()
      }
    }

    toast(msg) {
      const t = h("div", { class: "sub bad", role: "alert", style: "margin-top:6px" }, `WondrPay: ${msg}`)
      this.root.append(t); setTimeout(() => t.remove(), 5000)
    }

    open(o) {
      const cd = h("b"), st = h("span", {}, "Waiting for payment · ", cd)
      const status = h("div", { class: "status", "aria-live": "polite" }, h("span", { class: "spin" }), st)
      const close = h("button", { class: "x", "aria-label": "Close", type: "button" }, "×")
      const img = h("img", { alt: "Scan to pay", src: `${ORIGIN}/api/qr?data=${encodeURIComponent(o.payUrl)}` })
      const card = h("div", { class: "card", role: "dialog", "aria-modal": "true", "aria-label": "Pay with WondrPay" },
        h("div", { class: "top" }, h("span", {}, "WondrPay"), close),
        h("div", { class: "amt" }, `${fmt(o.amount)} `, h("span", { class: "unit" }, "USDT")),
        h("span", { class: "pill" }, "0 gas · Whitechain"),
        h("div", { class: "qr" }, img),
        h("div", { class: "sub" }, "Scan with your phone camera or WondrPay"),
        h("a", { class: "open", href: o.payUrl, target: "_blank", rel: "noopener noreferrer" }, "Pay on this device"),
        status,
        h("div", { class: "foot" }, `WondrPay Checkout v${VERSION} · order signed by the shop · settled on-chain`))
      const back = h("div", { class: "back" }, card)
      this.root.append(back)
      close.focus()

      let poll, tick, fails = 0, done = false
      const onKey = (e) => { if (e.key === "Escape") this.cleanup() }
      this.cleanup = () => { done = true; clearTimeout(poll); clearInterval(tick); back.remove(); document.removeEventListener("keydown", onKey); this.btn.focus(); this.cleanup = null }
      close.onclick = () => this.cleanup()
      back.onclick = (e) => { if (e.target === back) this.cleanup() }
      document.addEventListener("keydown", onKey)
      const left = () => o.deadline - Date.now() / 1000
      tick = setInterval(() => { cd.textContent = mmss(left()) }, 500); cd.textContent = mmss(left())

      const check = async () => {
        if (done) return
        let s = null
        try { const r = await fetch(`${ORIGIN}/api/requests/${o.entityKey}`, { credentials: "omit", cache: "no-store" }); s = r.ok ? await r.json() : null } catch {}
        if (done) return
        if (!s) fails++; else fails = 0
        if (s && s.state === "paid") return this.paid(o, s, card, () => { clearInterval(tick) })
        if ((s && s.state === "depleted") || left() < -30) {
          clearInterval(tick); status.replaceChildren(h("span", { class: "bad" }, "This payment request expired"))
          return this.emit("expired", { entityKey: o.entityKey })
        }
        poll = setTimeout(check, Math.min(2000 * 2 ** Math.min(fails, 3), 15000)) // back off when the network fails
      }
      poll = setTimeout(check, 2000)
    }

    openSubscription(o) {
      const st = h("span", {}, "Waiting for approval…")
      const status = h("div", { class: "status", "aria-live": "polite" }, h("span", { class: "spin" }), st)
      const close = h("button", { class: "x", "aria-label": "Close", type: "button" }, "×")
      const card = h("div", { class: "card", role: "dialog", "aria-modal": "true", "aria-label": "Subscribe with WondrPay Autopay" },
        h("div", { class: "top" }, h("span", {}, "WondrPay Autopay"), close),
        h("div", { class: "amt" }, `${fmt(o.amount)} `, h("span", { class: "unit" }, "USDT")),
        h("div", { class: "sub" }, `${o.label} · ${o.cycles} payments · first one now`),
        h("span", { class: "pill" }, "Approve once · cancel anytime"),
        h("div", { class: "qr" }, h("img", { alt: "Scan to subscribe", src: `${ORIGIN}/api/qr?data=${encodeURIComponent(o.url)}` })),
        h("a", { class: "open", href: o.url, target: "_blank", rel: "noopener noreferrer" }, "Subscribe on this device"),
        status,
        h("div", { class: "foot" }, `WondrPay Checkout v${VERSION} · each payment time-locked on-chain`))
      const back = h("div", { class: "back" }, card)
      this.root.append(back); close.focus()
      let poll, done = false, fails = 0
      const onKey = (e) => { if (e.key === "Escape") this.cleanup() }
      this.cleanup = () => { done = true; clearTimeout(poll); back.remove(); document.removeEventListener("keydown", onKey); this.btn.focus(); this.cleanup = null }
      close.onclick = () => this.cleanup()
      back.onclick = (e) => { if (e.target === back) this.cleanup() }
      document.addEventListener("keydown", onKey)
      const check = async () => {
        if (done) return
        let s = null
        try { const r = await fetch(`${ORIGIN}/api/plans/${o.planKey}`, { credentials: "omit", cache: "no-store" }); s = r.status < 500 ? await r.json() : null } catch {}
        if (done) return
        if (!s) fails++; else fails = 0
        if (s && s.state === "subscribed" && s.mandate && RE.key.test(s.mandate.key)) {
          const doneBtn = h("a", { class: "open", href: "#", role: "button" }, "Done")
          doneBtn.onclick = (e) => { e.preventDefault(); this.cleanup && this.cleanup() }
          card.replaceChildren(h("div", { class: "ok", "aria-hidden": "true" }, "✓"), h("div", { class: "amt", style: "font-size:26px" }, "Autopay is on"),
            h("div", { class: "sub" }, `First ${fmt(o.amount)} USDT paid · next ${o.label}`), doneBtn)
          doneBtn.focus()
          const sub = /^0x[0-9a-fA-F]{40}$/.test(s.mandate.subscriber) ? s.mandate.subscriber : undefined
          return this.emit("subscribed", { planKey: o.planKey, mandateKey: s.mandate.key, subscriber: sub, amount: o.amount, cycles: o.cycles })
        }
        if ((s && s.state === "expired") || Date.now() / 1000 > o.deadline) {
          status.replaceChildren(h("span", { class: "bad" }, "This subscription offer expired"))
          return this.emit("expired", { planKey: o.planKey })
        }
        poll = setTimeout(check, Math.min(2500 * 2 ** Math.min(fails, 3), 15000))
      }
      poll = setTimeout(check, 2500)
    }

    paid(o, s, card, stop) {
      stop()
      const tx = s.receipt && RE.tx.test(s.receipt.txHash) ? s.receipt.txHash : undefined
      const explorer = s.receipt && RE.explorer.test(s.receipt.explorer) ? s.receipt.explorer : undefined
      const doneBtn = h("a", { class: "open", href: "#", role: "button" }, "Done")
      doneBtn.onclick = (e) => { e.preventDefault(); this.cleanup && this.cleanup() }
      card.replaceChildren(
        h("div", { class: "ok", "aria-hidden": "true" }, "✓"),
        h("div", { class: "amt", style: "font-size:28px" }, `Paid ${fmt(o.amount)} USDT`),
        h("div", { class: "sub" }, "Settled on Whitechain · receipt on Arkiv"),
        explorer ? h("a", { class: "tx", href: explorer, target: "_blank", rel: "noopener noreferrer" }, "View transaction ↗") : null,
        doneBtn)
      doneBtn.focus()
      this.emit("paid", { entityKey: o.entityKey, orderId: o.orderId, txHash: tx, explorer, amount: o.amount })
    }
  }
  customElements.define("wondrpay-button", WondrPayButton)
  // pre-rename tag and global keep working for sites that integrated as WondrPay
  if (!customElements.get("whitepay-button")) customElements.define("whitepay-button", class extends WondrPayButton {})
  window.WondrPay = Object.freeze({ version: VERSION, origin: ORIGIN })
  if (!window.WondrPay) window.WondrPay = window.WondrPay
})()
