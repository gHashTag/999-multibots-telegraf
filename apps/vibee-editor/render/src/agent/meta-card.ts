/**
 * THE CARD INSTAGRAM CANNOT POST WITHOUT (meta-connect.t27: CARD_W x CARD_H).
 *
 * The blog's feed carries no images, and Instagram takes only a public JPEG.
 * So each article gets one card, drawn here: the dark field, the brand's
 * triangle point-down, the title, the domain. Served from a public address
 * Meta fetches once, keyed by the article's slug -- the title is looked up in
 * the feed, never taken from the address, so the address cannot be used to
 * print anybody's words under our name.
 */
import { CARD_H, CARD_W } from '../spec/meta-connect.gen'

/** Splits words into lines no wider than `max` by `measure`. Pure. */
export function wrap(
  text: string,
  max: number,
  measure: (s: string) => number
): string[] {
  const lines: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${w}` : w
    if (line && measure(next) > max) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

export async function drawCard(title: string): Promise<Buffer> {
  const { createCanvas } = await import('canvas')
  const c = createCanvas(CARD_W, CARD_H)
  const g = c.getContext('2d')
  g.fillStyle = '#0b0b0f'
  g.fillRect(0, 0, CARD_W, CARD_H)

  /* The brand's triangle, point down (owner-noir-reel canon). */
  const cx = CARD_W / 2
  g.strokeStyle = '#e8e8ec'
  g.lineWidth = 10
  g.beginPath()
  g.moveTo(cx - 90, 170)
  g.lineTo(cx + 90, 170)
  g.lineTo(cx, 326)
  g.closePath()
  g.stroke()

  /* The title: as large as fits between the triangle and the domain. */
  const pad = 96
  const top = 440
  const room = CARD_H - 220 - top
  let size = 92
  let lines: string[] = []
  for (; size >= 44; size -= 6) {
    g.font = `bold ${size}px "DejaVu Sans", sans-serif`
    lines = wrap(title, CARD_W - pad * 2, s => g.measureText(s).width)
    if (lines.length * Math.round(size * 1.18) <= room) break
  }
  size = Math.max(size, 44)
  g.fillStyle = '#f4f4f6'
  g.textAlign = 'left'
  g.textBaseline = 'top'
  const lh = Math.round(size * 1.18)
  lines = lines.slice(0, Math.floor(room / lh))
  let y = Math.max(top, (CARD_H - lines.length * lh) / 2)
  for (const l of lines) {
    g.fillText(l, pad, y)
    y += lh
  }

  g.font = `32px "DejaVu Sans", sans-serif`
  g.fillStyle = '#9a9aa6'
  g.fillText('t27.ai', pad, CARD_H - 140)
  return c.toBuffer('image/jpeg', { quality: 0.9 })
}
