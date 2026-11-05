/*!
 * WhitePay Checkout v1: drop-in USDT checkout on Whitechain.
 *
 *   <script src="https://whitepay.vercel.app/sdk/checkout.js" defer></script>
 *   <whitepay-button order-endpoint="/api/create-order" amount="2.50" label="Pay 2.50 USDT"></whitepay-button>
 *   <script>
 *     document.querySelector("whitepay-button").addEventListener("whitepay:paid", (e) => console.log(e.detail))
 *   </script>
 *
 * Attributes:
 *   order-endpoint  YOUR server route that signs the order (see @whitepay/checkout/server createWhitePayOrder)
 *   amount          USDT amount sent to your endpoint
 *   label           button text (default "Pay with WhitePay")
 *   payload         optional JSON string passed to your endpoint (cart id, sku...)
 * Events (bubbling, composed):
 *   whitepay:created  { entityKey, payUrl, deadline }
 *   whitepay:paid     { entityKey, orderId, txHash, explorer, amount }
 *   whitepay:expired  { entityKey }
 *   whitepay:error    { message }
 */
(() => {
  if (customElements.get("whitepay-button")) return
  const ORIGIN = (document.currentScript && new URL(document.currentScript.src).origin) || "https://whitepay.vercel.app"

  const css = `
  :host { display: inline-block; font-family: Manrope, ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; }
  button.pay { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; padding: 14px 22px; border-radius: 999px;
    background: #2448ff; color: #fff; font-weight: 700; font-size: 16px; box-shadow: 0 8px 22px rgba(36,72,255,.35); transition: transform .12s; }
  button.pay:active { transform: scale(.97); }
  button.pay[disabled] { opacity: .6; cursor: progress; }
  .logo { width: 22px; height: 22px; border-radius: 6px; background: #fff; display: grid; place-items: center; }
  .back { position: fixed; inset: 0; background: rgba(4,6,20,.6); display: grid; place-items: center; z-index: 2147483000; animation: f .2s; }
  .card { width: min(92vw, 380px); background: #fff; color: #0b1033; border-radius: 24px; padding: 22px; text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,.4); animation: up .25s cubic-bezier(.2,.9,.3,1.2); }
  .top { display: flex; justify-content: space-between; align-items: center; font-weight: 800; }
  .x { all: unset; cursor: pointer; font-size: 22px; padding: 4px 8px; color: #5b6488; }
  .amt { font-size: 40px; font-weight: 800; letter-spacing: -.03em; margin: 10px 0 2px; }
  .sub { color: #5b6488; font-size: 13.5px; }
  .qr { margin: 14px auto; width: 230px; height: 230px; border-radius: 16px; border: 1px solid #dde2f3; padding: 8px; background: #fff; }
  .qr img { width: 100%; height: 100%; image-rendering: pixelated; }
  a.open { display: block; margin-top: 10px; padding: 13px; border-radius: 999px; background: #2448ff; color: #fff; font-weight: 700; text-decoration: none; }
  .status { margin-top: 12px; font-weight: 700; display: flex; gap: 8px; justify-content: center; align-items: center; }
  .spin { width: 16px; height: 16px; border-radius: 50%; border: 3px solid #dde2f3; border-top-color: #2448ff; animation: s .8s linear infinite; }
  .ok { width: 72px; height: 72px; margin: 10px auto; border-radius: 50%; background: #12a86b; color: #fff; display: grid; place-items: center; font-size: 38px; animation: up .3s; }
  .pill { display: inline-block; margin-top: 6px; background: #ddf05a; color: #1b2108; font-weight: 800; font-size: 12px; padding: 4px 10px; border-radius: 999px; }
  .tx { display: block; margin-top: 10px; color: #2448ff; font-weight: 600; font-size: 14px; }
  @keyframes s { to { transform: rotate(360deg) } } @keyframes f { from { opacity: 0 } } @keyframes up { from { transform: translateY(16px) scale(.97); opacity: 0 } }`

  const logo = `<svg viewBox="0 0 512 512" width="16" height="16"><path d="M110 168l50 176 56-128 40 92 40-92 56 128 50-176" fill="none" stroke="#2448ff" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  const fmt = (base) => { const n = BigInt(base); const w = n / 1000000n; const f = (n % 1000000n).toString().padStart(6, "0").slice(0, 2); return `${w}.${f}` }
  const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s)) % 60).padStart(2, "0")}`

  class WhitePayButton extends HTMLElement {
    constructor() { super(); this.root = this.attachShadow({ mode: "open" }) }
    connectedCallback() {
      this.root.innerHTML = `<style>${css}</style><button class="pay" part="button"><span class="logo">${logo}</span><span class="t"></span></button>`
      this.btn = this.root.querySelector("button.pay")
      this.root.querySelector(".t").textContent = this.getAttribute("label") || "Pay with WhitePay"
      this.btn.addEventListener("click", () => this.start())
    }
    emit(name, detail) { this.dispatchEvent(new CustomEvent(`whitepay:${name}`, { detail, bubbles: true, composed: true })) }
    async start() {
      this.btn.disabled = true
      try {
        const extra = this.getAttribute("payload")
        const r = await fetch(this.getAttribute("order-endpoint"), {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ amount: this.getAttribute("amount"), ...(extra ? { payload: JSON.parse(extra) } : {}) }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || "Couldn't create the order")
        this.emit("created", d)
        this.open(d)
      } catch (e) { this.emit("error", { message: e.message }); alert(`WhitePay: ${e.message}`) }
      finally { this.btn.disabled = false }
    }
    open(d) {
      const back = document.createElement("div")
      back.className = "back"
      back.innerHTML = `<div class="card" role="dialog" aria-label="Pay with WhitePay">
        <div class="top"><span>WhitePay</span><button class="x" aria-label="Close">×</button></div>
        <div class="amt">${fmt(d.amount)} <span style="font-size:18px;color:#5b6488">USDT</span></div>
        <span class="pill">0 gas · Whitechain</span>
        <div class="qr"><img alt="Scan to pay" src="${ORIGIN}/api/qr?data=${encodeURIComponent(d.payUrl)}"></div>
        <div class="sub">Scan with your phone camera or WhitePay</div>
        <a class="open" href="${d.payUrl}" target="_blank" rel="noopener">Pay on this device</a>
        <div class="status"><span class="spin"></span><span class="st">Waiting for payment · <b class="cd"></b></span></div>
      </div>`
      this.root.appendChild(back)
      const close = () => { clearInterval(poll); clearInterval(tick); back.remove() }
      back.querySelector(".x").onclick = close
      back.onclick = (e) => { if (e.target === back) close() }
      const cd = back.querySelector(".cd")
      const tick = setInterval(() => { cd.textContent = mmss(Number(d.deadline) - Date.now() / 1000) }, 500)
      const poll = setInterval(async () => {
        const s = await fetch(`${ORIGIN}/api/requests/${d.entityKey}`).then((x) => x.json()).catch(() => null)
        if (!s) return
        if (s.state === "paid") {
          clearInterval(poll); clearInterval(tick)
          const ex = s.receipt?.explorer
          back.querySelector(".card").innerHTML = `<div class="ok">✓</div><div class="amt" style="font-size:28px">Paid ${fmt(d.amount)} USDT</div>
            <div class="sub">Settled on Whitechain · receipt on Arkiv</div>${ex ? `<a class="tx" href="${ex}" target="_blank" rel="noopener">View transaction ↗</a>` : ""}
            <a class="open" href="#" data-done>Done</a>`
          back.querySelector("[data-done]").onclick = (e) => { e.preventDefault(); close() }
          this.emit("paid", { entityKey: d.entityKey, orderId: d.orderId, txHash: s.receipt?.txHash, explorer: ex, amount: d.amount })
        } else if (s.state === "depleted") {
          clearInterval(poll); clearInterval(tick)
          back.querySelector(".status").innerHTML = `<span style="color:#d63c3c">This payment request expired</span>`
          this.emit("expired", { entityKey: d.entityKey })
        }
      }, 2000)
    }
  }
  customElements.define("whitepay-button", WhitePayButton)
})()
