"use client"
// Payment sounds, synthesised with Web Audio (no files to download, works offline):
//  sent     two quick rising notes (payment / transfer went through)
//  received a bright three-note chime (money arrived)
//  reward   a sparkle (scratch card won, rewards claimed)
//  error    a low soft double tone (payment not sent)
//  tap      a tiny click (approve / scan feedback)
// Browsers only allow sound after the person has interacted with the page, so the audio context is unlocked on the
// first tap. A per-device mute switch lives in localStorage ("whitepay.sound" = "off").
type Kind = "sent" | "received" | "reward" | "error" | "tap"

let ctx: AudioContext | null = null
let primed = false
const KEY = "whitepay.sound"

export const soundOn = () => { try { return localStorage.getItem(KEY) !== "off" } catch { return true } }
export const setSoundOn = (on: boolean) => { try { localStorage.setItem(KEY, on ? "on" : "off") } catch {} }

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null
  const AC = window.AudioContext ?? (window as any).webkitAudioContext
  if (!AC) return null
  try {
    ctx ??= new AC()
    if (ctx.state !== "running") void ctx.resume().catch(() => {}) // "suspended", or iOS "interrupted" after backgrounding
    return ctx
  } catch { return null }
}

/** Unlock audio on the first interaction (call once at app start). */
export function primeSound() {
  if (typeof window === "undefined" || primed) return
  primed = true
  // every tap re-wakes the audio context (iOS suspends it when the app goes to the background)
  const wake = () => { if (!ctx || ctx.state !== "running") audio() }
  window.addEventListener("pointerdown", wake, { passive: true })
  window.addEventListener("keydown", wake)
}

function note(a: AudioContext, freq: number, start: number, dur: number, gain = 0.18, type: OscillatorType = "sine") {
  const o = a.createOscillator(), g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, start)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gain, start + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g).connect(a.destination)
  o.start(start)
  o.stop(start + dur + 0.02)
}

/** Never throws: a missing audio device must not turn a successful payment into an error. */
export function playSound(kind: Kind) {
  try { play(kind) } catch {}
}
function play(kind: Kind) {
  if (!soundOn()) return
  const a = audio()
  if (!a || a.state !== "running") return
  const t = a.currentTime + 0.01
  switch (kind) {
    case "sent": note(a, 784, t, 0.16); note(a, 1175, t + 0.11, 0.28); break // G5 → D6
    case "received": note(a, 880, t, 0.18, 0.16); note(a, 1109, t + 0.1, 0.18, 0.16); note(a, 1319, t + 0.2, 0.42, 0.18); break // A5 C#6 E6
    case "reward": [1319, 1568, 1976, 2637].forEach((f, i) => note(a, f, t + i * 0.06, 0.22, 0.1, "triangle")); break
    case "error": note(a, 311, t, 0.18, 0.14, "triangle"); note(a, 247, t + 0.16, 0.3, 0.14, "triangle"); break
    case "tap": note(a, 1400, t, 0.05, 0.06, "square"); break
  }
  try { navigator.vibrate?.(kind === "error" ? [30, 40, 30] : kind === "tap" ? 6 : [12]) } catch {}
}
