"use client"
// Live chain: a three.js scene of Whitechain blocks (one per second, like the real chain) with USDT payments
// flowing into them. The scene leans toward the cursor; hovering a block lights it up and shows its details.
//
// Engineering notes
//  - three.js is code-split and only downloaded when the section scrolls near the viewport.
//  - Renders only while visible and while the tab is visible; DPR capped at 2.
//  - prefers-reduced-motion: renders one still frame, no animation loop.
//  - No WebGL: a static, readable fallback. The canvas is decorative (aria-hidden) and the section text carries meaning.
//  - Everything is disposed on unmount (geometries, materials, renderer, listeners, observers).
import { useEffect, useRef, useState } from "react"
import type * as THREE from "three" // types only; the library itself is loaded lazily below

export function ChainScene({ startBlock }: { startBlock: number | null }) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"idle" | "ready" | "fallback">("idle")
  const tip = useRef<HTMLDivElement>(null)
  const [head, setHead] = useState(startBlock ?? 0)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let disposed = false
    let cleanup = () => {}

    const start = async () => {
      const canvas = document.createElement("canvas")
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl")
      if (!gl) { setState("fallback"); return }
      const THREE = await import("three")
      const { RoundedBoxGeometry } = await import("three/examples/jsm/geometries/RoundedBoxGeometry.js")
      if (disposed) return

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      canvas.setAttribute("aria-hidden", "true")
      el.appendChild(canvas)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
      camera.position.set(0, 2.6, 10.5)
      camera.lookAt(0, 0, 0)
      const rig = new THREE.Group()
      scene.add(rig)

      scene.add(new THREE.AmbientLight(0xffffff, 0.55))
      const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 8, 6); scene.add(key)
      const rim = new THREE.PointLight(0x2448ff, 30, 30); rim.position.set(-6, 2, -4); scene.add(rim)

      // blocks
      const BLUE = new THREE.Color(0x4d6bff), LIME = new THREE.Color(0xddf05a), BASE = new THREE.Color(0x151a28)
      const SPACING = 1.9, COUNT = 9
      const geo = new RoundedBoxGeometry(1.25, 1.25, 1.25, 4, 0.16)
      const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.27, 1.27, 1.27))
      type Block = { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; edge: THREE.LineSegments; n: number; payments: number; pulse: number }
      const blocks: Block[] = []
      const mkBlock = (i: number, n: number): Block => {
        const mat = new THREE.MeshStandardMaterial({ color: BASE, roughness: 0.35, metalness: 0.25, emissive: BLUE, emissiveIntensity: 0.06 })
        const mesh = new THREE.Mesh(geo, mat)
        const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.9 }))
        mesh.add(edge)
        mesh.position.x = (i - (COUNT - 1) / 2) * SPACING
        mesh.userData.i = i
        rig.add(mesh)
        return { mesh, mat, edge, n, payments: 1 + ((n * 7) % 5), pulse: 0 }
      }
      const first = (startBlock ?? 0) - (COUNT - 1)
      for (let i = 0; i < COUNT; i++) blocks.push(mkBlock(i, first + i))

      // links between blocks
      const linkMat = new THREE.MeshBasicMaterial({ color: 0x343b4f })
      const linkGeo = new THREE.CylinderGeometry(0.035, 0.035, SPACING - 1.25, 8)
      const links = Array.from({ length: COUNT - 1 }, (_, i) => {
        const m = new THREE.Mesh(linkGeo, linkMat); m.rotation.z = Math.PI / 2; m.position.x = (i + 0.5 - (COUNT - 1) / 2) * SPACING; rig.add(m); return m
      })

      // payments: small lime coins arcing into the newest block
      const coinGeo = new THREE.TorusGeometry(0.16, 0.06, 10, 24)
      const coinMat = new THREE.MeshStandardMaterial({ color: LIME, emissive: LIME, emissiveIntensity: 0.6, roughness: 0.3 })
      type Coin = { mesh: THREE.Mesh; t: number; from: THREE.Vector3 }
      const coins: Coin[] = []
      const spawnCoin = () => {
        const m = new THREE.Mesh(coinGeo, coinMat)
        const from = new THREE.Vector3(-6 + Math.random() * 9, 1.4 + Math.random() * 0.9, 1 + Math.random() * 1.5)
        m.position.copy(from); rig.add(m); coins.push({ mesh: m, t: 0, from })
      }

      // sizing
      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight
        renderer.setSize(w, h, false)
        camera.aspect = w / h
        camera.position.z = w < 640 ? 17 : 10.5
        camera.updateProjectionMatrix()
      }
      const ro = new ResizeObserver(resize); ro.observe(el); resize()

      // pointer: lean toward the cursor + hover picking
      const pointer = new THREE.Vector2(9, 9), target = { x: 0, y: 0 }
      const ray = new THREE.Raycaster()
      let hovered: Block | null = null
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        target.x = pointer.x * 0.28; target.y = pointer.y * 0.12
        if (reduced) requestAnimationFrame(frame) // still frame mode: repaint only on interaction
      }
      const onLeave = () => { pointer.set(9, 9); target.x = 0; target.y = 0; hovered = null; showTip(null); el.style.cursor = "" }
      // tooltip is updated through the DOM, never React state, so hovering doesn't re-render at 60 fps
      const showTip = (b: Block | null, x = 0, y = 0) => {
        const t = tip.current
        if (!t) return
        if (!b) { t.hidden = true; return }
        t.hidden = false
        t.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
        t.firstElementChild!.textContent = `Block #${b.n.toLocaleString("en-US")}`
        t.lastElementChild!.textContent = `${b.payments} payment${b.payments === 1 ? "" : "s"} · settled in ~1 s`
      }
      el.addEventListener("pointermove", onMove)
      el.addEventListener("pointerleave", onLeave)

      // run only when visible
      let visible = false, raf = 0, last = performance.now(), sinceBlock = 0, sinceCoin = 0
      const v = new THREE.Vector3()
      const frame = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000); last = now
        rig.rotation.y += (target.x - rig.rotation.y) * 0.06
        rig.rotation.x += (target.y - rig.rotation.x) * 0.06

        if (!reduced) {
          // a new block every second, like the real chain: everything shifts left, a fresh block enters on the right
          sinceBlock += dt; sinceCoin += dt
          if (sinceCoin > 0.35) { sinceCoin = 0; spawnCoin() }
          if (sinceBlock > 1) {
            sinceBlock = 0
            const old = blocks.shift()!
            old.n = blocks[blocks.length - 1].n + 1; old.payments = 0; old.pulse = 1
            blocks.push(old)
            setHead(old.n)
          }
          blocks.forEach((b, i) => {
            const x = (i - (COUNT - 1) / 2) * SPACING
            b.mesh.position.x += (x - b.mesh.position.x) * 0.12
          })
          // coins arc into the newest block, which counts the payment
          const tail = blocks[blocks.length - 1]
          for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i]
            c.t += dt * 1.6
            const to = tail.mesh.position
            v.lerpVectors(c.from, to, c.t)
            v.y += Math.sin(c.t * Math.PI) * 0.7
            c.mesh.position.copy(v)
            c.mesh.rotation.y += dt * 6
            if (c.t >= 1) { rig.remove(c.mesh); coins.splice(i, 1); tail.payments += 1; tail.pulse = 1 }
          }
        }

        // hover picking
        ray.setFromCamera(pointer, camera)
        const hit = ray.intersectObjects(blocks.map((b) => b.mesh), false)[0]
        const hb = hit ? blocks.find((b) => b.mesh === hit.object) ?? null : null
        if (hb !== hovered) { hovered = hb; el.style.cursor = hb ? "pointer" : "" }
        if (hovered) {
          v.copy(hovered.mesh.position).add(new THREE.Vector3(0, 1.1, 0)).applyMatrix4(rig.matrixWorld).project(camera)
          showTip(hovered, (v.x + 1) / 2 * el.clientWidth, (1 - v.y) / 2 * el.clientHeight)
        } else showTip(null)

        blocks.forEach((b) => {
          b.pulse = Math.max(0, b.pulse - dt * 1.8)
          const on = b === hovered ? 1 : 0
          const glow = 0.06 + b.pulse * 0.45 + on * 0.5
          b.mat.emissiveIntensity += (glow - b.mat.emissiveIntensity) * 0.2
          b.mat.emissive.copy(on ? LIME : BLUE)
          ;(b.edge.material as THREE.LineBasicMaterial).color.copy(on ? LIME : BLUE)
          const s = 1 + b.pulse * 0.08 + on * 0.06
          b.mesh.scale.setScalar(b.mesh.scale.x + (s - b.mesh.scale.x) * 0.2)
          b.mesh.rotation.y += reduced ? 0 : dt * 0.15
        })
        renderer.render(scene, camera)
        if (visible && !reduced) raf = requestAnimationFrame(frame)
      }
      const play = () => { if (!visible) return; cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame) }
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting && document.visibilityState === "visible"; visible ? play() : cancelAnimationFrame(raf) }, { threshold: 0.05 })
      io.observe(el)
      const onVis = () => { visible = document.visibilityState === "visible" && el.getBoundingClientRect().top < innerHeight; visible ? play() : cancelAnimationFrame(raf) }
      document.addEventListener("visibilitychange", onVis)
      if (reduced) frame(performance.now())
      setState("ready")

      cleanup = () => {
        cancelAnimationFrame(raf); io.disconnect(); ro.disconnect()
        document.removeEventListener("visibilitychange", onVis)
        el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave)
        blocks.forEach((b) => { b.mat.dispose(); (b.edge.material as THREE.Material).dispose() })
        ;[geo, edgeGeo, linkGeo, coinGeo].forEach((g) => g.dispose()); linkMat.dispose(); coinMat.dispose()
        links.length = 0; renderer.dispose(); canvas.remove()
      }
    }

    // download three.js only when the section is about to be seen
    const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near.disconnect(); start().catch(() => setState("fallback")) } }, { rootMargin: "300px" })
    near.observe(el)
    return () => { disposed = true; near.disconnect(); cleanup() }
  }, [startBlock])

  return (
    <div className="chain" ref={host} data-state={state}>
      {state === "fallback" && <div className="chain-fallback">Whitechain adds a block every second. {startBlock ? `Latest: #${startBlock.toLocaleString("en-US")}` : ""}</div>}
      <div className="chain-hud" aria-hidden><span className="wp-dot" /> Block <b>#{head ? head.toLocaleString("en-US") : "…"}</b> · new block every second</div>
      <div ref={tip} className="chain-tip" hidden aria-hidden><b /><span /></div>
    </div>
  )
}
