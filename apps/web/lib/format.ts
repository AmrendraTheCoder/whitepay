export const usdt = (v: string | bigint | number | undefined | null) => {
  if (v === undefined || v === null) return "–"
  const n = typeof v === "bigint" ? v : BigInt(String(v))
  const whole = n / 1_000_000n
  const frac = (n % 1_000_000n).toString().padStart(6, "0").slice(0, 2)
  return `${whole.toLocaleString("en-IN")}.${frac}`
}

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "")

export const ago = (unixSeconds: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(unixSeconds * 1000).toLocaleDateString()
}

export const initials = (name?: string) => (name ? name.replace(/\.whitepay\.eth$/, "").slice(0, 1).toUpperCase() : "?")

export const mmss = (secs: number) => {
  const s = Math.max(0, Math.floor(secs))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** countdown for autopay timers: "1:59", "3:04:12", "29d 23h" */
export const countdown = (secs: number) => {
  const s = Math.max(0, Math.floor(secs))
  if (s >= 2 * 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
  return mmss(s)
}
export const when = (unix: number) => new Date(unix * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
