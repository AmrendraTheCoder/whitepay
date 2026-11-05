"use client"
// WhitePay: the 3-minute motion film, built from the app's own UI language.
// Keys: space play/pause · ←/→ 5 s · 1-9,0 jump to scene · c captions · v voice · f fullscreen
// URL:  ?rec=1 (no controls, no cursor, autoplay: screen-record at 3840×2160) · ?t=90 start at 1:30
//       ?captions=0 · ?voice=1 (browser text-to-speech reads the voiceover)
import { useEffect, useRef, useState } from "react"
import { clock, useClock, chime, TOTAL } from "./clock"
import { SCENES, CHIMES } from "./scenes"
import "./film.css"

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`
const sceneAt = (t: number) => Math.max(0, SCENES.findIndex((s) => t >= s.start && t < s.end) === -1 ? SCENES.length - 1 : SCENES.findIndex((s) => t >= s.start && t < s.end))

function SceneHost({ index, seekId }: { index: number; seekId: number }) {
  const sc = SCENES[index]
  // playhead inside this scene at mount: CSS delays are offset by it, so a scrub lands on the right frame
  const [off] = useState(() => Math.max(0, clock.t - sc.start))
  return <div key={`${sc.id}:${seekId}`} className={`scene sc-${sc.id}`} style={{ ["--off" as string]: `${off}s` }}>{sc.render(sc.start)}</div>
}

function Captions() {
  const i = useClock((t) => sceneAt(t))
  const sc = SCENES[i]
  const words = sc.vo.split(" ")
  // reveal words at speaking pace across the scene (≈ 150 wpm feel), karaoke style
  const n = useClock((t) => Math.min(words.length, Math.ceil(((t - sc.start) / Math.max(1, sc.end - sc.start - 0.8)) * words.length)))
  return <div className="captions"><p>{words.map((w, k) => <span key={k} className={k < n ? "on" : ""}>{w} </span>)}</p></div>
}

export default function Film() {
  const [scale, setScale] = useState(1)
  const [rec, setRec] = useState(false)
  const [captions, setCaptions] = useState(true)
  const [voice, setVoice] = useState(false)
  const [idle, setIdle] = useState(false)
  const index = useClock((t) => sceneAt(t))
  const seekId = useClock((_t, _p, s) => s)
  const playing = useClock((_t, p) => p)
  const time = useClock((t) => Math.floor(t * 4) / 4)
  const spoken = useRef(-1)
  const idleT = useRef<ReturnType<typeof setTimeout>>(undefined)

  // fit 1920×1080 into the window
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080))
    fit(); window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [])

  // URL options
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const r = q.get("rec") === "1"
    setRec(r)
    if (q.get("captions") === "0") setCaptions(false)
    if (q.get("voice") === "1") setVoice(true)
    const t = Number(q.get("t"))
    if (t > 0) clock.seek(t)
    if (r) setTimeout(() => clock.play(), 1200)
    const offs = CHIMES.map((at) => clock.on(at, chime))
    return () => { offs.forEach((o) => o()); clock.pause() }
  }, [])

  // voiceover via the browser's speech engine (optional)
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return
    if (!voice || !playing) { speechSynthesis.cancel(); spoken.current = -1; return }
    if (spoken.current === index) return
    spoken.current = index
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(SCENES[index].vo)
    u.rate = 1.02; u.pitch = 1
    const v = speechSynthesis.getVoices().find((x) => /en[-_](US|GB|IN)/i.test(x.lang) && /natural|neural|google|samantha|daniel/i.test(x.name))
    if (v) u.voice = v
    speechSynthesis.speak(u)
  }, [voice, playing, index, seekId])

  // keyboard
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); clock.toggle() }
      else if (e.key === "ArrowRight") clock.seek(clock.t + 5)
      else if (e.key === "ArrowLeft") clock.seek(clock.t - 5)
      else if (/^[0-9]$/.test(e.key)) { const i = e.key === "0" ? 9 : Number(e.key) - 1; if (SCENES[i]) clock.seek(SCENES[i].start) }
      else if (e.key === "c") setCaptions((c) => !c)
      else if (e.key === "v") setVoice((v) => !v)
      else if (e.key === "f") void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())
    }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [])

  const poke = () => { setIdle(false); clearTimeout(idleT.current); idleT.current = setTimeout(() => setIdle(true), 2500) }

  return (
    <main className={`film-root ${rec ? "rec" : ""} ${idle && playing ? "idle" : ""}`} onMouseMove={poke} onClick={(e) => { if ((e.target as HTMLElement).closest(".film-ui")) return; clock.toggle() }}>
      <div className={`stage ${playing ? "" : "paused"}`} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="dots" />
        <SceneHost key={`${index}:${seekId}`} index={index} seekId={seekId} />
        {captions && <Captions />}
        <div className="wm"><span className="wm-logo" />WhitePay</div>
      </div>

      {!rec && (
        <div className="film-ui" onClick={(e) => e.stopPropagation()}>
          <button className="pp" onClick={() => clock.toggle()} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "▶"}</button>
          <span className="tc">{fmt(time)} / {fmt(TOTAL)}</span>
          <div className="scrub" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); clock.seek(((e.clientX - r.left) / r.width) * TOTAL) }}>
            <div className="prog" style={{ width: `${(time / TOTAL) * 100}%` }} />
            {SCENES.map((sc, i) => (
              <span key={sc.id} className={`mark ${i === index ? "on" : ""}`} style={{ left: `${(sc.start / TOTAL) * 100}%` }} title={`${i + 1}. ${sc.title}`}
                onClick={(e) => { e.stopPropagation(); clock.seek(sc.start) }} />
            ))}
          </div>
          <span className="scene-name">{index + 1}. {SCENES[index].title}</span>
          <button className={captions ? "on" : ""} onClick={() => setCaptions((c) => !c)} title="Captions (c)">CC</button>
          <button className={voice ? "on" : ""} onClick={() => setVoice((v) => !v)} title="Voiceover (v)">🔊</button>
          <a href="?rec=1" title="Recording mode: no controls, autoplay">REC</a>
          <button onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())} title="Fullscreen (f)">⛶</button>
        </div>
      )}
      {!playing && time === 0 && !rec && <div className="film-start" onClick={() => clock.play()}><span>▶</span><b>WhitePay · 3-minute film</b><small>space to play · ←/→ seek · 1-0 scenes · v voice · f fullscreen</small></div>}
    </main>
  )
}
