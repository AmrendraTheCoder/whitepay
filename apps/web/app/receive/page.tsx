"use client"
import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { receiveUrl } from "@whitepay/shared"
import { TopBar } from "../components"
import { LogoLoader } from "../ui"
import { getWallet } from "@/lib/wallet"
import { short } from "@/lib/format"

/** UPI "show my QR": a friend scans it, enters an amount and pays you (P2P push). */
export default function Receive() {
  const [wallet, setWallet] = useState<ReturnType<typeof getWallet> | undefined>(undefined)
  const [name, setName] = useState<string | undefined>()
  const [displayName, setDisplayName] = useState<string | undefined>()
  const [amount, setAmount] = useState("")
  const [qr, setQr] = useState("")
  const [link, setLink] = useState("")
  const [note, setNote] = useState("")

  useEffect(() => setWallet(getWallet()), [])
  useEffect(() => {
    if (!wallet) return
    fetch(`/api/resolve?q=${wallet.address}`).then((r) => r.json()).then((d) => {
      if (d.name) setName(d.name)
      if (d.displayName) setDisplayName(d.displayName)
    }).catch(() => {})
  }, [wallet])
  useEffect(() => {
    if (!wallet) return
    const url = receiveUrl(location.origin, { to: wallet.address, name, amount: amount && Number(amount) > 0 ? amount : undefined })
    setLink(url)
    QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: "M" }).then(setQr)
  }, [wallet, name, amount])

  if (wallet === undefined) return <main className="shell"><LogoLoader /></main>
  if (!wallet)
    return (
      <main className="shell">
        <TopBar />
        <a className="btn btn-primary" href="/app">Create your wallet first</a>
      </main>
    )

  const share = async () => {
    const text = `Pay me on WhitePay${amount ? ` (${amount} USDT)` : ""}`
    try {
      if (navigator.share) await navigator.share({ title: "WhitePay", text, url: link })
      else { await navigator.clipboard.writeText(link); setNote("Link copied") }
    } catch {}
  }

  return (
    <main className="shell">
      <TopBar right={<a className="chip" href="/app">Close</a>} />
      <div className="card stack" style={{ textAlign: "center" }}>
        <div className="sub">Scan to pay</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{displayName ?? name ?? short(wallet.address)}</div>
        {name && <div className="sub">{name}</div>}
        <div className="qr-wrap">{qr && <img src={qr} alt="My payment QR" />}</div>
        <div className="sub mono">{wallet.address}</div>
      </div>
      <div className="card stack">
        <h2>Request a fixed amount (optional)</h2>
        <input className="input" inputMode="decimal" placeholder="Any amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
      </div>
      <div className="actions">
        <button className="btn btn-primary" onClick={share}>Share</button>
        <button className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(link); setNote("Link copied") }}>Copy link</button>
      </div>
      <div className="sub" style={{ textAlign: "center" }}>{note || "Friends pay you in USDT on Whitechain. Nobody pays gas."}</div>
    </main>
  )
}
