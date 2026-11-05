// Social share card for every page (1200×630), rendered at the edge.
import { ImageResponse } from "next/og"

export const alt = "WhitePay: pay anyone in digital dollars. No gas, no seed phrase."
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72,
        background: "radial-gradient(700px 420px at 85% 20%, #2448ff, transparent 70%), #05071a", color: "#eef0ff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 800 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#2448ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 40 }}>W</div>
          WhitePay
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1, letterSpacing: -3, display: "flex", flexWrap: "wrap" }}>
            Pay anyone in&nbsp;<span style={{ color: "#ddf05a" }}>digital dollars.</span>
          </div>
          <div style={{ fontSize: 32, color: "#9aa3cf" }}>Scan · fingerprint · settled in ~1 s. No gas, no seed phrase.</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 24, color: "#9aa3cf" }}>
          {["Whitechain", "ENS", "Arkiv", "World ID", "Autopay"].map((t) => (
            <div key={t} style={{ border: "2px solid rgba(255,255,255,.15)", borderRadius: 999, padding: "8px 20px", display: "flex" }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    size,
  )
}
