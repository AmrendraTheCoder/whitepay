"use client"
import { BottomNav, ScanFab, Icon, useWalletData } from "../ui"
import { usdt } from "@/lib/format"
import { useHideBalance } from "@/lib/prefs"
import { USDT_ADDRESS, EXPLORER_URL } from "@whitepay/shared"

/** GPay "Money": accounts (USDT on Whitechain instead of a bank), with a link to history. */
export default function Money() {
  const { wallet, bal, rows } = useWalletData()
  const { hidden, toggle } = useHideBalance()
  const show = (v: bigint | string) => (hidden ? "••••" : usdt(v))
  const me = wallet?.address.toLowerCase() ?? ""
  const spent = (rows ?? []).filter((r) => r.merchant.toLowerCase() !== me).reduce((a, r) => a + BigInt(r.amount), 0n)
  const received = (rows ?? []).filter((r) => r.merchant.toLowerCase() === me).reduce((a, r) => a + BigInt(r.amount), 0n)

  return (
    <main className="shell with-nav">
      <div className="profile-hero" style={{ paddingTop: 56, paddingBottom: 30 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <div className="nm">Money</div>
          <button className="eye" onClick={toggle} aria-label={hidden ? "Show balances" : "Hide balances"}>{hidden ? Icon.eyeOff() : Icon.eye()}</button>
        </div>
        <div className="sub" style={{ color: "rgba(255,255,255,.8)", marginTop: 6 }}>Stablecoin balance on Whitechain</div>
      </div>

      <div className="menu-list">
        <a className="menu-row" href={wallet ? `${EXPLORER_URL}/address/${wallet.address}` : "#"} target="_blank" rel="noreferrer">
          <span className="pic" style={{ width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center", background: "#fff" }}>
            <img src="/icon.svg" alt="" style={{ width: 34, height: 34, borderRadius: 9 }} />
          </span>
          <div>
            <div style={{ fontWeight: 700 }}>Tether USD · Whitechain</div>
            <div className="s">{bal ? `${show(bal.usdt)} USDT` : <span className="skel" style={{ width: 90, height: 14 }} />}</div>
          </div>
          <span className="chev" style={{ color: "var(--brand-soft)", fontWeight: 700, fontSize: 15 }}>Explorer</span>
        </a>
        <div className="menu-row">
          <span className="ic" style={{ width: 52, display: "grid", placeItems: "center" }}>{Icon.bolt(26)}</span>
          <div>
            <div style={{ fontWeight: 700 }}>Network fees</div>
            <div className="s">You pay 0 gas. WhitePay's relayer covers it.</div>
          </div>
        </div>
      </div>

      <div className="actions">
        <div className="card"><div className="sub">Spent</div><div style={{ fontSize: 24, fontWeight: 800 }}>{rows === null ? <span className="skel" style={{ width: 80, height: 26 }} /> : show(spent)}</div></div>
        <div className="card"><div className="sub">Received</div><div style={{ fontSize: 24, fontWeight: 800, color: "var(--ok)" }}>{rows === null ? <span className="skel" style={{ width: 80, height: 26 }} /> : show(received)}</div></div>
      </div>

      <div className="section-title">Manage</div>
      <div className="menu-list">
        <a className="menu-row" href="/transactions"><span className="ic">{Icon.history()}</span>See transaction history<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/receive"><span className="ic">{Icon.receive(24)}</span>Add money: share your QR<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href={`${EXPLORER_URL}/address/${USDT_ADDRESS}`} target="_blank" rel="noreferrer"><span className="ic">{Icon.shield()}</span>About USDT on Whitechain<span className="chev">{Icon.chev()}</span></a>
      </div>

      <ScanFab />
      <BottomNav />
    </main>
  )
}
