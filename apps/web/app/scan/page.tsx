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

  const go = (text: string) => {
    const key = parseRequestUri(text) ?? (/^0x[0-9a-fA-F]{64}$/.test(text.trim()) ? text.trim() : null)
    if (!key) { setErr("That QR isn't a WhitePay payment request"); return false }
    router.push(`/pay?req=${key}`)
    return true
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
        <h2>Or paste a payment link</h2>
        <input className="input mono" placeholder="https://…/pay?req=0x…" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button className="btn btn-ghost" onClick={() => go(manual)} disabled={!manual}>Open</button>
      </div>
    </main>
  )
}
