"use client"
// Film clock: one requestAnimationFrame loop owns the playhead. Components subscribe with a SELECTOR
// (useSyncExternalStore), so a count-up re-renders only when its rounded value changes, and a scene
// re-renders only when its sub-step changes. Everything else is CSS animation offset to the playhead.
import { useSyncExternalStore } from "react"

export const TOTAL = 180

type Listener = () => void
const state = { t: 0, playing: false, seek: 0 } // seek bumps on every jump so CSS animations re-sync
const subs = new Set<Listener>()
let raf = 0
let last = 0
let lastFrameAt = 0
let backup: ReturnType<typeof setInterval> | undefined
const events: { at: number; fn: () => void }[] = []

function frame(now: number) {
  if (!state.playing) return
  lastFrameAt = performance.now()
  const dt = last ? (now - last) / 1000 : 0
  last = now
  const prev = state.t
  state.t = Math.min(TOTAL, state.t + dt)
  for (const e of events) if (e.at > prev && e.at <= state.t) e.fn()
  if (state.t >= TOTAL) state.playing = false
  subs.forEach((l) => l())
  if (state.playing) raf = requestAnimationFrame(frame)
}

export const clock = {
  get t() { return state.t },
  get playing() { return state.playing },
  get seekId() { return state.seek },
  play() {
    if (state.playing) return
    if (state.t >= TOTAL) this.seek(0)
    state.playing = true
    last = 0
    raf = requestAnimationFrame(frame)
    // rAF stops in hidden/background views: keep time with a timer when frames stop arriving
    clearInterval(backup)
    backup = setInterval(() => { if (state.playing && performance.now() - lastFrameAt > 250) { cancelAnimationFrame(raf); frame(performance.now()) } }, 200)
    subs.forEach((l) => l())
  },
  pause() { state.playing = false; cancelAnimationFrame(raf); clearInterval(backup); subs.forEach((l) => l()) },
  toggle() { if (state.playing) this.pause(); else this.play() },
  seek(t: number) { state.t = Math.max(0, Math.min(TOTAL, t)); state.seek++; last = 0; subs.forEach((l) => l()) },
  /** fire fn when the playhead crosses `at` while playing (chimes) */
  on(at: number, fn: () => void) { events.push({ at, fn }); return () => { const i = events.findIndex((e) => e.fn === fn); if (i >= 0) events.splice(i, 1) } },
  subscribe(l: Listener) { subs.add(l); return () => { subs.delete(l) } },
}

/** subscribe to a derived value of the playhead; re-renders only when it changes */
export function useClock<T>(select: (t: number, playing: boolean, seek: number) => T): T {
  return useSyncExternalStore(clock.subscribe, () => select(state.t, state.playing, state.seek), () => select(0, false, 0))
}

/** seconds since a scene-local start, rounded to `step` (count-ups, chart draws) */
export const useLocal = (start: number, step = 0.05) => useClock((t) => Math.max(0, Math.round((t - start) / step) * step))

/** which beat of a scene we're in: index of the last mark <= local time */
export const useBeat = (start: number, marks: number[]) =>
  useClock((t) => { const l = t - start; let i = 0; for (let k = 0; k < marks.length; k++) if (l >= marks[k]) i = k + 1; return i })

/** ease-out cubic */
export const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3)

/** two-note success chime (WebAudio, no files) */
let ctx: AudioContext | null = null
export function chime() {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    ;[880, 1318.5].forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain()
      o.type = "sine"; o.frequency.value = f
      g.gain.setValueAtTime(0, now + i * 0.11)
      g.gain.linearRampToValueAtTime(0.18, now + i * 0.11 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.6)
      o.connect(g).connect(ctx!.destination)
      o.start(now + i * 0.11); o.stop(now + i * 0.11 + 0.65)
    })
  } catch {}
}
