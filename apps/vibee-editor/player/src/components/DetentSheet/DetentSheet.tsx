import { useEffect, useRef, useState, type ReactNode } from 'react'
import './DetentSheet.css'
import {
  detentHeights,
  settle,
  nextDetent,
  type Detent,
} from '@/lib/sheetDetents'

/**
 * THE iOS BOTTOM SHEET, IN THE HOUSE STYLE.
 *
 * Owner, 2026-09-22: "a sheet that opens from the bottom like iOS, to full
 * screen or half, dragged to any height". It rests on three detents -- a
 * peek (one status line and the main action), half the screen, the whole
 * screen -- follows the finger while dragged, and settles on the nearest
 * detent or, after a flick, on the next one that way (lib/sheetDetents.ts).
 * A tap on the grabber cycles through them.
 *
 * The parent owns the detent (`detent` / `onDetent`) so it can open the
 * sheet when something needs the person -- the agent asking permission, a
 * choice, a password -- without the person hunting for it.
 */
export function DetentSheet({
  detent,
  onDetent,
  peek,
  children,
  label,
  peekPx,
  className,
}: {
  detent: Detent
  onDetent: (d: Detent) => void
  /** What the closed sheet shows beside the grabber. */
  peek: ReactNode
  children: ReactNode
  label: string
  /** Height of the closed sheet; the default is lib/sheetDetents PEEK_PX. */
  peekPx?: number
  className?: string
}) {
  const [screen, setScreen] = useState(() => window.innerHeight)
  useEffect(() => {
    const on = () => setScreen(window.innerHeight)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const heights = detentHeights(screen, peekPx)
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{
    y: number
    visible: number
    t: number
    lastY: number
    lastT: number
  } | null>(null)

  const visible = drag ?? heights[detent]

  const onDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    const now = performance.now()
    start.current = {
      y: e.clientY,
      visible: heights[detent],
      t: now,
      lastY: e.clientY,
      lastT: now,
    }
    setDrag(heights[detent])
  }
  const onMove = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    const next = Math.min(
      heights.full,
      Math.max(heights.peek, s.visible + (s.y - e.clientY))
    )
    s.lastY = e.clientY
    s.lastT = performance.now()
    setDrag(next)
  }
  const onUp = (e: React.PointerEvent) => {
    const s = start.current
    start.current = null
    if (!s) return
    const moved = Math.abs(e.clientY - s.y)
    const dt = Math.max(1, performance.now() - s.t)
    setDrag(null)
    /* A tap, not a drag: cycle. */
    if (moved < 6) {
      onDetent(nextDetent(detent))
      return
    }
    const velocity = (s.y - e.clientY) / dt
    onDetent(settle(visible, velocity, heights))
  }

  return (
    <section
      className={`detent-sheet detent-sheet--${detent}${drag !== null ? ' detent-sheet--dragging' : ''}${className ? ` ${className}` : ''}`}
      style={{
        height: `${heights.full}px`,
        transform: `translateY(${heights.full - visible}px)`,
        /* What is on screen; the glass variant clips itself to it. */
        ['--sheet-visible' as string]: `${visible}px`,
      }}
      aria-label={label}
    >
      <div
        className="detent-sheet__handle"
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-expanded={detent !== 'peek'}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onDetent(nextDetent(detent))
          }
        }}
      >
        <span className="detent-sheet__grabber" />
        <div className="detent-sheet__peek">{peek}</div>
      </div>
      <div
        className="detent-sheet__body"
        style={{ maxHeight: `${Math.max(0, visible - 72)}px` }}
      >
        {children}
      </div>
    </section>
  )
}
