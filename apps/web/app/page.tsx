"use client"
import { useMemo } from "react"
import { Onboard } from "./onboard"
import { BottomNav, Icon, avatarColor, initial, prettyName, useWalletData, AccountBadge } from "./ui"
import { usdt } from "@/lib/format"
import { useHideBalance } from "@/lib/prefs"

export default function Home() {
  const data = useWalletData()
  if (data.wallet === undefined) return <main className="shell" />
  if (!data.wallet) return <Onboard onDone={() => location.reload()} />
  return <WalletHome {...data} wallet={data.wallet} />
}

// ------------------------------------------------------------ home (GPay)
function WalletHome({ wallet, bal, rows, name, account, displayName }: ReturnType<typeof useWalletData> & { wallet: NonNullable<ReturnType<typeof useWalletData>["wallet"]> }) {
  const { hidden, toggle } = useHideBalance()
  const me = wallet.address.toLowerCase()
  const people = useMemo(() => {
    const seen = new Map<string, { address: string; name?: string }>()
    for (const r of rows ?? []) {
      const incoming = r.merchant.toLowerCase() === me
      const other = incoming ? r.payer : r.merchant
      if (!seen.has(other.toLowerCase())) seen.set(other.toLowerCase(), { address: other, name: incoming ? undefined : r.merchantName })
    }
    return [...seen.values()].slice(0, 7)
  }, [rows, me])

  return (
    <main className="shell with-nav">
      <div className="searchbar">
        <a className="search" href="/send">{Icon.search()} Pay friends and merchants</a>
        {name === undefined
          ? <span className="avatar-btn skel circle" aria-label="Loading profile" />
          : <a className="avatar-btn" href="/you" aria-label="Your profile">{name ? initial(name) : Icon.user(22)}</a>}
      </div>

      <div className="hero">
        <div className="hero-top">
          <div className="label" style={{ display: "flex", gap: 8, alignItems: "center" }}>USDT balance <AccountBadge account={account} /></div>
          <button className="eye" onClick={toggle} aria-label={hidden ? "Show balance" : "Hide balance"}>{hidden ? Icon.eyeOff() : Icon.eye()}</button>
        </div>
        <div className="big">
          {bal === null ? <span className="skel" style={{ width: 150, height: 40 }} /> : hidden ? "••••" : usdt(bal.usdt)}
          <small>USDT</small>
        </div>
        <div className="meta">
          <span className="pill-lime">0 gas</span>
          {name === undefined ? <span className="skel" style={{ width: 170, height: 16 }} /> : <span>{account === "business" && displayName ? `${displayName} · ${name}` : name ?? "No WhitePay name yet"}</span>}
        </div>
        <a className="cta" href={account === "business" ? "/merchant" : name ? "/money" : "/you#claim"}>
          {name === undefined ? <span className="skel" style={{ width: 120, height: 18 }} /> : account === "business" ? "Open shop terminal" : name ? "View money" : "Claim your name"} <span className="circle">{Icon.arrow()}</span>
        </a>
      </div>

      <div className="tiles">
        <a className="tile" href="/scan"><div className="sq">{Icon.scan()}</div><span>Scan any QR code</span></a>
        <a className="tile" href="/send"><div className="sq">{Icon.pay()}</div><span>Pay anyone</span></a>
        <a className="tile" href="/receive"><div className="sq">{Icon.receive()}</div><span>Receive money</span></a>
        <a className="tile" href="/merchant"><div className="sq">{Icon.shop()}</div><span>Shop QR</span></a>
      </div>

      <div className="chips">
        <a className="chip-card" href="/money"><span className="ic">{Icon.balance()}</span><div><div className="t1">USDT balance</div><div className="t2">Check</div></div></a>
        <a className="chip-card" href="/transactions"><span className="ic">{Icon.history()}</span><div><div className="t1">Transactions</div><div className="t2">See all</div></div></a>
        <a className="chip-card" href="/you"><span className="ic">{Icon.id()}</span><div><div className="t1">WhitePay ID</div><div className="t2 link">{name ? "View" : "Claim"}</div></div></a>
      </div>

      <div className="section-title">Pay again</div>
      <div className="people">
        {rows === null && Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="person"><span className="pic skel circle" /><span className="skel" style={{ width: 56, height: 14 }} /></div>
        ))}
        {rows?.length === 0 && <div className="empty" style={{ gridColumn: "1 / -1" }}>People and shops you pay show up here.</div>}
        {people.map((p) => (
          <a key={p.address} className="person" href={`/send?to=${p.address}${p.name ? `&name=${p.name}` : ""}`}>
            <span className="pic" style={{ background: avatarColor(p.name ?? p.address) }}>{initial(p.name ?? p.address.slice(2))}</span>
            <span className="nm">{prettyName(p.name, p.address)}</span>
          </a>
        ))}
        {!!rows?.length && (
          <a className="person" href="/transactions">
            <span className="pic more">{Icon.chev(26)}</span>
            <span className="nm">More</span>
          </a>
        )}
      </div>

      <div className="section-title">Manage your money</div>
      <div className="menu-list">
        <a className="menu-row" href="/transactions"><span className="ic">{Icon.history()}</span>See transaction history<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/money"><span className="ic">{Icon.balance()}</span>Check USDT balance<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/money#add"><span className="ic">{Icon.bolt(24)}</span>Add money<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/receive"><span className="ic">{Icon.receive(24)}</span>Your QR code<span className="chev">{Icon.chev()}</span></a>
      </div>

      <BottomNav />
    </main>
  )
}

