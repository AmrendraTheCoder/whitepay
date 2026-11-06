"use client"
// "Live on Whitechain" strip for the app home: the network, the live block height (ticks with every new block from
// the chain watcher) and what that means for you (fast, gasless). Tapping it opens the Whitechain explorer.
import { useEffect, useState } from "react"
import { EXPLORER_URL } from "@whitepay/shared"
import { latestBlock } from "@/lib/live"

export function WhitechainStrip() {
  const [block, setBlock] = useState<string | null>(latestBlock ? latestBlock.toString() : null)
  const [pulse, setPulse] = useState(0)
  useEffect(() => {
    const on = (e: Event) => { setBlock((e as CustomEvent<{ block: string }>).detail.block); setPulse((n) => n + 1) }
    window.addEventListener("wondrpay:block", on)
    return () => window.removeEventListener("wondrpay:block", on)
  }, [])
  return (
    <a className="wc-strip" href={block ? `${EXPLORER_URL}/block/${block}` : EXPLORER_URL} target="_blank" rel="noreferrer" aria-label={`Live on Whitechain Sepolia${block ? `, block ${block}` : ""}. Open the explorer`}>
      <span className="wc-mark" aria-hidden>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2.5 20.5 7.4v9.2L12 21.5l-8.5-4.9V7.4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M8 9.5 10 15l2-4 2 4 2-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="wc-txt">
        <b>Live on Whitechain</b>
        <span>Sepolia · 1 s blocks · 0 gas</span>
      </span>
      <span className="wc-block" aria-live="off">
        <span key={pulse} className="wc-dot" aria-hidden />
        {block ? `#${Number(block).toLocaleString("en-US")}` : "connecting…"}
      </span>
    </a>
  )
}
