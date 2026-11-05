# WhitePay logo loader: motion prompt

Use this with a motion tool (LottieFiles AI, Rive, Jitter, After Effects + Bodymovin) or a motion designer. The in-app version (`LogoLoader` in `apps/web/app/ui.tsx`) is a CSS/SVG approximation of it.

**Prompt:**
> Design a seamless 1.8-second looping app loader for "WhitePay", a stablecoin payments app on Whitechain.
> **Canvas:** 512×512, transparent background, exported as Lottie JSON (and a 2× PNG sequence fallback).
> **Mark:** a rounded square tile (corner radius 120/512) filled electric blue #2448FF, with a soft blue glow beneath (0 18px 40px, #2448FF at 35%). On it, a white monoline "W" drawn as a single stroke path `M110 168 L160 344 L216 216 L256 308 L296 216 L352 344 L402 168`, stroke 40px, round caps and joins. Top-right sits a lime dot #DDF05A, radius 34 at (410,110).
> **Motion (ease cubic-bezier .65,0,.35,1):**
> 0.00–1.00s: the W draws on from the left end to the right end (trim path 0→100%).
> 1.00–1.10s: the lime dot "jumps": up 46px with a slight 1.15 scale, then lands with a squash (0.9) and settles. It feels like a coin dropping in, the payment landing.
> 1.10–1.55s: hold the full mark; the tile breathes to 1.04 scale and back.
> 1.55–1.80s: the W un-draws from left to right (trim start 0→100%) so the loop restarts cleanly.
> **Style:** crisp, minimal, confident fintech. No particles, no gradients on the W. Must read clearly at 48px. Provide a reduced-motion variant: static mark with only a slow 2-second opacity pulse on the lime dot.
> **Deliverables:** `whitepay-loader.json` (Lottie), `whitepay-loader-reduced.json`, a 3-second MP4 preview on #0A0C19 and on #F4F6FD.
