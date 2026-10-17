/**
 * WAIT FOR A PAINT BEFORE TAKING THE PICTURE.
 *
 * 2026-10-01 the agent journal described a browser_screenshot of t27.ai as a
 * "black screen". The page was fine: t27.ai is a dark single-page app, and
 * `Page.captureScreenshot` was called straight after the tab opened, before
 * the script had put anything into the body. The frame was the empty dark
 * background, and the agent reported it as the page's content.
 *
 * So before the shot the page is asked, a bounded number of times, whether it
 * has finished loading AND has something visible in it (text, an image, a
 * canvas, an svg, a video with a size). Colour is deliberately not the test:
 * a dark page is legitimately dark. If the bound runs out, the tool result
 * says so in words -- "page has not painted yet" -- rather than handing back
 * a blank frame as if it were the page.
 */

/** What the page says about itself; `null` when the probe could not run. */
export interface PaintProbe {
  readyState: string
  visible: boolean
}

export interface PaintVerdict {
  painted: boolean
  readyState: string | null
  attempts: number
}

/** Runs in the page. Returns a PaintProbe. */
export const PAINT_PROBE = `(() => {
  const b = document.body
  let visible = false
  if (b) {
    if ((b.innerText || '').trim().length > 0) visible = true
    else {
      for (const el of b.querySelectorAll('img,canvas,svg,video,picture,iframe')) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) { visible = true; break }
      }
    }
  }
  return { readyState: document.readyState, visible }
})()`

export const NOT_PAINTED_NOTE =
  'page has not painted yet: after waiting, the page is still loading or its body has no visible content. ' +
  'The picture is NOT the page content -- do not describe it as such; wait and take browser_screenshot again.'

/** True when the probe says the page is loaded and shows something. */
export function isPainted(p: PaintProbe | null): boolean {
  return !!p && p.readyState === 'complete' && p.visible === true
}

/**
 * THE GAP BEFORE THE NEXT PROBE, GROWING FROM SMALL.
 *
 * The first bound was a flat 400 ms between all eight probes. In production
 * each probe is also a CDP round-trip across the ocean (edge sin1, render
 * sfo, ~0.3 s warm each -- `tri road`), so the flat gap decided the only
 * thing left to tune: how soon a page that paints early is noticed. A page
 * that was ready at 120 ms still waited until the 400 ms gap elapsed. Most
 * pages that are going to paint do so in the first second, so the gaps are
 * front-loaded -- small early, where it matters, then up to a cap -- which
 * catches an early paint sooner AND lowers the give-up ceiling (seven gaps:
 * ~2.16 s vs the old 2.8 s). `attemptJustFailed` is 1-based.
 */
export function paintStepMs(
  attemptJustFailed: number,
  baseMs = 100,
  capMs = 400
): number {
  const grown = Math.round(baseMs * Math.pow(1.7, attemptJustFailed - 1))
  return Math.max(1, Math.min(capMs, grown))
}

/**
 * Asks `probe` up to `attempts` times until the page is painted, waiting
 * between probes -- a growing gap by default (`paintStepMs`), or a flat
 * `stepMs` when one is given. A probe that throws counts as "not yet", never
 * as "painted".
 */
export async function waitForPaint(
  probe: () => Promise<unknown>,
  opts: {
    attempts?: number
    stepMs?: number
    capMs?: number
    sleep?: (ms: number) => Promise<void>
  } = {}
): Promise<PaintVerdict> {
  const attempts = Math.max(1, opts.attempts ?? 8)
  const capMs = opts.capMs ?? 400
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  let last: PaintProbe | null = null
  for (let i = 1; i <= attempts; i++) {
    last = asProbe(await probe().catch(() => null))
    if (isPainted(last)) {
      return { painted: true, readyState: last!.readyState, attempts: i }
    }
    if (i < attempts) {
      await sleep(
        opts.stepMs != null ? opts.stepMs : paintStepMs(i, 100, capMs)
      )
    }
  }
  return { painted: false, readyState: last?.readyState ?? null, attempts }
}

function asProbe(v: unknown): PaintProbe | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.readyState !== 'string') return null
  return { readyState: o.readyState, visible: o.visible === true }
}
