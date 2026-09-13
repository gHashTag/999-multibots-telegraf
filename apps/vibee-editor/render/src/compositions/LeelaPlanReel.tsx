import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  random,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { z } from 'zod'
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit'
import { loadFont as loadInter } from '@remotion/google-fonts/Inter'
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  LEELA_BOT,
  LEELA_CTA_EN,
  LEELA_CTA_RU,
  LEELA_PLAY_EN,
  LEELA_PLAY_RU,
  LEELA_TAGLINE_EN,
  LEELA_TAGLINE_RU,
  LEELA_URL,
  PLAN_COUNT,
  START_LOKA,
  WIN_LOKA,
  boardCell,
  canonQuote,
  planInfo,
  type LeelaLang,
} from '../agent/leela-canon'

/**
 * LeelaPlanReel -- one throw, one plan, one observation.
 *
 * The visual contract comes from the 3D board of t27.ai/leela (research brief
 * leela-visual.md, section 6), not from a mood board:
 *
 *   1. Background is pure #000000 with a sparse star field. No gradients, no
 *      nebulae, no purple glow. The strongest colour on screen carries
 *      meaning (snake / arrow / 68 / CTA); everything else is near-monochrome.
 *   2. The board is a white silk web 9x8 with matte glass panes. NO filled
 *      cells, no coloured squares. 72 is top-left, 68 is the centre of the top
 *      row and has no digit: the Flower of Life sits there instead.
 *   3. The die shows pips, never a digit. Before the throw it is empty and
 *      pulses; the throw is a 420 ms tumble to a six.
 *   4. Every word on screen is canon or a prop. The template never invents
 *      teaching, never praises, never hurries.
 *   5. Green #00ff88 appears only on the CTA pill; gold only on the title
 *      rule and on the card bar of plan 68.
 */

// Outfit carries no Cyrillic subset; Inter (same geometric class) is the
// fallback the brief allows, so RU copy does not drop to a random system font.
const { fontFamily: outfitFamily } = loadOutfit('normal', {
  weights: ['300', '400', '500'],
  subsets: ['latin', 'latin-ext'],
})
const { fontFamily: interFamily } = loadInter('normal', {
  weights: ['300', '400', '500'],
  subsets: ['cyrillic', 'latin'],
})
const FONT = `${outfitFamily}, ${interFamily}, system-ui, -apple-system, 'Segoe UI', sans-serif`

// Palette (leela-visual section 1.1 / 6).
const BG = '#000000'
const SURFACE = '#0b0d0f'
const TEXT = '#ffffff'
const HINT = '#888888'
const RULE = 'rgba(255,255,255,.08)'
const GOLDEN = '#ffd700'
const WIN = '#e0b544'
const SNAKE_UI = '#f08a72'
const ARROW_UI = '#5fc684'
const ACCENT = '#00ff88'
const SNAKE_SKIN = '#4c5240'
const SNAKE_BLOTCH = '#7d3a2c'
const SNAKE_INLAY = '#8c3a2a'
const ARROW_INLAY = '#35624a'
const ARROW_SHAFT = '#e9e3d6'
const ARROW_STEEL = '#e4e9ee'
const ARROW_FLETCH = '#f7f5f0'
const LOTUS = '#2f5fd0'
const LOTUS_HALO = '#f0c34a'

// Frame geometry: 1080x1920 with Reels/Stories safe areas.
const W = 1080
const SAFE_TOP = 250
const SAFE_BOTTOM = 380
const SAFE_RIGHT = 130
// Content column: symmetric around x=540 and clear of the right-hand icons.
const CONTENT_LEFT = SAFE_RIGHT
const CONTENT_WIDTH = W - 2 * SAFE_RIGHT // 820
const TITLE_BAND_TOP = 320
const BOARD_CENTER_Y = 975
const CELL = CONTENT_WIDTH / BOARD_COLUMNS // ~91 px
const BOARD_W = CONTENT_WIDTH
const BOARD_H = CELL * BOARD_ROWS

// Type scale phi: 40 / 51 / 65 / 82 / 105.
const F0 = 40
const F1 = 51
const F2 = 65
const F3 = 82
const F4 = 105

/** The storyboard is written in seconds of a 12 s reel; other lengths scale. */
const STORY_SECONDS = 12

const UI = {
  ru: {
    row: 'ряд',
    snake: 'змея',
    arrow: 'стрела',
    tagline: LEELA_TAGLINE_RU,
    play: LEELA_PLAY_RU,
    cta: LEELA_CTA_RU,
  },
  en: {
    row: 'row',
    snake: 'snake',
    arrow: 'arrow',
    tagline: LEELA_TAGLINE_EN,
    play: LEELA_PLAY_EN,
    cta: LEELA_CTA_EN,
  },
} as const

export const LeelaPlanReelSchema = z.object({
  lang: z.enum(['ru', 'en']).default('ru'),
  /** Plan number 1..72. */
  plan: z.number().int().min(1).max(PLAN_COUNT),
  /** Hook, <= 12 words. Default: the plan's approved hook, else its title. */
  hook: z.string().optional(),
  /** Quote from the canonical text, <= 220 chars. Default: first sentence(s). */
  quote: z.string().optional(),
  /** One soft observation question. Absent = the act is skipped. */
  question: z.string().optional(),
  cta: z.string().optional(),
  handle: z.string().optional(),
  url: z.string().optional(),
  showBoard: z.boolean().default(true),
  /** Optional music track; silent when absent. */
  music: z.string().optional(),
  musicVolume: z.number().default(0.05),
})

export type LeelaPlanReelProps = z.infer<typeof LeelaPlanReelSchema>

export interface ResolvedLeelaProps {
  lang: LeelaLang
  plan: number
  title: string
  hook: string
  quote: string
  question: string
  cta: string
  handle: string
  url: string
  showBoard: boolean
  event: 'snake' | 'arrow' | 'none'
  to?: number
  rowIndex: number
  chakra: string
}

/** Fill every optional prop from the canon so nothing on screen is invented. */
export function resolveLeelaProps(
  input: Partial<LeelaPlanReelProps> & { plan: number }
): ResolvedLeelaProps {
  const p = LeelaPlanReelSchema.parse(input)
  const info = planInfo(p.plan, p.lang)
  return {
    lang: p.lang,
    plan: info.plan,
    title: info.title,
    hook: (p.hook ?? '').trim() || info.hooks[0] || info.title,
    quote: (p.quote ?? '').trim() || canonQuote(info.description, 220),
    question: (p.question ?? '').trim(),
    cta: (p.cta ?? '').trim() || UI[p.lang].cta,
    handle: (p.handle ?? '').trim() || LEELA_BOT,
    url: (p.url ?? '').trim() || LEELA_URL,
    showBoard: p.showBoard,
    event: info.event,
    ...(info.to !== undefined ? { to: info.to } : {}),
    rowIndex: info.row,
    chakra: info.chakra,
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** Linear 0..1 progress of a window [from, to] in seconds. */
const win = (t: number, from: number, to: number) =>
  clamp01((t - from) / Math.max(0.0001, to - from))
const easeOut = Easing.out(Easing.cubic)
const tumbleEase = Easing.bezier(0.12, 0.8, 0.2, 1)

/** Fade + 12 px rise, the only entrance the brief allows for text. */
const rise = (k: number): React.CSSProperties => ({
  opacity: k,
  transform: `translateY(${(1 - k) * 12}px)`,
})

/** Cell centre in board pixels (origin top-left of the board). */
function cellCenter(plan: number): { x: number; y: number } {
  const { col, row } = boardCell(plan)
  return {
    x: (col + 0.5) * CELL,
    y: (BOARD_ROWS - 1 - row + 0.5) * CELL,
  }
}

type Pt = { x: number; y: number }

/** Snake: a wavy polyline from head to tail, 24 samples, ~2.5 waves. */
function snakePoints(from: number, to: number): Pt[] {
  const a = cellCenter(from)
  const b = cellCenter(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const amp = CELL * 0.32
  const n = 24
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const s = i / n
    // Taper the wave at both ends so head and tail sit on their cells.
    const w = Math.sin(s * Math.PI * 2.5) * amp * Math.sin(s * Math.PI)
    pts.push({ x: a.x + dx * s + nx * w, y: a.y + dy * s + ny * w })
  }
  return pts
}

function polylinePoint(pts: Pt[], s: number): Pt {
  const k = clamp01(s) * (pts.length - 1)
  const i = Math.min(pts.length - 2, Math.floor(k))
  const f = k - i
  return {
    x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
    y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
  }
}

/** Arrow: a quadratic arc lifted to the side, as the 3D scene flies it. */
function arrowArc(from: number, to: number): { a: Pt; c: Pt; b: Pt } {
  const a = cellCenter(from)
  const b = cellCenter(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  // Lift towards the board centre so long arrows do not leave the board.
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const toCenter = { x: BOARD_W / 2 - mid.x, y: BOARD_H / 2 - mid.y }
  let nx = -dy / len
  let ny = dx / len
  if (nx * toCenter.x + ny * toCenter.y < 0) {
    nx = -nx
    ny = -ny
  }
  const lift = Math.max(CELL * 0.9, len * 0.22)
  return { a, c: { x: mid.x + nx * lift, y: mid.y + ny * lift }, b }
}

function quadPoint(q: { a: Pt; c: Pt; b: Pt }, s: number): Pt {
  const t = clamp01(s)
  const u = 1 - t
  return {
    x: u * u * q.a.x + 2 * u * t * q.c.x + t * t * q.b.x,
    y: u * u * q.a.y + 2 * u * t * q.c.y + t * t * q.b.y,
  }
}

/** Flower of Life: 19 circles on a hexagonal lattice, radius = 0.15 cell. */
const FlowerOfLife: React.FC<{ cx: number; cy: number }> = ({ cx, cy }) => {
  const r = CELL * 0.15
  const centers: Pt[] = [{ x: 0, y: 0 }]
  for (let ring = 1; ring <= 2; ring++) {
    for (let side = 0; side < 6; side++) {
      const a0 = (Math.PI / 3) * side
      const a1 = (Math.PI / 3) * (side + 1)
      const p0 = { x: Math.cos(a0) * r * ring, y: Math.sin(a0) * r * ring }
      const p1 = { x: Math.cos(a1) * r * ring, y: Math.sin(a1) * r * ring }
      for (let k = 0; k < ring; k++) {
        const f = k / ring
        centers.push({ x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f })
      }
    }
  }
  return (
    <g stroke={WIN} strokeWidth={1} fill="none" opacity={0.85}>
      {centers.map((c, i) => (
        <circle key={i} cx={cx + c.x} cy={cy + c.y} r={r} />
      ))}
    </g>
  )
}

/** The piece: an eight-petal lotus silhouette with a thin halo. */
const Lotus: React.FC<{ x: number; y: number; scale: number; opacity: number }> = ({
  x,
  y,
  scale,
  opacity,
}) => {
  const R = CELL * 0.34
  const r = R * 0.55
  const pts: string[] = []
  for (let i = 0; i < 16; i++) {
    const ang = (Math.PI / 8) * i - Math.PI / 2
    const rad = i % 2 === 0 ? R : r
    pts.push(`${(Math.cos(ang) * rad).toFixed(2)},${(Math.sin(ang) * rad).toFixed(2)}`)
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
      <circle r={R * 1.18} fill="none" stroke={LOTUS_HALO} strokeWidth={2} opacity={0.85} />
      <polygon points={pts.join(' ')} fill={LOTUS} />
      <circle r={R * 0.22} fill={LOTUS_HALO} opacity={0.9} />
    </g>
  )
}

interface BoardProps {
  plan: number
  event: 'snake' | 'arrow' | 'none'
  to?: number
  /** Piece position in board pixels; null hides it. */
  piece: { x: number; y: number; scale: number; opacity: number } | null
}

/** White silk web 9x8 with matte glass panes, digits, path and inlays. */
const Board: React.FC<BoardProps> = ({ plan, event, to, piece }) => {
  const digits: React.ReactNode[] = []
  const panes: React.ReactNode[] = []
  const inset = CELL * 0.05
  for (let p = 1; p <= PLAN_COUNT; p++) {
    const { x, y } = cellCenter(p)
    panes.push(
      <rect
        key={`pane${p}`}
        x={x - CELL / 2 + inset}
        y={y - CELL / 2 + inset}
        width={CELL - inset * 2}
        height={CELL - inset * 2}
        fill="rgba(255,255,255,.07)"
      />
    )
    if (p === WIN_LOKA) {
      digits.push(<FlowerOfLife key="fol" cx={x} cy={y} />)
    } else {
      digits.push(
        <text
          key={`d${p}`}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fill={TEXT}
          fontFamily={FONT}
          fontWeight={300}
          fontSize={CELL * 0.5}
          style={{ letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}
        >
          {p}
        </text>
      )
    }
  }

  // Threads: horizontals and verticals only, frame brighter, slight sag.
  const threads: React.ReactNode[] = []
  for (let c = 0; c <= BOARD_COLUMNS; c++) {
    const x = c * CELL
    const edge = c === 0 || c === BOARD_COLUMNS
    const sag = edge ? 0 : 3
    threads.push(
      <path
        key={`v${c}`}
        d={`M ${x} 0 Q ${x + sag} ${BOARD_H / 2} ${x} ${BOARD_H}`}
        stroke={edge ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.7)'}
        strokeWidth={edge ? 1.5 : 1}
        fill="none"
      />
    )
  }
  for (let r = 0; r <= BOARD_ROWS; r++) {
    const y = r * CELL
    const edge = r === 0 || r === BOARD_ROWS
    const sag = edge ? 0 : 3
    threads.push(
      <path
        key={`h${r}`}
        d={`M 0 ${y} Q ${BOARD_W / 2} ${y + sag} ${BOARD_W} ${y}`}
        stroke={edge ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.7)'}
        strokeWidth={edge ? 1.5 : 1}
        fill="none"
      />
    )
  }
  const nodes: React.ReactNode[] = []
  for (let c = 0; c <= BOARD_COLUMNS; c++) {
    for (let r = 0; r <= BOARD_ROWS; r++) {
      nodes.push(<circle key={`n${c}-${r}`} cx={c * CELL} cy={r * CELL} r={1.5} fill={TEXT} />)
    }
  }

  // The current plan's path, if it is the start of a snake or an arrow.
  let path: React.ReactNode = null
  if (event === 'snake' && to) {
    const pts = snakePoints(plan, to)
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    const head = pts[0]
    path = (
      <g>
        <path
          d={d}
          stroke={SNAKE_SKIN}
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={0.95}
        />
        {pts
          .filter((_, i) => i % 3 === 1)
          .map((p, i) => (
            <ellipse key={i} cx={p.x} cy={p.y} rx={4.5} ry={3} fill={SNAKE_BLOTCH} opacity={0.9} />
          ))}
        <circle cx={head.x} cy={head.y} r={8} fill={SNAKE_SKIN} />
      </g>
    )
  } else if (event === 'arrow' && to) {
    const q = arrowArc(plan, to)
    const tip = q.b
    const before = quadPoint(q, 0.96)
    const ang = Math.atan2(tip.y - before.y, tip.x - before.x)
    const headLen = 16
    const hx = tip.x - Math.cos(ang) * headLen
    const hy = tip.y - Math.sin(ang) * headLen
    const px = -Math.sin(ang) * 6
    const py = Math.cos(ang) * 6
    const foot = q.a
    const after = quadPoint(q, 0.04)
    const fang = Math.atan2(after.y - foot.y, after.x - foot.x)
    const fletch = (k: number, side: number) => {
      const bx = foot.x + Math.cos(fang) * k
      const by = foot.y + Math.sin(fang) * k
      const ex = bx - Math.cos(fang) * 10 - Math.sin(fang) * 7 * side
      const ey = by - Math.sin(fang) * 10 + Math.cos(fang) * 7 * side
      return `M ${bx.toFixed(1)} ${by.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`
    }
    path = (
      <g>
        <path
          d={`M ${q.a.x} ${q.a.y} Q ${q.c.x} ${q.c.y} ${q.b.x} ${q.b.y}`}
          stroke={ARROW_SHAFT}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
        />
        <polygon
          points={`${tip.x},${tip.y} ${hx + px},${hy + py} ${hx - px},${hy - py}`}
          fill={ARROW_STEEL}
        />
        <path
          d={[fletch(10, 1), fletch(10, -1), fletch(20, 1), fletch(20, -1)].join(' ')}
          stroke={ARROW_FLETCH}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      </g>
    )
  }

  // Start-cell inlay (2 px) and the highlight ring of the current plan.
  const cur = cellCenter(plan)
  const inlayColor = event === 'snake' ? SNAKE_INLAY : event === 'arrow' ? ARROW_INLAY : null

  return (
    <svg
      width={BOARD_W}
      height={BOARD_H}
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      style={{ overflow: 'visible', display: 'block' }}
    >
      {panes}
      {threads}
      {nodes}
      {digits}
      {path}
      {inlayColor ? (
        <rect
          x={cur.x - CELL / 2 + 3}
          y={cur.y - CELL / 2 + 3}
          width={CELL - 6}
          height={CELL - 6}
          fill="none"
          stroke={inlayColor}
          strokeWidth={2}
        />
      ) : null}
      <rect
        x={cur.x - CELL / 2 + 1}
        y={cur.y - CELL / 2 + 1}
        width={CELL - 2}
        height={CELL - 2}
        rx={4}
        fill="none"
        stroke={TEXT}
        strokeWidth={2}
        opacity={0.9}
      />
      {piece ? <Lotus x={piece.x} y={piece.y} scale={piece.scale} opacity={piece.opacity} /> : null}
    </svg>
  )
}

interface DieProps {
  size: number
  /** 0 = empty face (before the throw), 6 = the resting face. */
  value: 0 | 6
  /** Pulse phase 0..1 for the invite ring; null = no ring. */
  pulse: number | null
  rotation: number
  scale: number
  opacity: number
}

/** Flat UI die as in the 3D header: 2 px white border, 9-dot pip grid. */
const Die: React.FC<DieProps> = ({ size, value, pulse, rotation, scale, opacity }) => {
  const ringW = pulse === null ? 0 : 6 * Math.sin(pulse * Math.PI)
  const pip = size * 0.12
  const pipGrid = [0, 1, 2].flatMap(r => [0, 1, 2].map(c => ({ r, c })))
  const six = (r: number, c: number) => c !== 1 && value === 6
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '27%',
        border: `2px solid ${TEXT}`,
        background: 'rgba(11,13,15,.6)',
        boxShadow: pulse === null ? 'none' : `0 0 0 ${ringW}px rgba(255,255,255,.14)`,
        transform: `rotate(${rotation}deg) scale(${scale})`,
        opacity,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        padding: size * 0.16,
        boxSizing: 'border-box',
        placeItems: 'center',
      }}
    >
      {pipGrid.map(({ r, c }) => (
        <div
          key={`${r}${c}`}
          style={{
            width: pip,
            height: pip,
            borderRadius: '50%',
            background: TEXT,
            opacity: six(r, c) ? 1 : 0,
          }}
        />
      ))}
    </div>
  )
}

/** Sparse star field, deterministic per plan, 1-2 px white dots. */
const Stars: React.FC<{ plan: number; opacity: number }> = ({ plan, opacity }) => {
  const { width, height } = useVideoConfig()
  const stars = React.useMemo(
    () =>
      Array.from({ length: 240 }, (_, i) => ({
        x: random(`leela-sx-${plan}-${i}`) * width,
        y: random(`leela-sy-${plan}-${i}`) * height,
        r: 1 + random(`leela-sr-${plan}-${i}`),
        o: 0.35 + random(`leela-so-${plan}-${i}`) * 0.65,
      })),
    [plan, width, height]
  )
  return (
    <AbsoluteFill style={{ opacity }}>
      {stars.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.r,
            height: s.r,
            borderRadius: '50%',
            background: TEXT,
            opacity: s.o,
          }}
        />
      ))}
    </AbsoluteFill>
  )
}

/** Font size that keeps a hook within two or three lines of the 820 px column. */
function hookSize(text: string): number {
  if (text.length <= 44) return F2
  if (text.length <= 62) return 56
  return 48
}

function quoteSize(text: string): number {
  if (text.length <= 130) return F0
  if (text.length <= 175) return 36
  return 32
}

export const LeelaPlanReel: React.FC<LeelaPlanReelProps> = rawProps => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const props = React.useMemo(() => resolveLeelaProps(rawProps), [rawProps])
  const ui = UI[props.lang]
  // Storyboard time in "12-second seconds": acts scale with the duration.
  const t = (frame / durationInFrames) * STORY_SECONDS

  // --- Act 0: stars + empty die (0-1 s) -------------------------------------
  const starsK = win(t, 0, 0.6)

  // --- Act 1: title (1-2.5 s), fades before the hook -------------------------
  const titleIn = easeOut(win(t, 1.0, 1.4))
  const ruleK = win(t, 1.25, 1.55)
  const tagIn = easeOut(win(t, 1.45, 1.85))
  const titleOut = 1 - win(t, 4.6, 5.0)

  // --- Act 2: the throw (2.5-2.92 s) ----------------------------------------
  const tumble = tumbleEase(win(t, 2.5, 2.92))
  const dieValue: 0 | 6 = tumble > 0.5 ? 6 : 0
  const dieScale = 1 + 0.06 * (tumble < 0.55 ? tumble / 0.55 : (1 - tumble) / 0.45)
  const pulse = t < 2.5 ? ((t % 2.4) / 2.4) : null
  const dieOut = 1 - win(t, 3.0, 3.4)

  // --- Act 3: board tilts in (3-4.2 s) and the lotus moves (to 5 s) ---------
  const boardIn = easeOut(win(t, 3.0, 4.2))
  const boardTilt = 35 + (1 - boardIn) * 40
  const boardDim = 1 - 0.2 * win(t, 6.5, 6.82)
  const endOut = 1 - win(t, 10.3, 10.7)

  let piece: BoardProps['piece'] = null
  if (props.showBoard) {
    const HOP = 0.26
    if (props.plan === START_LOKA) {
      // Waiting on 68, then hops 1 -> 6 after the six.
      const stops = [WIN_LOKA, 1, 2, 3, 4, 5, START_LOKA]
      const start = 3.4
      const k = (t - start) / HOP
      const appear = win(t, 3.1, 3.4)
      if (k <= 0) {
        const c = cellCenter(WIN_LOKA)
        piece = { ...c, scale: 1, opacity: appear }
      } else {
        const i = Math.min(stops.length - 2, Math.floor(k))
        const f = k >= stops.length - 1 ? 1 : clamp01(k - i)
        const a = cellCenter(stops[i])
        const b = cellCenter(stops[i + 1])
        const lift = Math.sin(f * Math.PI)
        piece = {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f - lift * CELL * 0.3,
          scale: 1 + 0.22 * lift,
          opacity: 1,
        }
      }
    } else {
      const appear = win(t, 3.6, 3.9)
      const start = cellCenter(props.plan)
      piece = { ...start, scale: 1, opacity: appear }
      if (props.event !== 'none' && props.to) {
        // Two hops along the drawn path: to its middle, then to the end.
        const s = clamp01((t - 4.2) / (HOP * 2))
        if (s > 0) {
          const pos =
            props.event === 'snake'
              ? polylinePoint(snakePoints(props.plan, props.to), s)
              : quadPoint(arrowArc(props.plan, props.to), s)
          const lift = Math.sin(((s * 2) % 1) * Math.PI) * (s < 1 ? 1 : 0)
          piece = {
            x: pos.x,
            y: pos.y - lift * CELL * 0.3,
            scale: 1 + 0.22 * lift,
            opacity: 1,
          }
        }
      }
    }
  }

  // --- Act 4: hook (5-6.5 s), replaced by the question if one is given ------
  const hookIn = easeOut(win(t, 5.0, 5.4))
  const hasQuestion = props.question.length > 0
  const hookOut = hasQuestion ? 1 - win(t, 9.4, 9.7) : 1
  const questionIn = hasQuestion ? easeOut(win(t, 9.6, 10.0)) : 0

  // --- Act 5: card slides up (6.5-6.82 s) -----------------------------------
  const cardIn = easeOut(win(t, 6.5, 6.82))
  const barColor =
    props.plan === WIN_LOKA
      ? WIN
      : props.event === 'snake'
        ? SNAKE_UI
        : props.event === 'arrow'
          ? ARROW_UI
          : HINT
  const progress = Math.min(props.plan, WIN_LOKA) / WIN_LOKA

  // --- Act 6: end card (10.5-12 s) ------------------------------------------
  const endIn = easeOut(win(t, 10.5, 10.9))

  const eventHint =
    props.event === 'snake' && props.to
      ? ` · ${ui.snake} ${props.plan} → ${props.to}`
      : props.event === 'arrow' && props.to
        ? ` · ${ui.arrow} ${props.plan} → ${props.to}`
        : ''

  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: FONT, color: TEXT }}>
      <Stars plan={props.plan} opacity={starsK} />

      {/* Title band: Leela / gold rule / tagline, then the hook or question. */}
      {t < 5 ? (
        <div
          style={{
            position: 'absolute',
            left: CONTENT_LEFT,
            width: CONTENT_WIDTH,
            top: TITLE_BAND_TOP + 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            opacity: titleOut,
          }}
        >
          <div style={{ ...rise(titleIn), fontSize: F4, fontWeight: 500, lineHeight: 1.1 }}>
            Leela
          </div>
          <div
            style={{
              width: 110 * ruleK,
              height: 4,
              background: GOLDEN,
              marginTop: 22,
              marginBottom: 26,
              alignSelf: 'flex-start',
              marginLeft: CONTENT_WIDTH / 2 - 55,
            }}
          />
          <div
            style={{
              ...rise(tagIn),
              fontSize: F1,
              fontWeight: 400,
              color: HINT,
              textAlign: 'center',
              lineHeight: 1.3,
            }}
          >
            {ui.tagline}
          </div>
        </div>
      ) : null}

      {t >= 5 && t < 10.7 ? (
        <div
          style={{
            position: 'absolute',
            left: CONTENT_LEFT,
            width: CONTENT_WIDTH,
            top: TITLE_BAND_TOP,
            height: 380,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: endOut,
          }}
        >
          {hasQuestion && t >= 9.55 ? (
            <div
              style={{
                ...rise(questionIn),
                fontSize: F0,
                fontWeight: 400,
                lineHeight: 1.4,
                textAlign: 'center',
                color: TEXT,
              }}
            >
              {props.question}
            </div>
          ) : (
            <div
              style={{
                ...rise(hookIn),
                opacity: hookIn * hookOut,
                fontSize: hookSize(props.hook),
                fontWeight: 500,
                lineHeight: 1.2,
                textAlign: 'center',
                overflowWrap: 'break-word',
              }}
            >
              {props.hook}
            </div>
          )}
        </div>
      ) : null}

      {/* Intro die: empty and pulsing, then the tumble to six. */}
      {t < 3.4 ? (
        <div
          style={{
            position: 'absolute',
            left: W / 2 - 100,
            top: BOARD_CENTER_Y - 100,
          }}
        >
          <Die
            size={200}
            value={dieValue}
            pulse={pulse}
            rotation={720 * tumble}
            scale={dieScale}
            opacity={dieOut}
          />
        </div>
      ) : null}

      {/* Board at a perspective tilt. */}
      {props.showBoard && t >= 3.0 && t < 10.7 ? (
        <div
          style={{
            position: 'absolute',
            left: CONTENT_LEFT,
            top: BOARD_CENTER_Y - BOARD_H / 2,
            width: BOARD_W,
            height: BOARD_H,
            perspective: 2400,
            perspectiveOrigin: '50% 50%',
            opacity: boardIn * boardDim * endOut,
          }}
        >
          <div
            style={{
              width: BOARD_W,
              height: BOARD_H,
              transform: `scale(0.9) rotateX(${boardTilt}deg)`,
              transformOrigin: '50% 50%',
              transformStyle: 'preserve-3d',
            }}
          >
            <Board plan={props.plan} event={props.event} to={props.to} piece={piece} />
          </div>
        </div>
      ) : null}

      {/* Plan card: the sheet, bottom-anchored above the safe area. */}
      {t >= 6.5 && t < 10.7 ? (
        <div
          style={{
            position: 'absolute',
            left: CONTENT_LEFT,
            width: CONTENT_WIDTH,
            bottom: SAFE_BOTTOM,
            transform: `translateY(${(1 - cardIn) * 700}px)`,
            opacity: endOut,
            background: SURFACE,
            borderRadius: 14,
            borderTop: `1px solid ${RULE}`,
            padding: '28px 32px 24px 36px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 24,
              bottom: 24,
              width: 3,
              background: barColor,
              borderRadius: 2,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 22 }}>
            <div
              style={{
                fontSize: F3,
                fontWeight: 500,
                lineHeight: 1,
                letterSpacing: '-0.025em',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {props.plan}
            </div>
            <div style={{ fontSize: F0, fontWeight: 500, lineHeight: 1.2 }}>{props.title}</div>
          </div>
          <div
            style={{
              fontSize: quoteSize(props.quote),
              fontWeight: 400,
              lineHeight: 1.5,
              color: TEXT,
              overflowWrap: 'break-word',
            }}
          >
            {props.quote}
          </div>
          <div style={{ fontSize: 28, color: HINT, lineHeight: 1.3 }}>
            {ui.row} {props.rowIndex} · {props.chakra}
            {eventHint}
          </div>
          <div style={{ height: 3, background: RULE, borderRadius: 2, marginTop: 4 }}>
            <div
              style={{
                width: `${progress * 100}%`,
                height: 3,
                background: 'rgba(255,255,255,.6)',
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* End card: die with six, CTA, pill, handle and url. */}
      {t >= 10.5 ? (
        <div
          style={{
            position: 'absolute',
            left: CONTENT_LEFT,
            width: CONTENT_WIDTH,
            top: SAFE_TOP + 260,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            opacity: endIn,
          }}
        >
          <Die size={200} value={6} pulse={null} rotation={0} scale={1} opacity={1} />
          <div
            style={{
              ...rise(endIn),
              marginTop: 90,
              fontSize: F0,
              fontWeight: 400,
              lineHeight: 1.45,
              textAlign: 'center',
              maxWidth: 760,
            }}
          >
            {props.cta}
          </div>
          <div
            style={{
              marginTop: 70,
              background: ACCENT,
              color: '#000000',
              fontSize: 44,
              fontWeight: 500,
              lineHeight: 1,
              padding: '26px 48px',
              borderRadius: 14,
            }}
          >
            {ui.play}
          </div>
          <div
            style={{
              marginTop: 54,
              fontSize: 32,
              color: HINT,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            {props.handle}
            <br />
            {props.url}
          </div>
        </div>
      ) : null}

      {rawProps.music ? <Audio src={rawProps.music} volume={rawProps.musicVolume ?? 0.05} /> : null}
    </AbsoluteFill>
  )
}
