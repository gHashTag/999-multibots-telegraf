/**
 * THE MARK THAT LISTENS AND SPEAKS.
 *
 * The 27 facets of the t27 mark, each driven by its own band of the sound:
 * the person's mic while they talk, the agent's voice while it answers, a
 * slow sweep while it thinks. Two canvases sit behind the mark: a liquid
 * aura, drawn small and blurred by the GPU, and a sharp layer with the
 * mode's own effect.
 *
 * Everything moves inside requestAnimationFrame by writing attributes on the
 * facets directly: sixty React renders a second would be the slowest possible
 * way to do this, and on a phone in Telegram's WebView the difference is the
 * difference between smooth and stuttering.
 */
import { useEffect, useRef, useState } from 'react'
import { BRAND_MARK_URL } from '@/components/BrandLoader/BrandLoader'
import type { VoicePhase } from '@/lib/voice/session'
import type { VoiceMode } from '@/lib/voice/chatVoice'
import { parseMark, type Mark } from './logoFacets'
import { PALETTE, bandAt, easeHue, mixHue } from './orbMath'

const BANDS = 27
const LOW_HZ = 90
const HIGH_HZ = 7000
const TAU = Math.PI * 2

/**
 * The aura is blurred anyway: drawing it at a fraction of the screen's
 * resolution costs nothing visible and a quarter of the pixels or less.
 */
const AURA_SCALE = 0.5

let markOnce: Promise<Mark | null> | null = null
function loadMark(): Promise<Mark | null> {
  markOnce ??= fetch(BRAND_MARK_URL)
    .then(r => (r.ok ? r.text() : ''))
    .then(parseMark)
    .catch(() => null)
  return markOnce
}

interface Props {
  getAnalyser: () => AnalyserNode | null
  phase: VoicePhase
  mode: VoiceMode
  /** The device speaks instead of our engine: there is no signal to read. */
  syntheticVoice?: boolean
  reducedMotion?: boolean
  onTap?: () => void
  label?: string
}

interface Particle {
  a: number
  r: number
  v: number
  s: number
  tilt: number
}

interface Shard {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  spin: number
  size: number
  life: number
}

export function VoiceOrb({
  getAnalyser,
  phase,
  mode,
  syntheticVoice,
  reducedMotion,
  onTap,
  label,
}: Props) {
  const [mark, setMark] = useState<Mark | null>(null)
  const rootRef = useRef<HTMLButtonElement>(null)
  const auraRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const groupRef = useRef<SVGGElement>(null)
  const facetRefs = useRef<Array<SVGPathElement | null>>([])
  // Read inside the frame loop, which must not restart on every change.
  const live = useRef({
    phase,
    mode,
    syntheticVoice,
    reducedMotion,
    getAnalyser,
  })
  useEffect(() => {
    live.current = { phase, mode, syntheticVoice, reducedMotion, getAnalyser }
  })

  useEffect(() => {
    let alive = true
    void loadMark().then(m => alive && setMark(m))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!mark) return
    const root = rootRef.current
    // The colour of the moment also tints the room around the orb.
    const tintTarget =
      (root?.closest('.voice-overlay, .voice-dock') as HTMLElement | null) ??
      root
    const aura = auraRef.current
    const ag = aura?.getContext('2d') ?? null
    const canvas = canvasRef.current
    const g = canvas?.getContext('2d') ?? null
    // Facet order around the mark (spectrum) and from the core out (shatter).
    const byAngle = rankBy(mark.facets.map(f => f.angle))
    const freq = new Uint8Array(4096)
    const bands = new Float32Array(BANDS)
    const target = new Float32Array(BANDS)
    const particles: Particle[] = Array.from({ length: 180 }, () => ({
      a: Math.random() * TAU,
      r: 0.72 + Math.random() * 0.62,
      v: (0.0025 + Math.random() * 0.006) * (Math.random() < 0.5 ? -1 : 1),
      s: 0.5 + Math.random() * 1.6,
      tilt: (Math.random() - 0.5) * 0.5,
    }))
    const rings: Array<{ r: number; a: number; w: number }> = []
    const shards: Shard[] = []
    const colour = { h: PALETTE[live.current.phase][0], h2: 0, s: 0 }
    colour.h2 = PALETTE[live.current.phase][1]
    colour.s = PALETTE[live.current.phase][2]
    // Off the wheel, so the first frame always paints.
    let painted = { h: -999, h2: -999 }
    let prevLevel = 0
    let lastRing = 0
    let raf = 0
    const t0 = performance.now()

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const { phase, mode, syntheticVoice, reducedMotion, getAnalyser } =
        live.current
      const t = (now - t0) / 1000
      const calm = reducedMotion ? 0.35 : 1

      // ---- the sound, as 27 bands ----
      const an = getAnalyser()
      const reading =
        an &&
        !syntheticVoice &&
        (phase === 'listening' || phase === 'speaking' || phase === 'hearing')
      if (reading && an) {
        const n = an.frequencyBinCount
        const view = freq.subarray(0, n)
        an.getByteFrequencyData(view)
        const binHz = an.context.sampleRate / an.fftSize
        for (let b = 0; b < BANDS; b++) {
          const lo = LOW_HZ * Math.pow(HIGH_HZ / LOW_HZ, b / BANDS)
          const hi = LOW_HZ * Math.pow(HIGH_HZ / LOW_HZ, (b + 1) / BANDS)
          const i0 = Math.max(1, Math.floor(lo / binHz))
          const i1 = Math.min(n - 1, Math.max(i0 + 1, Math.ceil(hi / binHz)))
          let sum = 0
          for (let i = i0; i < i1; i++) sum += view[i]
          const v = sum / (i1 - i0) / 255
          target[b] = clamp((v - 0.2) / 0.5)
        }
      } else if (
        phase === 'thinking' ||
        phase === 'starting' ||
        phase === 'hearing' ||
        phase === 'error'
      ) {
        // No sound to read: a slow light travelling around the mark. Stopped,
        // it is slower still: the mark is the button that starts again.
        const speed = phase === 'hearing' ? 1.4 : phase === 'error' ? 0.3 : 0.55
        for (let b = 0; b < BANDS; b++) {
          const c = Math.cos(TAU * (b / BANDS - t * speed))
          target[b] = 0.14 + 0.66 * Math.pow(Math.max(0, c), 6)
        }
      } else if (phase === 'speaking') {
        // The device's own voice: no signal, so a believable talking rhythm.
        const env =
          0.35 + 0.35 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.1))
        for (let b = 0; b < BANDS; b++)
          target[b] = env * (0.6 + 0.4 * Math.sin(b * 1.7 + t * 11))
      } else {
        for (let b = 0; b < BANDS; b++)
          target[b] = 0.06 + 0.04 * Math.sin(t * 1.2 + b)
      }
      let level = 0
      for (let b = 0; b < BANDS; b++) {
        const k = target[b] > bands[b] ? 0.45 : 0.1
        bands[b] += (target[b] - bands[b]) * k
        level += bands[b]
      }
      level = (level / BANDS) * calm
      const rising = level - prevLevel > 0.05
      prevLevel = level

      // ---- the colour, eased so a phase change is a fade, not a cut ----
      const [th, th2, ts] = PALETTE[phase]
      colour.h = easeHue(colour.h, th, 0.07)
      colour.h2 = easeHue(colour.h2, th2, 0.07)
      colour.s += (ts - colour.s) * 0.07
      const hue = colour.h
      const hue2 = colour.h2
      const sat = colour.s
      if (
        tintTarget &&
        (Math.abs(painted.h - hue) > 0.5 || Math.abs(painted.h2 - hue2) > 0.5)
      ) {
        tintTarget.style.setProperty('--voice-h', hue.toFixed(1))
        tintTarget.style.setProperty('--voice-h2', hue2.toFixed(1))
        tintTarget.style.setProperty('--voice-s', `${sat.toFixed(0)}%`)
        painted = { h: hue, h2: hue2 }
      }

      // ---- the facets ----
      const { cx, cy } = mark
      const breathe = 1 + 0.018 * Math.sin(t * 1.7) * calm
      const group = groupRef.current
      if (group) {
        let gT = ''
        if (mode === 'pulse') {
          const s = breathe * (1 + level * 0.3)
          gT = `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`
        } else if (mode === 'orbit') {
          gT = `rotate(${(t * 12 + level * 50) * calm} ${cx} ${cy})`
        } else if (mode === 'spectrum') {
          const s = breathe * (1 + level * 0.08)
          gT = `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`
        } else if (mode === 'hologram') {
          const wob = Math.sin(t * 2) * 3 * calm
          gT = `translate(0 ${wob})`
        }
        group.setAttribute('transform', gT)
      }
      mark.facets.forEach((f, i) => {
        const el = facetRefs.current[i]
        if (!el) return
        const band = bands[byAngle[i] % BANDS]
        // Quiet facets stay the white of the mark; loud ones take the colour.
        let fs = 18 + band * 82
        let light = 93 - band * 28
        let alpha = 0.96
        let fh = hue + (hue2 - hue) * f.radius * 0.6
        let tr = ''
        switch (mode) {
          case 'spectrum':
            fh = mixHue(hue, hue2, byAngle[i] / (mark.facets.length - 1))
            light = 46 + band * 44
            fs = 60 + band * 40
            alpha = 0.6 + band * 0.4
            break
          case 'hologram': {
            fs = 90
            light = 62 + band * 30
            alpha = 0.3 + band * 0.6 + 0.08 * Math.sin(t * 9 + i)
            // Glitch: a few facets slip sideways on loud moments.
            if (level > 0.26 && Math.random() < level * 0.25 * calm) {
              tr = `translate(${(Math.random() - 0.5) * 46 * level} 0)`
            }
            break
          }
          case 'shatter': {
            const dx = f.cx - cx
            const dy = f.cy - cy
            const len = Math.hypot(dx, dy) || 1
            const push = band * 80 * (0.35 + f.radius) * calm
            const spin = band * 22 * (i % 2 ? 1 : -1) * calm
            tr = `translate(${(dx / len) * push} ${(dy / len) * push}) rotate(${spin} ${f.cx} ${f.cy})`
            break
          }
        }
        el.setAttribute('transform', tr)
        el.setAttribute(
          'fill',
          `hsla(${fh.toFixed(1)}, ${Math.min(100, fs).toFixed(0)}%, ${Math.min(97, light).toFixed(1)}%, ${clamp(alpha).toFixed(3)})`
        )
      })

      // ---- the aura: three liquid blobs, blurred by the GPU ----
      if (aura && ag) {
        const w = Math.max(1, Math.round(aura.clientWidth * AURA_SCALE))
        const h = Math.max(1, Math.round(aura.clientHeight * AURA_SCALE))
        if (aura.width !== w || aura.height !== h) {
          aura.width = w
          aura.height = h
        }
        ag.clearRect(0, 0, w, h)
        ag.globalCompositeOperation = 'lighter'
        const ox = w / 2
        const oy = h / 2
        const R = Math.min(w, h) * 0.3
        const amp = (0.06 + level * 0.42) * calm
        for (let k = 0; k < 3; k++) {
          const bh = k === 0 ? hue : k === 1 ? hue2 : mixHue(hue, hue2, 0.5)
          const base = R * (0.78 + k * 0.08 + level * 0.25)
          const spin = t * (0.18 + k * 0.11) * (k % 2 ? -1 : 1) * calm
          ag.beginPath()
          const steps = 72
          for (let s = 0; s <= steps; s++) {
            const a = (s / steps) * TAU
            const wave =
              0.5 * Math.sin(3 * a + spin * 3 + k * 1.3) +
              0.3 * Math.sin(5 * a - t * 1.3 * calm + k * 2.1) +
              0.9 * bandAt(bands, a + spin)
            const r = base * (1 + amp * wave)
            const x = ox + Math.cos(a) * r
            const y = oy + Math.sin(a) * r
            if (s === 0) ag.moveTo(x, y)
            else ag.lineTo(x, y)
          }
          ag.closePath()
          const shift = R * 0.12
          const gx = ox + Math.cos(spin * 2 + k * 2.1) * shift
          const gy = oy + Math.sin(spin * 2 + k * 2.1) * shift
          const grad = ag.createRadialGradient(gx, gy, 0, gx, gy, base * 1.35)
          grad.addColorStop(
            0,
            `hsla(${bh}, ${sat}%, 66%, ${0.5 + level * 0.4})`
          )
          grad.addColorStop(0.55, `hsla(${bh}, ${sat}%, 52%, 0.32)`)
          grad.addColorStop(1, `hsla(${bh}, ${sat}%, 40%, 0)`)
          ag.fillStyle = grad
          ag.fill()
        }
        // A white-hot core while the agent speaks.
        if (phase === 'speaking' || phase === 'hearing') {
          const core = ag.createRadialGradient(ox, oy, 0, ox, oy, R * 0.9)
          core.addColorStop(0, `hsla(${hue}, 100%, 92%, ${0.12 + level * 0.5})`)
          core.addColorStop(1, `hsla(${hue}, 100%, 80%, 0)`)
          ag.fillStyle = core
          ag.fillRect(0, 0, w, h)
        }
        ag.globalCompositeOperation = 'source-over'
      }

      // ---- the sharp layer: the mode's own effect ----
      if (!canvas || !g) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.round(canvas.clientWidth * dpr)
      const h = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      g.clearRect(0, 0, w, h)
      g.globalCompositeOperation = 'lighter'
      const ox = w / 2
      const oy = h / 2
      const R = Math.min(w, h) * 0.3

      if (mode === 'pulse') {
        const alive =
          phase === 'listening' || phase === 'hearing' || phase === 'speaking'
        // A soft heartbeat even in silence, a burst on every rise.
        if (!reducedMotion && alive && now - lastRing > 2200) {
          rings.push({ r: R * 0.66, a: 0.35, w: 1 })
          lastRing = now
        }
        if (rising && !reducedMotion && now - lastRing > 120) {
          rings.push({ r: R * 0.66, a: 0.95, w: 2.2 })
          lastRing = now
        }
        for (let i = rings.length - 1; i >= 0; i--) {
          const ring = rings[i]
          ring.r += (1.6 + ring.w) * dpr
          ring.a -= 0.012
          if (ring.a <= 0 || ring.r > Math.min(w, h) / 2) {
            rings.splice(i, 1)
            continue
          }
          const grad = g.createLinearGradient(ox - ring.r, oy, ox + ring.r, oy)
          grad.addColorStop(0, `hsla(${hue}, ${sat}%, 72%, ${ring.a})`)
          grad.addColorStop(1, `hsla(${hue2}, ${sat}%, 72%, ${ring.a})`)
          g.strokeStyle = grad
          g.lineWidth = ring.w * dpr
          g.beginPath()
          g.arc(ox, oy, ring.r, 0, TAU)
          g.stroke()
        }
      } else if (mode === 'spectrum') {
        const bars = 144
        const r0 = R * 0.74
        g.lineCap = 'round'
        g.lineWidth = Math.max(1.5 * dpr, (r0 * TAU) / bars / 2)
        for (let i = 0; i < bars; i++) {
          const a = (i / bars) * TAU - Math.PI / 2
          const v = bandAt(bands, a + Math.PI / 2)
          const len = R * (0.04 + v * 0.5 * calm)
          const bh = mixHue(hue, hue2, i / bars)
          g.strokeStyle = `hsla(${bh}, ${sat}%, ${58 + v * 32}%, ${0.4 + v * 0.6})`
          g.beginPath()
          g.moveTo(ox + Math.cos(a) * r0, oy + Math.sin(a) * r0)
          g.lineTo(ox + Math.cos(a) * (r0 + len), oy + Math.sin(a) * (r0 + len))
          g.stroke()
          // A faint reflection inward.
          g.strokeStyle = `hsla(${bh}, ${sat}%, 70%, ${0.12 + v * 0.2})`
          g.beginPath()
          g.moveTo(
            ox + Math.cos(a) * (r0 - 4 * dpr),
            oy + Math.sin(a) * (r0 - 4 * dpr)
          )
          g.lineTo(
            ox + Math.cos(a) * (r0 - 4 * dpr - len * 0.25),
            oy + Math.sin(a) * (r0 - 4 * dpr - len * 0.25)
          )
          g.stroke()
        }
      } else if (mode === 'orbit') {
        g.lineCap = 'round'
        for (const p of particles) {
          const prev = p.a
          p.a += p.v * (1 + level * 6) * calm
          const r = R * p.r * (1 + level * 0.3)
          const tilt = 0.32 + p.tilt * 0.4
          const pos = (a: number) => ({
            x: ox + Math.cos(a) * r,
            y: oy + Math.sin(a) * r * tilt - Math.cos(a) * r * 0.12,
          })
          const depth = (Math.sin(p.a) + 1) / 2
          const a = (0.2 + depth * 0.6) * (0.6 + level)
          const now2 = pos(p.a)
          const was = pos(prev - p.v * 6)
          g.strokeStyle = `hsla(${mixHue(hue, hue2, depth)}, ${sat}%, 74%, ${clamp(a)})`
          g.lineWidth = p.s * dpr * (0.6 + depth) * (1 + level)
          g.beginPath()
          g.moveTo(was.x, was.y)
          g.lineTo(now2.x, now2.y)
          g.stroke()
        }
      } else if (mode === 'hologram') {
        // A HUD ring of ticks turning around the mark, and scan lines.
        const ticks = 90
        const rr = R * 0.86
        g.lineWidth = 1.2 * dpr
        for (let i = 0; i < ticks; i++) {
          const a = (i / ticks) * TAU + t * 0.25 * calm
          const v = bandAt(bands, a)
          const long = i % 5 === 0
          const len = R * ((long ? 0.07 : 0.035) + v * 0.18)
          g.strokeStyle = `hsla(${hue}, 100%, 72%, ${(long ? 0.55 : 0.28) + v * 0.4})`
          g.beginPath()
          g.moveTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr)
          g.lineTo(ox + Math.cos(a) * (rr + len), oy + Math.sin(a) * (rr + len))
          g.stroke()
        }
        g.lineWidth = 2 * dpr
        g.strokeStyle = `hsla(${hue2}, 100%, 70%, ${0.45 + level * 0.4})`
        g.beginPath()
        const sa = -t * 0.9 * calm
        g.arc(ox, oy, R * 1.1, sa, sa + 0.9 + level * 1.4)
        g.stroke()
        g.beginPath()
        g.arc(ox, oy, R * 1.1, sa + Math.PI, sa + Math.PI + 0.5)
        g.stroke()
        g.globalCompositeOperation = 'source-over'
        // Scan lines and the sweep stay inside a disc: a band cut off by
        // the canvas edge reads as a rendering bug, not as a hologram.
        g.save()
        g.beginPath()
        g.arc(ox, oy, R * 1.3, 0, TAU)
        g.clip()
        g.fillStyle = `hsla(${hue}, 100%, 70%, 0.05)`
        for (let y = 0; y < h; y += 3 * dpr) g.fillRect(0, y, w, dpr)
        const band = ((t * 0.32) % 1) * h
        const sweep = g.createLinearGradient(
          0,
          band - 50 * dpr,
          0,
          band + 50 * dpr
        )
        sweep.addColorStop(0, `hsla(${hue}, 100%, 70%, 0)`)
        sweep.addColorStop(0.5, `hsla(${hue}, 100%, 78%, ${0.1 + level * 0.3})`)
        sweep.addColorStop(1, `hsla(${hue}, 100%, 70%, 0)`)
        g.fillStyle = sweep
        g.fillRect(0, band - 50 * dpr, w, 100 * dpr)
        g.restore()
      } else if (mode === 'shatter') {
        if (rising && !reducedMotion) {
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * TAU
            const v = (2.5 + Math.random() * 6) * dpr
            shards.push({
              x: ox + Math.cos(a) * R * 0.5,
              y: oy + Math.sin(a) * R * 0.5,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              rot: Math.random() * TAU,
              spin: (Math.random() - 0.5) * 0.3,
              size: (3 + Math.random() * 6) * dpr,
              life: 1,
            })
          }
        }
        for (let i = shards.length - 1; i >= 0; i--) {
          const s = shards[i]
          s.x += s.vx
          s.y += s.vy
          s.vx *= 0.975
          s.vy *= 0.975
          s.rot += s.spin
          s.life -= 0.016
          if (s.life <= 0) {
            shards.splice(i, 1)
            continue
          }
          g.save()
          g.translate(s.x, s.y)
          g.rotate(s.rot)
          g.fillStyle = `hsla(${mixHue(hue, hue2, 1 - s.life)}, ${sat}%, 78%, ${s.life})`
          g.beginPath()
          g.moveTo(0, -s.size)
          g.lineTo(s.size * 0.8, s.size * 0.7)
          g.lineTo(-s.size * 0.8, s.size * 0.7)
          g.closePath()
          g.fill()
          g.restore()
        }
      }
      g.globalCompositeOperation = 'source-over'
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [mark])

  return (
    <button
      ref={rootRef}
      type="button"
      className={`voice-orb voice-orb--${mode} voice-orb--${phase}`}
      onClick={onTap}
      aria-label={label}
      data-testid="voice-orb"
    >
      <canvas ref={auraRef} className="voice-orb__aura" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className="voice-orb__canvas"
        aria-hidden="true"
      />
      {mark ? (
        <svg
          className="voice-orb__mark"
          viewBox={mark.viewBox}
          aria-hidden="true"
        >
          <g ref={groupRef}>
            {mark.facets.map((f, i) => (
              <path
                key={i}
                ref={el => {
                  facetRefs.current[i] = el
                }}
                d={f.d}
                fillRule="evenodd"
                stroke="rgba(4,4,8,0.9)"
                strokeWidth={1.6}
                strokeLinejoin="round"
              />
            ))}
          </g>
        </svg>
      ) : (
        <img className="voice-orb__mark" src={BRAND_MARK_URL} alt="" />
      )}
    </button>
  )
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Rank of each value among all of them: 0 for the smallest. */
function rankBy(values: number[]): number[] {
  const order = values
    .map((v, i) => [v, i] as const)
    .sort((a, b) => a[0] - b[0])
  const rank = new Array<number>(values.length)
  order.forEach(([, i], r) => (rank[i] = r))
  return rank
}
