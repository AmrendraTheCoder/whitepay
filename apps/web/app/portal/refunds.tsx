"use client"
// Refund allowance (portal, owner): one signature from the payout wallet lets WondrPay pay refunds by API, up to a cap.
import { useCallback, useEffect, useState } from "react"
import { usdt } from "@/lib/format"
import { CodeBlock, Field, useWalletAction } from "./kit"

type State = { merchant: string; payout: string; agent: string; allowance: string; nonce: string; payoutBalance: string }

const PERMIT_TYPES = { Permit: [
  { name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
] } as const

export function RefundAllowance({ merchant, usdtAddress, chainId }: { merchant: string; usdtAddress: string; chainId: number }) {
  const [st, setSt] = useState<State | null>(null)
  const [cap, setCap] = useState("")
  const [err, setErr] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const { ask, sheet } = useWalletAction()

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/business/refund-allowance?merchant=${merchant}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error?.message)
      setSt(d)
    } catch (e) { setErr((e as Error).message || "Couldn't read your refund allowance") }
  }, [merchant])
  useEffect(() => { void load() }, [load])

  const approve = (micro: bigint) => {
    if (!st) return
    setErr(""); setNote("")
    ask(micro ? "Approve refund allowance" : "Switch off refunds by API", micro ? `up to ${usdt(micro)} USDT` : "allowance 0", async (acct) => {
      if (acct.address.toLowerCase() !== st.payout.toLowerCase()) { setErr("Sign with your payout wallet: it's the one the refunds are paid from."); return }
      setBusy(true)
      try {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60)
        const signature = await acct.signTypedData({
          domain: { name: "Tether USD", version: "1", chainId, verifyingContract: usdtAddress as `0x${string}` },
          types: PERMIT_TYPES, primaryType: "Permit",
          message: { owner: st.payout as `0x${string}`, spender: st.agent as `0x${string}`, value: micro, nonce: BigInt(st.nonce), deadline },
        })
        const r = await fetch("/api/business/refund-allowance", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ merchant, value: micro.toString(), deadline: deadline.toString(), signature }) })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error?.message ?? "Couldn't set the allowance")
        setSt(d); setCap("")
        setNote(micro ? `Done: refunds by API can now use up to ${usdt(micro)} USDT.` : "Refunds by API are off.")
      } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
    })
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const s = cap.trim()
    if (!/^\d{1,5}(\.\d{1,6})?$/.test(s) || Number(s) <= 0 || Number(s) > 10000) return setErr("Enter a cap between 0.01 and 10,000 USDT, like 50.")
    const [i, f = ""] = s.split(".")
    approve(BigInt(i) * 1_000_000n + BigInt(f.padEnd(6, "0")))
  }

  const left = st ? BigInt(st.allowance) : 0n
  const origin = typeof location === "undefined" ? "https://wondrpay.vercel.app" : location.origin
  return (
    <div className="pt-int">
      <p className="pt-sub">Let your server refund customers with your API key, without approving each refund in your wallet. You approve a cap once; refunds only ever go back to the customer who paid, and never more than they paid.</p>
      {!st ? (err ? null : <div className="skel" style={{ height: 60 }} />) : (
        <dl className="pt-kv">
          <dt>Allowance left</dt><dd>{left ? `${usdt(left)} USDT` : "Off"}</dd>
          <dt>Payout wallet balance</dt><dd>{usdt(st.payoutBalance)} USDT</dd>
          <dt>Paid from</dt><dd className="mono">{st.payout.slice(0, 6)}…{st.payout.slice(-4)}</dd>
        </dl>
      )}
      <form className="pt-form" onSubmit={submit} noValidate>
        <h3>{left ? "Change the cap" : "Turn on refunds by API"}</h3>
        <Field id="ra-cap" label="Cap (USDT)" hint="Total refunds WondrPay may pay from your payout wallet until you raise it again" value={cap} onChange={(v) => setCap(v.replace(/[^\d.]/g, ""))} placeholder="50" maxLength={12} />
        {err && <div className="pt-err" role="alert">{err}</div>}
        <div role="status" aria-live="polite" className="pt-fine">{note}</div>
        <div className="pt-actions">
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !st}>{busy ? <span className="spinner" /> : null} Approve cap</button>
          {left > 0n && <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => approve(0n)}>Switch off</button>}
        </div>
        <p className="pt-fine">You'll sign one USDT approval (EIP-2612) with your payout wallet. WondrPay submits it and pays the gas.</p>
      </form>
      <CodeBlock label="Refund from your server" code={`curl ${origin}/api/v1/refunds \\
  -H "Authorization: Bearer $WONDRPAY_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: refund_order_1042" \\
  -d '{"paymentId":"<session id>","amount":"2.50","reason":"damaged item"}'`} />
      {sheet}
    </div>
  )
}
