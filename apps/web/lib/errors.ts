// One place that turns any error into words a person can act on. Raw library / RPC / JavaScript errors
// ("An unknown RPC error occurred … Version: viem@…", "undefined is not an object …") never reach the screen:
// they are logged for us and replaced by a plain sentence that always says whether money moved.

const TECHNICAL = new RegExp([
  "rpc error", "version: viem", "viem@", "details:", "request arguments:", "contract call:", "docs: https",
  "undefined is not", "is not an object", "is not a function", "cannot read propert", "cannot set propert", "null is not",
  "typeerror", "referenceerror", "syntaxerror", "rangeerror", "unexpected token", "json", "internal error",
  "execution reverted", "revert", "0x[0-9a-f]{16,}", "\\bat [\\w.$<>]+ \\(", "namespace", "eip155", "jsonrpc",
  "\\bcode[:= ]+-?\\d{3,}", "status code", "\\b5\\d\\d\\b", "abort", "chunk", "failed to fetch dynamically",
].join("|"), "i")

/** What happened, in plain words. `nothingCharged` is appended where it's true (every failure before settlement). */
export function friendlyError(e: unknown, opts: { action?: string } = {}): string {
  const full = errorText(e) // match against everything (the useful part is often in a "Details:" line)…
  const m = full.toLowerCase()
  const raw = full.split("\n")[0].trim() // …but only ever show the first line
  const nothing = "Nothing was charged."

  // the person chose this
  if (/user rejected|user denied|rejected the request|request rejected|denied transaction|cancel/.test(m) || (e as any)?.code === 4001)
    return `Cancelled. ${nothing}`

  // money / payment state (our server's own wording, or contract errors)
  if (/exceeds balance|insufficient|not enough usdt/.test(m)) return "Not enough USDT in this wallet. Add USDT and try again."
  if (/authorization is used|already paid|orderalreadypaid|already been used/.test(m)) return "This payment was already made. Nothing more was charged."
  if (/orderexpired|expired|deadline|too old/.test(m)) return `This payment request expired. Ask for a new QR code or link. ${nothing}`
  if (/daily limit|spending limit/.test(m)) return "You've reached today's WondrPay spending limit."
  if (/too many|rate limit|429/.test(m)) return `Too many attempts. Wait a minute and try again. ${nothing}`

  // the wallet side
  if (/didn'?t respond|timed? ?out|timeout/.test(m)) return `Your wallet didn't answer in time. Open it and try again. ${nothing}`
  if (/connected wallet is not|switch your wallet to|signed with .* not /.test(m)) return raw // already written for people
  if (/no browser wallet|install a wallet/.test(m)) return "No wallet app found on this device. Open WondrPay in MetaMask's browser, or connect MetaMask under You."
  if (/namespace|session (topic )?doesn'?t exist|no matching key|please call connect|session not initialized|walletconnect/.test(m))
    return `Your MetaMask connection needed a refresh. Tap Try again and approve the reconnect in MetaMask. ${nothing}`
  if (/chain ?id|wrong network|unrecognized chain|switch.*chain|add.*network/.test(m))
    return `Switch MetaMask to Whitechain Sepolia, then try again. ${nothing}`

  // the network
  if (/failed to fetch|network ?error|networkerror|load failed|fetch failed|offline|econn|socket/.test(m))
    return `Network problem. Check your connection and try again. ${nothing}`

  // anything else we wrote ourselves is fine to show; anything that looks like a stack trace or library dump is not
  if (raw && raw.length <= 220 && !TECHNICAL.test(raw)) return raw
  if (typeof console !== "undefined") console.error(`[wondrpay] ${opts.action ?? "error"}:`, e)
  return `Something went wrong on our side${opts.action ? ` while ${opts.action}` : ""}. ${nothing} Please try again.`
}

/** Every message an error carries (viem's shortMessage, details, a nested cause), one per line. */
export function errorText(e: unknown): string {
  if (!e) return ""
  if (typeof e === "string") return e
  const x = e as any
  return [x.shortMessage, x.reason, x.message, x.details, x.error?.message, x.cause?.message]
    .filter((v) => typeof v === "string" && v).join("\n") || String(e)
}
