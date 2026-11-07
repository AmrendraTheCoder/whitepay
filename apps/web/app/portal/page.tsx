"use client"
// WondrPay for Business portal (/portal): merchant wallet → shop profile → websites & API keys → integrate.
// Every change is signed by the shop wallet on this device (PIN, fingerprint or the browser wallet); the server only
// stores what the signature approves. Secret keys are shown once and never stored readable.
import { useCallback, useEffect, useMemo, useState } from "react"
import type { PrivateKeyAccount } from "viem/accounts"
import { siteApprovalMessage } from "@whitepay/shared"
import { getWallet, type WalletInfo } from "@/lib/wallet"
import { UnlockSheet } from "../components"
import { Icon, Identicon } from "../ui"
import { CodeBlock, CopyField, Field, type StepState } from "./kit"
import { SiteHealth } from "./health"
import { PaymentLinks } from "./links"
import { Team } from "./team"
import { RefundAllowance } from "./refunds"
import { USDT_ADDRESS, WHITECHAIN_CHAIN_ID } from "@whitepay/shared"
import "./portal.css"

type Merchant = { address: string; label: string; ensName: string; displayName: string; category?: string; verified: boolean; active: boolean }
type Site = { siteId: string; name: string; domains: string[]; webhook?: string; publishableKey: string; secretHint: string; status: "active" | "revoked"; createdAt: number; updatedAt: number }
type Pending =
  | { kind: "create"; siteId: string; name: string; domains: string[]; webhook?: string }
  | { kind: "rotate" | "revoke"; site: Site }

/** what this business is setting up: decides which steps the timeline shows and which tools stay tucked away */
type Goal = "code" | "plugin" | "links"
const GOALS: { id: Goal; title: string; sub: string }[] = [
  { id: "code", title: "My own website", sub: "I (or my developer) write code" },
  { id: "plugin", title: "WooCommerce / Shopify", sub: "Install a plugin, no code" },
  { id: "links", title: "Payment links only", sub: "Share a link or QR, no website" },
]
const goalKey = (shop: string) => `whitepay.portal.goal.${shop.toLowerCase()}`
type TStep = { id: string; title: string; state: StepState; summary?: React.ReactNode; body: React.ReactNode }

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("")
const when = (t: number) => new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })

export default function Portal() {
  const [wallet, setWallet] = useState<WalletInfo | null | undefined>(undefined)
  const [merchant, setMerchant] = useState<Merchant | null | undefined>(undefined)
  const [sites, setSites] = useState<Site[] | null>(null)
  const [orderSigner, setOrderSigner] = useState<string>("")
  const [loadErr, setLoadErr] = useState("")
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState<string>("")
  const [err, setErr] = useState("")
  const [secret, setSecret] = useState<{ siteId: string; key: string } | null>(null)
  const [form, setForm] = useState({ name: "", domains: "", webhook: "" })
  const [confirm, setConfirm] = useState<string>("") // siteId awaiting "really switch off?"
  // the shop being managed: the wallet's own shop, or one where it's a developer teammate
  const [shop, setShop] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<{ merchant: string; shopName?: string; ensName?: string }[]>([])
  const [ownShop, setOwnShop] = useState(false)
  const [goal, setGoalState] = useState<Goal | null>(null)
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!shop) return
    try { const g = localStorage.getItem(goalKey(shop)) as Goal | null; setGoalState(g && GOALS.some((x) => x.id === g) ? g : null) } catch { setGoalState(null) }
  }, [shop])
  const setGoal = (g: Goal | null) => {
    setGoalState(g); setOpened({})
    try { if (shop) { if (g) localStorage.setItem(goalKey(shop), g); else localStorage.removeItem(goalKey(shop)) } } catch {}
  }

  useEffect(() => setWallet(getWallet()), [])

  const load = useCallback(async (address: string) => {
    setLoadErr("")
    try {
      const [m, s] = await Promise.all([
        fetch(`/api/merchants?address=${address}`).then((r) => r.json()),
        fetch(`/api/business/sites?merchant=${address}`).then((r) => r.json()),
      ])
      setMerchant(m.merchant ?? null)
      if (s.error) throw new Error(s.error.message)
      setSites(s.sites); setOrderSigner(s.orderSigner)
    } catch (e) {
      setLoadErr((e as Error).message || "Couldn't load your shop")
      setMerchant((x) => (x === undefined ? null : x)); setSites((x) => x ?? [])
    }
  }, [])
  useEffect(() => {
    if (!wallet) return
    let live = true
    void (async () => {
      const [own, team] = await Promise.all([
        fetch(`/api/merchants?address=${wallet.address}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/business/team?member=${wallet.address}`).then((r) => r.json()).catch(() => ({ shops: [] })),
      ])
      if (!live) return
      setMemberships(team.shops ?? [])
      setOwnShop(!!own.merchant)
      // default to the wallet's own shop; only open someone else's when we KNOW this wallet has none
      setShop(own.merchant !== null || !team.shops?.length ? wallet.address : team.shops[0].merchant)
    })()
    return () => { live = false }
  }, [wallet])
  useEffect(() => { if (shop) void load(shop) }, [shop, load])
  const role: "owner" | "developer" = !wallet || !shop || shop.toLowerCase() === wallet.address.toLowerCase() ? "owner" : "developer"

  const active = useMemo(() => (sites ?? []).filter((s) => s.status === "active"), [sites])

  const startCreate = (e: React.FormEvent) => {
    e.preventDefault(); setErr("")
    const domains = form.domains.split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "")).filter(Boolean)
    if (!form.name.trim()) return setErr("Give the website a name.")
    if (!domains.length) return setErr("Add the domain your checkout runs on, like shop.example.com.")
    if (form.webhook && !/^https:\/\//.test(form.webhook.trim())) return setErr("The webhook URL must start with https://")
    setPending({ kind: "create", siteId: randomId(), name: form.name.trim(), domains: [...new Set(domains)], webhook: form.webhook.trim() || undefined })
  }

  const signAndSend = async (acct: PrivateKeyAccount) => {
    const p = pending
    if (!p || !wallet || !shop) return
    setPending(null); setErr(""); setBusy(p.kind === "create" ? "create" : p.site.siteId)
    try {
      // approvals are single use: one for an existing site must be newer than its last change (even if this clock lags)
      const issuedAt = Math.max(Math.floor(Date.now() / 1000), p.kind === "create" ? 0 : p.site.updatedAt + 1)
      const s = p.kind === "create" ? p : { siteId: p.site.siteId, name: p.site.name, domains: p.site.domains, webhook: p.site.webhook }
      const message = siteApprovalMessage({ action: p.kind, merchant: shop as `0x${string}`, siteId: s.siteId, name: s.name, domains: s.domains, webhook: s.webhook, orderSigner: orderSigner as `0x${string}`, issuedAt })
      const signature = await acct.signMessage({ message })
      const r = await fetch("/api/business/sites", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: p.kind, merchant: shop, actor: acct.address, siteId: s.siteId, name: s.name, domains: s.domains, webhook: s.webhook, issuedAt, signature }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message ?? "That didn't work. Try again.")
      if (d.secretKey) setSecret({ siteId: s.siteId, key: d.secretKey })
      if (p.kind === "create") setForm({ name: "", domains: "", webhook: "" })
      setConfirm("")
      await load(shop)
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy("") }
  }

  // ---------------------------------------------------------------- step bodies (shown inside the timeline)
  const walletBody = wallet === undefined ? <div className="skel" style={{ height: 64 }} /> : wallet ? (
    <>
      <div className="pt-row">
        <Identicon seed={wallet.address} size={44} />
        <div className="pt-grow">
          <b>{wallet.label}</b>
          <CopyField label={role === "owner" ? "Payout address" : "Your wallet (teammate)"} value={wallet.address} mono />
        </div>
      </div>
      <p className="pt-fine">Want shop money separate? <a href="/you">Add another wallet</a> and switch to it, then reopen this page.</p>
    </>
  ) : (
    <>
      <p className="pt-sub">Payments go straight to this wallet. Use a separate shop wallet (recommended), your WondrPay wallet, or MetaMask.</p>
      <div className="pt-actions">
        <a className="btn btn-primary" href="/app?next=/portal">Create a shop wallet</a>
        <a className="btn btn-ghost" href="/you">Connect MetaMask</a>
      </div>
    </>
  )

  const profileBody = merchant === undefined ? <div className="skel" style={{ height: 64 }} /> : merchant ? (
    <>
      <div className="pt-row">
        <Identicon seed={merchant.address} name={merchant.ensName} size={44} />
        <div className="pt-grow">
          <b>{merchant.displayName}</b>
          <span className="pt-muted">{merchant.ensName}</span>
        </div>
        {merchant.verified ? <span className="pt-pill ok">{Icon.check(13)} Verified human</span> : <a className="pt-pill" href="/merchant">Get verified</a>}
      </div>
      <a className="pt-link" href="/merchant">Edit in Shop →</a>
    </>
  ) : (
    <>
      <p className="pt-sub">Pick a shop name (it becomes <code>name.wondrpay.eth</code>) and the name customers see at checkout.</p>
      <a className="btn btn-primary" href="/merchant">Set up your shop</a>
    </>
  )

  const keysBody = (
    <>
      {secret && (
        <div className="pt-secret" role="region" aria-label="Your new secret key">
          <b>Copy your secret key now. You won't see it again.</b>
          <span className="pt-sub">{goal === "plugin" ? "Paste it into the plugin's settings." : <>Put it in your server's environment as <code>WONDRPAY_SECRET_KEY</code>. Never put it in browser code.</>}</span>
          <CopyField label="Secret key" value={secret.key} mono autoSelect />
          <button className="btn btn-ghost" onClick={() => setSecret(null)}>I've saved it</button>
        </div>
      )}

      {sites === null ? <div className="skel" style={{ height: 80 }} /> : sites.length > 0 && (
        <ul className="pt-sites">
          {sites.map((s) => (
            <li key={s.siteId} className={s.status}>
              <div className="pt-site-h">
                <div><b>{s.name}</b><span className="pt-muted">{s.domains.join(", ")}</span></div>
                <span className={`pt-pill ${s.status === "active" ? "ok" : ""}`}>{s.status === "active" ? "Live in test mode" : "Switched off"}</span>
              </div>
              {goal !== "links" && <CopyField label="Publishable key" value={s.publishableKey} mono />}
              {goal !== "links" && <div className="pt-kv-inline"><span>Secret key</span><code>wp_sk_test_…{s.secretHint}</code></div>}
              {s.webhook && <div className="pt-kv-inline"><span>Webhook</span><code>{s.webhook}</code></div>}
              <div className="pt-kv-inline"><span>Added</span><span>{when(s.createdAt)}</span></div>
              {s.status === "active" && (
                <div className="pt-actions">
                  {goal !== "links" && (
                    <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => setPending({ kind: "rotate", site: s })}>
                      {busy === s.siteId ? <span className="spinner" /> : null} New secret key
                    </button>
                  )}
                  {role !== "owner" ? null : confirm === s.siteId ? (
                    <>
                      <button className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => setPending({ kind: "revoke", site: s })}>Yes, switch off</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirm("")}>Keep it</button>
                    </>
                  ) : <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => setConfirm(s.siteId)}>Switch off</button>}
                </div>
              )}
              {s.status === "active" && shop && goal !== "links" && <SiteHealth merchant={shop} siteId={s.siteId} hasWebhook={!!s.webhook} />}
              {confirm === s.siteId && <p className="pt-fine">Its keys stop working at once, and checkouts that are still open can't be paid any more.</p>}
            </li>
          ))}
        </ul>
      )}

      {role === "owner" ? <form className="pt-form" onSubmit={startCreate} noValidate>
        <h3>{sites?.length ? "Add another website" : goal === "links" ? "Where you sell" : "Add your website"}</h3>
        <Field id="site-name" label={goal === "links" ? "Name" : "Website name"} hint="Only you see this" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder={goal === "links" ? "Instagram shop" : "Kesar store"} maxLength={60} />
        <Field id="site-domains" label="Domains" hint={goal === "links" ? "Your website or social page. After paying, customers can be sent back here." : "Where your checkout runs. Customers are only sent back to these. Separate with commas."} value={form.domains} onChange={(v) => setForm({ ...form, domains: v })} placeholder={goal === "links" ? "instagram.com" : "shop.example.com, localhost"} />
        {goal !== "links" && <Field id="site-webhook" label="Webhook URL (optional)" hint="We POST a signed event here when a checkout is paid" value={form.webhook} onChange={(v) => setForm({ ...form, webhook: v })} placeholder="https://shop.example.com/webhooks/wondrpay" maxLength={128} type="url" />}
        {err && <div className="pt-err" role="alert">{err}</div>}
        <button className="btn btn-primary" type="submit" disabled={!!busy || active.length >= 5}>
          {busy === "create" ? <><span className="spinner" /> Creating…</> : goal === "links" ? "Add" : "Create API keys"}
        </button>
        <p className="pt-fine">You approve this with your wallet. Money only ever goes to your payout wallet.</p>
      </form> : <p className="pt-fine">Only the shop owner can add websites.</p>}
    </>
  )

  const pluginBody = (
    <div className="pt-int">
      <ol className="pt-howto">
        <li><b>WooCommerce:</b> <a className="pt-link" href="/downloads/wondrpay-for-woocommerce.zip">download the plugin</a>, then in WordPress go to Plugins → Add New → Upload Plugin and activate it.</li>
        <li><b>Paste your secret key</b> in WooCommerce → Settings → Payments → WondrPay (USDT), and turn it on.</li>
        <li><b>Shopify:</b> follow the <a className="pt-link" href="/developers#shopify">Shopify guide</a> (a payment link on the thank-you page, or a manual payment method).</li>
      </ol>
      <p className="pt-fine">Place one test order on your store: it should show as paid in WordPress and in your <a href="/merchant">Shop dashboard</a>.</p>
    </div>
  )

  const linksBody = merchant && shop ? <PaymentLinks merchant={shop} sites={sites ?? []} /> : <p className="pt-sub">Set up your shop first.</p>

  // ---------------------------------------------------------------- the timeline for this goal
  const st = (done: boolean, ready: boolean): StepState => (done ? "done" : ready ? "current" : "todo")
  const walletStep: TStep = { id: "wallet", title: "Payout wallet", state: st(!!wallet, true), summary: wallet ? <span className="mono">{wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}</span> : undefined, body: walletBody }
  const profileStep: TStep = { id: "profile", title: "Shop profile", state: st(!!merchant, !!wallet), summary: merchant ? <>{merchant.displayName} · {merchant.ensName}{merchant.verified ? " · verified" : ""}</> : undefined, body: profileBody }
  const keysStep: TStep = { id: "keys", title: goal === "links" ? "Where you sell" : "Website & API keys", state: st(active.length > 0, !!merchant),
    summary: active.length ? <>{active.length} live: {active.map((s) => s.name).join(", ")}</> : undefined, body: keysBody }
  const intStep: TStep = { id: "integrate", title: "Add checkout to your site", state: active.length ? "current" : "todo", body: <Quickstart secret={secret?.key} hasSite={active.length > 0} /> }
  const plugStep: TStep = { id: "plugin", title: "Install the plugin", state: active.length ? "current" : "todo", body: pluginBody }
  const linkStep: TStep = { id: "links", title: "Create a payment link", state: active.length ? "current" : "todo", body: linksBody }

  const steps: TStep[] = role === "developer"
    ? [{ ...keysStep, state: active.length ? "done" : "current" }, intStep, { ...linkStep, state: active.length ? "current" : "todo" }]
    : goal === "plugin" ? [walletStep, profileStep, keysStep, plugStep]
    : goal === "links" ? [walletStep, profileStep, keysStep, linkStep]
    : [walletStep, profileStep, keysStep, intStep]

  // everything not on this goal's path, tucked away until asked for
  const extras: { id: string; title: string; sub: string; body: React.ReactNode }[] = []
  if (merchant && shop) {
    if (goal === "plugin" || goal === "links") extras.push({ id: "x-int", title: "Code integration", sub: "API, webhooks and a test checkout", body: <Quickstart secret={secret?.key} hasSite={active.length > 0} /> })
    if (goal !== "links" && role === "owner") extras.push({ id: "x-links", title: "Payment links", sub: "A fixed price you can share as a link or QR", body: linksBody })
    if (role === "owner") extras.push({ id: "x-refunds", title: "Refunds by API", sub: "Let your server refund without opening the app", body: <RefundAllowance merchant={shop} usdtAddress={USDT_ADDRESS} chainId={WHITECHAIN_CHAIN_ID} /> })
    if (role === "owner") extras.push({ id: "x-team", title: "Team", sub: "Give a developer access to keys and links", body: <Team merchant={shop} /> })
  }
  const doneCount = steps.filter((x) => x.state === "done").length
  const isOpen = (x: TStep) => opened[x.id] ?? x.state === "current"

  return (
    <main className="pt" id="main">
      <header className="pt-bar">
        <a href="/" className="pt-logo" aria-label="WondrPay home">
          <span className="pt-mark" aria-hidden>W</span>
          <span className="pt-name">WondrPay<small>Business</small></span>
        </a>
        <div className="pt-bar-r">
          <span className="pt-chip lime" title="Test mode uses Whitechain Sepolia and test USDT">Test mode</span>
          {wallet && <span className="pt-chip mono" title={wallet.address}>{wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}</span>}
        </div>
      </header>

      <section className="pt-hero pt-hero-tight">
        <div>
          <h1>Accept USDT {goal === "links" ? "with a link" : goal === "plugin" ? "in your store" : "on your website"}</h1>
          <p>Paid straight into your own wallet on Whitechain. Your customers pay no gas.</p>
        </div>
      </section>

      {loadErr && <div className="pt-alert" role="alert">{loadErr} <button className="pt-link" onClick={() => shop && load(shop)}>Retry</button></div>}

      {(role === "developer" || memberships.length > 0) && wallet && (
        <div className="pt-role" role="status">
          {role === "developer" && merchant
            ? <><b>You're a developer at {merchant.displayName}</b>
                <span>You can make new secret keys, payment links and test webhooks. Payouts always go to the owner's wallet.</span></>
            : <b>You also help run {memberships.length} other shop{memberships.length > 1 ? "s" : ""}</b>}
          {(memberships.length > 1 || (memberships.length > 0 && ownShop) || role === "owner") && (
            <label className="pt-field">
              <span>Shop</span>
              <select value={shop ?? ""} onChange={(e) => { setSites(null); setMerchant(undefined); setShop(e.target.value) }}>
                <option value={wallet.address}>{ownShop ? "Your shop" : "Your wallet (no shop yet)"}</option>
                {memberships.map((m) => <option key={m.merchant} value={m.merchant}>{m.shopName ?? m.ensName ?? m.merchant} (developer)</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {role === "owner" && !goal ? (
        <section className="pt-card" aria-labelledby="h-goal">
          <h2 id="h-goal">How will customers pay you?</h2>
          <p className="pt-sub">We'll show only the steps you need. You can change this later.</p>
          <div className="pt-goals">
            {GOALS.map((g) => (
              <button key={g.id} className="pt-goal" onClick={() => setGoal(g.id)}>
                <b>{g.title}</b><span>{g.sub}</span><span className="pt-goal-go" aria-hidden>{Icon.chev(18)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="pt-card" aria-labelledby="h-setup">
          <div className="pt-tl-head">
            <h2 id="h-setup">{doneCount === steps.length ? "You're set up" : "Your setup"} <span className="pt-muted">{doneCount} of {steps.length} done</span></h2>
            {role === "owner" && goal && <button className="pt-link" onClick={() => setGoal(null)}>{GOALS.find((g) => g.id === goal)?.title} · Change</button>}
          </div>
          <ol className="pt-tl">
            {steps.map((x, i) => (
              <li key={x.id} className={`pt-tl-i ${x.state}`} aria-current={x.state === "current" ? "step" : undefined}>
                <span className="pt-tl-dot" aria-hidden>{x.state === "done" ? Icon.check(14) : i + 1}</span>
                <div className="pt-tl-c">
                  <button className="pt-tl-h" aria-expanded={isOpen(x)} onClick={() => setOpened((o) => ({ ...o, [x.id]: !isOpen(x) }))} disabled={x.state === "todo"}>
                    <b>{x.title}</b>
                    <span className="pt-tl-s">{x.state === "done" ? x.summary ?? "Done" : x.state === "todo" ? "After the step above" : "Next"}</span>
                  </button>
                  {isOpen(x) && x.state !== "todo" && <div className="pt-tl-b">{x.body}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {extras.length > 0 && (role === "developer" || goal) && (
        <section className="pt-more" aria-label="More tools">
          <h2 className="pt-more-h">More tools</h2>
          {extras.map((x) => (
            <details key={x.id} className="pt-card pt-x">
              <summary><b>{x.title}</b><span className="pt-muted">{x.sub}</span></summary>
              <div className="pt-x-b">{x.body}</div>
            </details>
          ))}
        </section>
      )}

      <footer className="pt-foot">
        <a href="/developers">API docs</a><span aria-hidden>·</span><a href="/merchant">Shop dashboard</a><span aria-hidden>·</span><span>Test mode runs on Whitechain Sepolia with test USDT.</span>
      </footer>

      {pending && (
        <UnlockSheet
          title={pending.kind === "create" ? (goal === "links" ? "Approve" : "Approve API keys") : pending.kind === "rotate" ? "Approve a new secret key" : "Approve switching off"}
          subtitle={pending.kind === "create" ? `for ${pending.domains.join(", ")}` : pending.site.name}
          onUnlocked={signAndSend}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  )
}

function Quickstart({ secret, hasSite }: { secret?: string; hasSite: boolean }) {
  const key = secret ?? "wp_sk_test_…"
  const [test, setTest] = useState<{ busy: boolean; url?: string; err?: string }>({ busy: false })
  const origin = typeof location === "undefined" ? "https://wondrpay.vercel.app" : location.origin
  const curl = `curl ${origin}/api/v1/checkout/sessions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order_1042" \\
  -d '{"amount":"12.40","reference":"order_1042","description":"2 items",
       "successUrl":"https://shop.example.com/thank-you","cancelUrl":"https://shop.example.com/cart"}'`
  const node = `// server.js: create a session, send the customer to session.url
const r = await fetch("${origin}/api/v1/checkout/sessions", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.WONDRPAY_SECRET_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ amount: cart.total, reference: cart.id, successUrl: "https://shop.example.com/thank-you" }),
})
const session = await r.json()   // { id, url, status: "open", expiresAt, … }
res.redirect(303, session.url)   // WondrPay's hosted checkout`

  const runTest = async () => {
    if (!secret) return
    setTest({ busy: true })
    try {
      const r = await fetch("/api/v1/checkout/sessions", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ amount: "0.10", reference: `portal-test-${Date.now()}`, description: "Test checkout from the portal" }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message ?? "Couldn't create a test checkout")
      setTest({ busy: false, url: d.url })
    } catch (e) { setTest({ busy: false, err: (e as Error).message }) }
  }

  return (
    <div className="pt-int">
      <ol className="pt-howto">
        <li><b>Your server creates a checkout session</b> with your secret key: amount, your order id, where to send the customer after.</li>
        <li><b>Send the customer to <code>session.url</code></b>, WondrPay's hosted checkout. They pay with the WondrPay app, gasless.</li>
        <li><b>Get told it's paid</b>: a signed <code>checkout.session.completed</code> webhook, and they land back on your <code>successUrl</code>.</li>
      </ol>
      <CodeBlock label="Create a session (curl)" code={curl} />
      <CodeBlock label="Node.js / Next.js" code={node} />
      <div className="pt-test">
        <div>
          <b>Try it now</b>
          <span className="pt-sub">{secret ? "Creates a real 0.10 USDT test checkout with your new key." : hasSite ? "Make a new secret key above to run a test from here (keys are only shown once)." : "Create API keys above first."}</span>
        </div>
        {test.url
          ? <a className="btn btn-primary btn-sm" href={test.url} target="_blank" rel="noreferrer">Open test checkout ↗</a>
          : <button className="btn btn-primary btn-sm" disabled={!secret || test.busy} onClick={runTest}>{test.busy ? <span className="spinner" /> : null} Create test checkout</button>}
      </div>
      {test.err && <div className="pt-err" role="alert">{test.err}</div>}
      <a className="pt-link" href="/developers#api">Full API reference →</a>
    </div>
  )
}
