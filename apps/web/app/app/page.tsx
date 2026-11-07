"use client"
import { useMemo } from "react"
import { DueBanner } from "../due-banner"
import { AvatarRings } from "../avatar-rings"
import { Onboard } from "../onboard"
import { Icon, avatarColor, initial, prettyName, useWalletData, AccountBadge, Toast, useCountUp, LogoLoader, Identicon } from "../ui"
import { usdt } from "@/lib/format"
import { useHideBalance } from "@/lib/prefs"
import { RewardsEntry } from "../rewards/entry"
import { WhitechainStrip } from "../whitechain-strip"

export default function Home() {
  const data = useWalletData()
  if (data.wallet === undefined) return <main className="shell"><LogoLoader /></main>
  if (!data.wallet) return <Onboard onDone={() => location.reload()} />
  // connected MetaMask but left before setting the WondrPay PIN: finish that first (nothing works without it)
  if (data.wallet.kind !== "device" && !data.wallet.hasPin) return <Onboard resumeExternal={data.wallet.address} onDone={() => location.reload()} />
  return <WalletHome {...data} wallet={data.wallet} />
}

// ------------------------------------------------------------ home (GPay)
function WalletHome({ wallet, bal, rows, name, account, displayName, toast }: ReturnType<typeof useWalletData> & { wallet: NonNullable<ReturnType<typeof useWalletData>["wallet"]> }) {
  const { hidden, toggle } = useHideBalance()
  const shown = useCountUp(bal ? Number(bal.usdt) / 1e6 : null)
  const people = useMemo(() => {
    const seen = new Map<string, { address: string; name?: string }>()
    for (const r of rows ?? []) {
      if (r.kind === "whitepay" || r.kind === "refund") continue // router hop, not a person
      const k = r.counterparty.toLowerCase()
      if (!seen.has(k)) seen.set(k, { address: r.counterparty, name: r.counterpartyName })
    }
    return [...seen.values()].slice(0, 7)
  }, [rows])

  return (
    <main className="shell with-nav">
      <Toast text={toast} />
      <div className="searchbar">
        <a className="search" href="/send">{Icon.search()} Pay friends and merchants</a>
        {name === undefined
          ? <span className="avatar-btn skel circle" aria-label="Loading profile" />
          : <AvatarRings address={wallet.address}><a className="avatar-btn" href="/you" aria-label="Your profile">{name ? initial(name) : Icon.user(22)}</a></AvatarRings>}
      </div>

      <WhitechainStrip />

      <div className="hero">
        <div className="hero-top">
          <div className="label" style={{ display: "flex", gap: 8, alignItems: "center" }}>USDT balance <AccountBadge account={account} /></div>
          <button className="eye" onClick={toggle} aria-label={hidden ? "Show balance" : "Hide balance"}>{hidden ? Icon.eyeOff() : Icon.eye()}</button>
        </div>
        <div className="big">
          {bal === null ? <span className="skel" style={{ width: 150, height: 40 }} /> : hidden ? "••••" : (shown ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <small>USDT</small>
        </div>
        <div className="meta">
          <span className="pill-lime">0 gas</span>
          {name === undefined ? <span className="skel" style={{ width: 170, height: 16 }} /> : <span>{account === "business" && displayName ? `${displayName} · ${name}` : name ?? "No WondrPay name yet"}</span>}
        </div>
        <a className="cta" href={account === "business" ? "/merchant" : "/money"}>
          {name === undefined ? <span className="skel" style={{ width: 120, height: 18 }} /> : account === "business" ? "Open shop terminal" : "View money"} <span className="circle">{Icon.arrow()}</span>
        </a>
      </div>

      <DueBanner address={wallet.address} />

      <div className="tiles">
        <a className="tile" href="/scan"><div className="sq">{Icon.scan()}</div><span>Scan any QR code</span></a>
        <a className="tile" href="/send"><div className="sq">{Icon.pay()}</div><span>Pay anyone</span></a>
        <a className="tile" href="/receive"><div className="sq">{Icon.receive()}</div><span>Receive money</span></a>
        <a className="tile" href="/merchant"><div className="sq">{Icon.shop()}</div><span>Shop QR</span></a>
      </div>

      <div className="chips">
        <a className="chip-card" href="/money"><span className="ic">{Icon.balance()}</span><div><div className="t1">USDT balance</div><div className="t2">Check</div></div></a>
        <a className="chip-card" href="/transactions"><span className="ic">{Icon.history()}</span><div><div className="t1">Transactions</div><div className="t2">See all</div></div></a>
        <a className="chip-card" href="/you"><span className="ic">{Icon.id()}</span><div><div className="t1">WondrPay ID</div><div className="t2 link">{name ? "View" : "Claim"}</div></div></a>
      </div>

      <div className="section-title">Send money</div>
      <div className="people">
        {rows === null && Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="person"><span className="pic skel circle" /><span className="skel" style={{ width: 56, height: 14 }} /></div>
        ))}
        {rows?.length === 0 && <div className="empty" style={{ gridColumn: "1 / -1" }}>People and shops you pay show up here.</div>}
        {people.map((p) => (
          <a key={p.address} className="person" href={`/chat?with=${p.address}${p.name ? `&name=${encodeURIComponent(p.name)}` : ""}`}>
            <span className="pic pic-ident"><Identicon seed={p.address} name={p.name} size={64} /></span>
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

      <RewardsEntry address={wallet.address} />

      <div className="section-title">Manage your money</div>
      <div className="menu-list">
        <a className="menu-row" href="/transactions"><span className="ic">{Icon.history()}</span>See transaction history<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/money"><span className="ic">{Icon.balance()}</span>Check USDT balance<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/money#add"><span className="ic">{Icon.bolt(24)}</span>Add money<span className="chev">{Icon.chev()}</span></a>
        <a className="menu-row" href="/receive"><span className="ic">{Icon.receive(24)}</span>Your QR code<span className="chev">{Icon.chev()}</span></a>
      </div>

      
    </main>
  )
}

