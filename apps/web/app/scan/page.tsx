"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { parseRequestUri } from "@whitepay/shared"
import { TopBar } from "../components"

export default function Scan() {
  const router = useRouter()
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState("")
  const [manual, setManual] = useState("")

  const go = (raw: string) => {
    const text = raw.trim()
    // 1. merchant request (dynamic QR): .../pay?req=0x<entityKey>
    const key = parseRequestUri(text) ?? (/^0x[0-9a-fA-F]{64}$/.test(text) ? text : null)
    if (key) { router.push(`/pay?req=${key}`); return true }
    // 2. personal "Receive" QR: .../send?to=0x..&name=..
    try {
      const u = new URL(text)
      if (u.pathname === "/send" && u.searchParams.get("to")) { router.push(`/send${u.search}`); return true }
    } catch {}
    // 3. bare address or name.whitepay.eth / ethereum: URI
    const addr = text.replace(/^ethereum:/, "").split(/[@?]/)[0]
    if (/^0x[0-9a-fA-F]{40}$/.test(addr)) { router.push(`/send?to=${addr}`); return true }
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(text.toLowerCase())) { router.push(`/send?name=${encodeURIComponent(text.toLowerCase())}`); return true }
    setErr("That QR isn't a WhitePay payment code")
    return false
  }

  useEffect(() => {
    let scanner: { stop: () => void; destroy: () => void } | undefined
    let done = false
    ;(async () => {
      try {
        const QrScanner = (await import("qr-scanner")).default
        if (!video.current) return
        const s = new QrScanner(
          video.current,
          (res) => { if (!done && go(res.data)) { done = true; s.stop() } },
          { preferredCamera: "environment", highlightScanRegion: false, returnDetailedScanResult: true },
        )
        scanner = s
        await s.start()
      } catch (e) {
        setErr(location.protocol !== "https:" && location.hostname !== "localhost"
          ? "Camera needs HTTPS. Paste the payment link below instead."
          : `Camera unavailable: ${(e as Error).message ?? e}`)
      }
    })()
    return () => { scanner?.stop(); scanner?.destroy() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="shell">
      <TopBar right={<a className="chip" href="/">Close</a>} />
      <div className="video-wrap">
        <video ref={video} playsInline muted />
        <div className="frame" />
      </div>
      <div className="sub" style={{ textAlign: "center" }}>Point at a WhitePay QR</div>
      <div className="err">{err}</div>
      <div className="card stack">
        <h2>Or paste a link, name or address</h2>
        <input className="input mono" placeholder="Payment link, name.whitepay.eth or 0x…" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn btn-ghost" onClick={() => go(manual)} disabled={!manual}>Open</button>
      </div>
    </main>
  )
}
