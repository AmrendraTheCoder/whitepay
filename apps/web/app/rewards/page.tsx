"use client"
// Rewards: scratch cards earned by paying listed shops, WBT cashback claimed with World ID, every shop's
// current offer, and the public books that show where reward money comes from.
import { useCallback, useEffect, useState } from "react"
import { ECON, claimSignal, economicsPer100, type OfferView, type RewardCard, type RewardsLedger } from "@whitepay/shared/rewards"
import { getWallet } from "@/lib/wallet"
import { Icon, Identicon } from "../ui"
import { ClaimVerify, rewardMode } from "./claim-verify"
import { Chest, Gift } from "./art"
import { PrizeFace, usd } from "./prize"
import { ScratchSheet, prettyShop } from "./scratch"
import "./rewards.css"

type Data = { cards: RewardCard[]; offers: OfferView[]; ledger: RewardsLedger | null; totalCashback: string; pendingMicro: string }

export default function RewardsPage() {
  const [owner, setOwner] = useState<string | null | undefined>(undefined)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState("")
  const [open, setOpen] = useState<RewardCard | null>(null)
  const [toast, setToast] = useState("")
  const [claimErr, setClaimErr] = useState("")
  const [claimed, setClaimed] = useState<{ wbt: string; explorer: string } | null>(null)
  const [mode, setMode] = useState<"enroll" | "session" | null>(null)
  const [stage, setStage] = useState<"idle" | "world" | "paying">("idle")

  const say = (t: string, ms = 3200) => { setToast(t); setTimeout(() => setToast(""), ms) }
  const cacheKey = (a: string) => `whitepay.rewards.${a.toLowerCase()}`
  const load = useCallback(async (address: string) => {
    try {
      const r = await fetch(`/api/rewards?owner=${address}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Could not load rewards")
      setData(d); setErr("")
      try { localStorage.setItem(cacheKey(address), JSON.stringify(d)) } catch {}
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    const w = getWallet()
    setOwner(w?.address ?? null)
    if (!w) return
    try { const c = localStorage.getItem(cacheKey(w.address)); if (c) setData(JSON.parse(c)) } catch {}
    void load(w.address)
    void rewardMode(w.address).then(setMode)
  }, [load])

  const onRevealed = (c: RewardCard) => {
    setData((d) => {
      if (!d) return d
      const won = c.status === "won" ? BigInt(c.amount ?? 0) : 0n
      return { ...d, cards: d.cards.map((x) => (x.key === c.key ? c : x)),
        totalCashback: (BigInt(d.totalCashback) + won).toString(), pendingMicro: (BigInt(d.pendingMicro) + won).toString() }
    })
  }

  const cards = data?.cards ?? []
  const fresh = cards.filter((c) => c.status === "new").length
  const toClaim = cards.filter((c) => c.status === "won").slice(0, 20)
  const pending = toClaim.reduce((s, c) => s + BigInt(c.amount ?? 0), 0n)
  const price = data?.ledger?.wbtUsd ?? null
  // the model with today's measured gas (falls back to the ECON estimate until the ledger loads)
  const gasNow = data?.ledger?.gasNowMicro ? BigInt(data.ledger.gasNowMicro) : ECON.gasFallbackMicro
  const E = economicsPer100(gasNow)
  const wbtOf = (micro: bigint) => (price ? (Number(micro) / 1e6 / price).toPrecision(3) : null)
  const signal = owner && toClaim.length ? claimSignal(owner, toClaim.map((c) => c.key)) : ""
  // where this person is in the earn -> scratch -> claim -> receive flow
  const step = claimed ? 4 : toClaim.length ? 3 : fresh ? 2 : 1
  const STEPS = [
    { t: "Pay a shop", d: `Pay any listed shop $${E.breakEven.toFixed(2)} or more and a scratch card lands here. Your first ${ECON.welcomeWins} cards come with any shop payment.` },
    { t: "Scratch the card", d: `Tap a new card and scratch it. About 1 in ${E.oneIn} wins 1–5% cashback; your first ${ECON.welcomeWins} always win.` },
    { t: "Claim with World ID", d: mode === "session" ? "World App asks you to confirm it's you: a fresh check on every claim, a few seconds." : "The first time, World App sets up WondrPay rewards for you (once per person). After that it's a quick check on each claim." },
    { t: "Get WBT", d: "Your cashback arrives as WBT in this wallet on Whitechain, in one transfer." },
  ]

  return (
    <main className="rw-page">
      <header className="rw-head">
        <div className="rw-bar">
          <a href="/app" className="rw-back" aria-label="Back">{Icon.back(22)}</a>
          <span className="rw-title">Rewards</span>
        </div>
        <div className="rw-hero">
          <div>
            <div className="rw-total">{data ? usd(data.totalCashback) : <span className="skel" style={{ width: 90, height: 34 }} />}</div>
            <div className="rw-total-l">Total cashback won · paid in WBT</div>
            {fresh > 0 && <div className="rw-fresh">{fresh} new card{fresh > 1 ? "s" : ""} to scratch</div>}
          </div>
          <Chest />
        </div>
      </header>

      <div className="rw-body">
        {owner === null && (
          <div className="rw-empty">
            <Gift size={52} />
            <p>Create a wallet to start earning scratch cards.</p>
            <a className="btn btn-primary" href="/app">Get started</a>
          </div>
        )}

        {owner && (
          <>
            {(toClaim.length > 0 || claimed) && (
              <section className="rw-claim" id="claim" aria-live="polite">
                {claimed ? (
                  <>
                    <div className="rw-claim-amt">+{claimed.wbt}<small>WBT</small></div>
                    <p>Sent to your wallet on Whitechain. <a href={claimed.explorer} target="_blank" rel="noreferrer">View transaction</a></p>
                  </>
                ) : (
                  <>
                    <div className="rw-claim-amt">{usd(pending)}<small>{wbtOf(pending) ? `≈ ${wbtOf(pending)} WBT` : "in WBT"}</small></div>
                    <p>Cashback from {toClaim.length} card{toClaim.length > 1 ? "s" : ""}, ready to claim.</p>
                    <ol className="rw-claim-steps">
                      <li className={stage === "world" ? "on" : stage === "paying" ? "done" : ""}>
                        <b>{mode === "session" ? "Confirm it's you in World App" : "Set up rewards in World App"}</b>
                        <span>{mode === "session"
                          ? "Scan the code with World App (or tap Open World App) and approve. It's a new check every claim, so no one else can claim for you."
                          : "One time per person: scan the code with World App and approve \u201cSet up WondrPay rewards\u201d. Every later claim is a quick fresh check."}</span>
                      </li>
                      <li className={stage === "paying" ? "on" : ""}>
                        <b>WBT is sent to this wallet</b>
                        <span>WondrPay checks the per-person limits ({ECON.humanClaimsPerDay} claims a day, ${Number(ECON.humanMonthlyCapMicro) / 1e6} a month) and pays on Whitechain.</span>
                      </li>
                    </ol>
                    <ClaimVerify
                      owner={owner}
                      signal={signal}
                      label={stage === "paying" ? "Sending WBT…" : mode === "session" ? "Claim with World ID" : "Set up & claim with World ID"}
                      claim={async (proof) => {
                        const r = await fetch("/api/rewards/claim", { method: "POST", headers: { "content-type": "application/json" },
                          body: JSON.stringify({ owner, keys: toClaim.map((c) => c.key), proof }) })
                        const d = await r.json()
                        if (!r.ok) throw new Error(d.error || "Claim failed")
                        return d
                      }}
                      onStage={setStage}
                      onClaimed={(d) => {
                        setClaimErr(""); setMode("session")
                        const wbt = (Number(BigInt(d.wbtWei)) / 1e18).toPrecision(3)
                        setClaimed({ wbt, explorer: d.explorer })
                        if (d.expired?.length) say(`${d.expired.length} card${d.expired.length > 1 ? "s" : ""} over the per-person limit`, 5000)
                        else say(`${wbt} WBT cashback received`)
                        void load(owner)
                      }}
                      onError={(reason) => setClaimErr(reason)}
                    />
                    {claimErr && <div className="rw-err">{claimErr}</div>}
                  </>
                )}
              </section>
            )}

            <section className="rw-guide" aria-label="How to get rewards">
              <h2 className="rw-h">How to get rewards</h2>
              <ol className="rw-steps">
                {STEPS.map((x, i) => (
                  <li key={x.t} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""}>
                    <span className="rw-step-n" aria-hidden>{i + 1 < step ? "✓" : i + 1}</span>
                    <div><b>{x.t}</b><span>{x.d}</span></div>
                  </li>
                ))}
              </ol>
            </section>

            <h2 className="rw-h">Your rewards</h2>
            {err && !data && <div className="notice">{err} <button className="chip" onClick={() => void load(owner)}>Retry</button></div>}
            <div className="rw-grid">
              {!data && Array.from({ length: 4 }, (_, i) => <div key={i} className="rw-tile skel" />)}
              {cards.map((c) => (
                <button key={c.key} className={`rw-tile ${c.status === "new" ? "new" : "done"}`} onClick={() => setOpen(c)}
                  aria-label={c.status === "new" ? `Unscratched card from ${prettyShop(c.merchantName)}` : `Scratched card from ${prettyShop(c.merchantName)}`}>
                  {c.status === "new" ? (
                    <>
                      <span className="rw-new">New</span>
                      <Gift />
                      <span className="rw-tile-from">{prettyShop(c.merchantName)}</span>
                      <span className="rw-exp">{daysLeft(c.expiresAt)}</span>
                    </>
                  ) : (
                    <>
                      <PrizeFace card={c} />
                      <span className="rw-tile-from">{prettyShop(c.merchantName)}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
            {data && cards.length === 0 && (
              <div className="rw-empty">
                <Gift size={52} />
                <p><b>No scratch cards yet</b><br />Pay any listed shop 0.10 USDT or more with WondrPay and a card lands here.</p>
                <a className="btn btn-primary" href="/scan">{Icon.scan(22)} Scan a shop QR</a>
              </div>
            )}

            <h2 className="rw-h" id="offers">Offers from shops</h2>
            {data && data.offers.length === 0 && <p className="sub">No shop offers right now. Shops add them from Shop › Offers.</p>}
            <div className="rw-offers">
              {data?.offers.map((o) => (
                <div key={o.key} className="rw-offer-row">
                  <span className="rw-ident"><Identicon seed={o.merchant} name={o.merchantName} size={44} /></span>
                  <div className="grow">
                    <div className="rw-o-name">{o.displayName || prettyShop(o.merchantName)}</div>
                    <div className="rw-o-text">{o.text}</div>
                    <button className="rw-o-code" onClick={() => { navigator.clipboard?.writeText(o.code); say(`Code ${o.code} copied`, 2000) }}>
                      {o.code} <span aria-hidden>⧉</span>
                    </button>
                  </div>
                  <a className="rw-pay" href={`/send?to=${o.merchant}${o.merchantName ? `&name=${o.merchantName}` : ""}`}>Pay</a>
                </div>
              ))}
            </div>

            <h2 className="rw-h" id="how">Where rewards come from</h2>
            <section className="rw-econ">
              <p>Shops pay WondrPay a {ECON.feeBps / 100}% fee (at least ${(Number(ECON.feeFloorMicro) / 1e6).toFixed(2)}). WondrPay first pays the
                network gas for your payment out of it; half of what's left funds your rewards, the other half keeps WondrPay running.
                Person-to-person transfers carry no fee, so they earn no cards.</p>
              <div className="rw-split" aria-label={`Of a $${E.fee.toFixed(2)} fee on $100: $${E.gas.toFixed(3)} gas, $${E.expectedRewards.toFixed(2)} rewards, $${E.margin.toFixed(2)} WondrPay`}>
                <span className="gas" style={{ flex: Math.max(E.gas, 0.06) * 100 }}>${E.gas.toFixed(3)} gas</span>
                <span className="rew" style={{ flex: E.expectedRewards * 100 }}>${E.expectedRewards.toFixed(2)} rewards</span>
                <span className="mar" style={{ flex: E.margin * 100 }}>${E.margin.toFixed(2)} WondrPay</span>
              </div>
              <p>On a ${E.volume} shop payment: ${E.fee.toFixed(2)} fee, ${E.gas.toFixed(3)} gas, ${E.expectedRewards.toFixed(2)} back as rewards on average.</p>
              <ul className="rw-rules">
                <li><b>Cards come with payments of ${E.breakEven.toFixed(2)} or more</b>, where the fee covers the gas (it moves with the gas price). Your first {ECON.welcomeWins} cards come with any shop payment.</li>
                <li><b>Up to 1 card in {E.oneIn} wins cashback</b> of 1–5% (average {(E.expectedWinRate * 100).toFixed(2)}%), up to ${Number(ECON.winCapMicro) / 1e6} a card. Smaller payments win less often, since more of their fee went to gas.</li>
                <li><b>Your first {ECON.welcomeWins} cards always win</b> (up to ${(Number(ECON.welcomeCapMicro) / 1e6).toFixed(2)} each), from a fixed ${Number(ECON.launchBudgetMicro) / 1e6} launch budget.</li>
                <li><b>One person, one set of limits:</b> {ECON.humanClaimsPerDay} claims a day and ${Number(ECON.humanMonthlyCapMicro) / 1e6} a month, counted by World ID across all your wallets.</li>
                <li><b>Paying yourself doesn't pay:</b> rewards average under half the fee, so self-payments lose ${E.washTradeLossPer100.toFixed(2)} per $100.</li>
                <li><b>Paying people:</b> your first {ECON.p2pFreePerMonth} transfers a month are free, then ${(Number(ECON.p2pFeeMicro) / 1e6).toFixed(2)} each (not charged on testnet).</li>
              </ul>
              {data?.ledger && (
                <dl className="rw-kv" aria-label="Reward pool, live">
                  <dt>Shop volume that earned cards</dt><dd>{usd(data.ledger.volumeMicro)}</dd>
                  <dt>Fees on it ({ECON.feeBps / 100}%, min ${(Number(ECON.feeFloorMicro) / 1e6).toFixed(2)})</dt><dd>{usd(data.ledger.feesMicro)}</dd>
                  <dt>Gas WondrPay paid on it</dt><dd>{usd(data.ledger.gasMicro ?? "0")}</dd>
                  <dt>Reward share of fee − gas + launch budget</dt><dd>{usd(BigInt(data.ledger.accruedMicro) + BigInt(data.ledger.launchBudgetMicro))}</dd>
                  <dt>Paid to {data.ledger.humans} {data.ledger.humans === 1 ? "person" : "people"} ({data.ledger.claims} {data.ledger.claims === 1 ? "claim" : "claims"})</dt><dd>{usd(data.ledger.paidMicro)}</dd>
                  <dt>Left in the pool</dt><dd>{usd(data.ledger.availableMicro)}</dd>
                  <dt>WBT price</dt><dd>{price ? `$${price.toFixed(2)}` : "–"}</dd>
                  <dt>Gas per payment now</dt><dd>{usd(gasNow)}</dd>
                </dl>
              )}
            </section>
          </>
        )}
      </div>

      {toast && <div className="rw-toast" role="status">{toast}</div>}
      {open && owner && (
        <ScratchSheet card={open} owner={owner} onClose={() => setOpen(null)} onRevealed={(c) => { onRevealed(c); setOpen(c) }} />
      )}
    </main>
  )
}

function daysLeft(expiresAt?: number) {
  if (!expiresAt) return ""
  const d = Math.ceil((expiresAt - Date.now() / 1000) / 86400)
  return d <= 1 ? "Expires today" : `Expires in ${d} days`
}
