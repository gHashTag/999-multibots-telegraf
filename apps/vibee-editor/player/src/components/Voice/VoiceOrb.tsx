/**
 * THE MARK THAT LISTENS AND SPEAKS.
 *
 * The 27 facets of the t27 mark, each driven by its own band of the sound:
 * the person's mic while they talk, the agent's voice while it answers, a
 * slow sweep while it thinks. A canvas behind the mark carries the glow and
 * the mode's own effect.
 *
 * Everything moves inside requestAnimationFrame by writing attributes on the
 * facets directly: sixty React renders a second would be the slowest possible
 * way to do this, and on a phone in Telegram's WebView the difference is the
 * difference between smooth and stuttering.
 */
import { useEffect, useRef, useState } from 'react'
import { BRAND_MARK_URL } from '@/components/BrandLoader/BrandLoader'
import type { VoicePhase } from '@/lib/voice/session'
import { parseMark, type Mark } from './logoFacets'

export const VOICE_MODES = [
  'pulse',
  'spectrum',
  'orbit',
  'hologram',
  'shatter',
] as const
export type VoiceMode = (typeof VOICE_MODES)[number]

const BANDS = 27
const LOW_HZ = 90
const HIGH_HZ = 7000

/** Hue and saturation per phase: one glance says whose turn it is. */
const PALETTE: Record<VoicePhase, [number, number]> = {
  off: [220, 10],
  starting: [220, 30],
  listening: [188, 95],
  hearing: [266, 85],
  thinking: [38, 95],
  speaking: [46, 100],
  error: [2, 85],
}

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
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
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
  live.current = { phase, mode, syntheticVoice, reducedMotion, getAnalyser }

  useEffect(() => {
    let alive = true
    void loadMark().then(m => alive && setMark(m))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!mark) return
    const canvas = canvasRef.current
    const g = canvasRef.current?.getContext('2d') ?? null
    // Facet order around the mark (spectrum) and from the core out (shatter).
    const byAngle = rankBy(mark.facets.map(f => f.angle))
    const freq = new Uint8Array(4096)
    const bands = new Float32Array(BANDS)
    const target = new Float32Array(BANDS)
    const particles: Particle[] = Array.from({ length: 140 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.55 + Math.random() * 0.75,
      v: (0.002 + Math.random() * 0.006) * (Math.random() < 0.5 ? -1 : 1),
      s: 0.6 + Math.random() * 1.8,
    }))
    const rings: Array<{ r: number; a: number }> = []
    const sparks: Spark[] = []
    let prevLevel = 0
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
          target[b] = clamp((v - 0.22) / 0.55)
        }
      } else if (
        phase === 'thinking' ||
        phase === 'starting' ||
        phase === 'hearing'
      ) {
        // No sound to read: a slow light travelling around the mark.
        const speed = phase === 'hearing' ? 1.4 : 0.55
        for (let b = 0; b < BANDS; b++) {
          const c = Math.cos(2 * Math.PI * (b / BANDS - t * speed))
          target[b] = 0.12 + 0.6 * Math.pow(Math.max(0, c), 6)
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
      const rising = level - prevLevel > 0.06
      prevLevel = level

      const [hue, sat] = PALETTE[phase]
      const { cx, cy } = mark

      // ---- the facets ----
      const group = groupRef.current
      if (group) {
        let gT = ''
        if (mode === 'pulse') {
          const s = 1 + level * 0.22
          gT = `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`
        } else if (mode === 'orbit') {
          gT = `rotate(${(t * 10 + level * 40) * calm} ${cx} ${cy})`
        } else if (mode === 'spectrum') {
          const s = 1 + level * 0.06
          gT = `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`
        } else if (mode === 'hologram') {
          const wob = Math.sin(t * 2) * 2 * calm
          gT = `translate(0 ${wob})`
        }
        group.setAttribute('transform', gT)
      }
      mark.facets.forEach((f, i) => {
        const el = facetRefs.current[i]
        if (!el) return
        const band = bands[byAngle[i] % BANDS]
        let light = 70 + level * 30
        let alpha = 0.92
        let tr = ''
        switch (mode) {
          case 'pulse':
            light = 62 + band * 38
            break
          case 'spectrum':
            light = 30 + band * 70
            alpha = 0.55 + band * 0.45
            break
          case 'orbit':
            light = 65 + band * 35
            break
          case 'hologram': {
            light = 55 + band * 40
            alpha = 0.35 + band * 0.55
            // Glitch: a few facets slip sideways on loud moments.
            if (level > 0.28 && Math.random() < level * 0.25 * calm) {
              tr = `translate(${(Math.random() - 0.5) * 40 * level} 0)`
            }
            break
          }
          case 'shatter': {
            const dx = f.cx - cx
            const dy = f.cy - cy
            const len = Math.hypot(dx, dy) || 1
            const push = band * 70 * (0.35 + f.radius) * calm
            const spin = band * 18 * (i % 2 ? 1 : -1) * calm
            tr = `translate(${(dx / len) * push} ${(dy / len) * push}) rotate(${spin} ${f.cx} ${f.cy})`
            light = 60 + band * 40
            break
          }
        }
        el.setAttribute('transform', tr)
        el.setAttribute(
          'fill',
          `hsla(${hue}, ${sat}%, ${Math.min(100, light)}%, ${alpha})`
        )
      })

      // ---- the canvas behind ----
      if (!canvas || !g) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.round(canvas.clientWidth * dpr)
      const h = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      g.clearRect(0, 0, w, h)
      const ox = w / 2
      const oy = h / 2
      const R = Math.min(w, h) * 0.36

      const glow = g.createRadialGradient(
        ox,
        oy,
        R * 0.1,
        ox,
        oy,
        R * (1.1 + level * 0.9)
      )
      glow.addColorStop(0, `hsla(${hue}, ${sat}%, 60%, ${0.18 + level * 0.5})`)
      glow.addColorStop(1, `hsla(${hue}, ${sat}%, 50%, 0)`)
      g.fillStyle = glow
      g.fillRect(0, 0, w, h)

      if (mode === 'pulse') {
        if (rising && !reducedMotion) rings.push({ r: R * 0.7, a: 0.9 })
        g.lineWidth = 2 * dpr
        for (let i = rings.length - 1; i >= 0; i--) {
          const ring = rings[i]
          ring.r += 2.6 * dpr
          ring.a -= 0.014
          if (ring.a <= 0) {
            rings.splice(i, 1)
            continue
          }
          g.strokeStyle = `hsla(${hue}, ${sat}%, 70%, ${ring.a})`
          g.beginPath()
          g.arc(ox, oy, ring.r, 0, Math.PI * 2)
          g.stroke()
        }
      } else if (mode === 'spectrum') {
        const bars = 108
        g.lineCap = 'round'
        g.lineWidth = Math.max(2, (R * 2 * Math.PI) / bars / 2.2)
        for (let i = 0; i < bars; i++) {
          const a = (i / bars) * Math.PI * 2 - Math.PI / 2
          const mirrored = i < bars / 2 ? i : bars - 1 - i
          const v = bands[Math.floor((mirrored / (bars / 2)) * (BANDS - 1))]
          const len = R * (0.05 + v * 0.42 * calm)
          const r0 = R * 1.02
          g.strokeStyle = `hsla(${(hue + v * 40) % 360}, ${sat}%, ${55 + v * 35}%, ${0.35 + v * 0.65})`
          g.beginPath()
          g.moveTo(ox + Math.cos(a) * r0, oy + Math.sin(a) * r0)
          g.lineTo(ox + Math.cos(a) * (r0 + len), oy + Math.sin(a) * (r0 + len))
          g.stroke()
        }
      } else if (mode === 'orbit') {
        for (const p of particles) {
          p.a += p.v * (1 + level * 5) * calm
          const r = R * p.r * (1 + level * 0.3)
          const x = ox + Math.cos(p.a) * r
          const y = oy + Math.sin(p.a) * r * 0.62
          g.fillStyle = `hsla(${hue}, ${sat}%, 75%, ${0.25 + level * 0.7})`
          g.beginPath()
          g.arc(x, y, p.s * dpr * (1 + level), 0, Math.PI * 2)
          g.fill()
        }
      } else if (mode === 'hologram') {
        g.fillStyle = `hsla(${hue}, 100%, 70%, 0.06)`
        for (let y = 0; y < h; y += 4 * dpr) g.fillRect(0, y, w, dpr)
        const band = ((t * 0.35) % 1) * h
        const sweep = g.createLinearGradient(
          0,
          band - 40 * dpr,
          0,
          band + 40 * dpr
        )
        sweep.addColorStop(0, `hsla(${hue}, 100%, 70%, 0)`)
        sweep.addColorStop(
          0.5,
          `hsla(${hue}, 100%, 75%, ${0.12 + level * 0.3})`
        )
        sweep.addColorStop(1, `hsla(${hue}, 100%, 70%, 0)`)
        g.fillStyle = sweep
        g.fillRect(0, band - 40 * dpr, w, 80 * dpr)
      } else if (mode === 'shatter') {
        if (rising && !reducedMotion) {
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2
            const v = (2 + Math.random() * 5) * dpr
            sparks.push({
              x: ox,
              y: oy,
              vx: Math.cos(a) * v,
              vy: Math.sin(a) * v,
              life: 1,
            })
          }
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i]
          s.x += s.vx
          s.y += s.vy
          s.vx *= 0.985
          s.vy *= 0.985
          s.life -= 0.018
          if (s.life <= 0) {
            sparks.splice(i, 1)
            continue
          }
          g.fillStyle = `hsla(${hue}, ${sat}%, 80%, ${s.life})`
          g.beginPath()
          g.moveTo(s.x, s.y - 4 * dpr)
          g.lineTo(s.x + 3 * dpr, s.y + 3 * dpr)
          g.lineTo(s.x - 3 * dpr, s.y + 3 * dpr)
          g.closePath()
          g.fill()
        }
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [mark])

  return (
    <button
      type="button"
      className={`voice-orb voice-orb--${mode} voice-orb--${phase}`}
      onClick={onTap}
      aria-label={label}
      data-testid="voice-orb"
    >
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
                stroke="rgba(0,0,0,0.85)"
                strokeWidth={1.2}
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
