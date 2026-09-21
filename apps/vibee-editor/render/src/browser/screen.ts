/**
 * THE DESKTOP FOLLOWS THE DEVICE, INSTEAD OF THE PICTURE BEING SHRUNK.
 *
 * The pod ran at a fixed 1280x800 and the viewer scaled it to fit. On a
 * phone held upright that is a landscape desktop squeezed into a portrait
 * box: the picture becomes a stamp with black bars above and below it, and
 * every letter on it is a third of its proper size. No amount of CSS fixes
 * that -- scaling a picture down cannot make the text in it readable.
 *
 * So the desktop itself is resized. A phone gets a TALL desktop, a tablet a
 * squarer one, a laptop a wide one. The pages inside then lay themselves out
 * for that shape, at their own text size, and the stream arrives at roughly
 * 1:1 instead of being resampled twice.
 *
 * ── WHAT WAS MEASURED, NOT ASSUMED ────────────────────────────────────────
 *
 * Against a live pod, 2026-09-20:
 *
 *   - The API takes ANY size, not only the ones it lists in
 *     `/configurations`. The list is a menu, not a fence.
 *   - X snaps the width to a multiple of 8. Asked for 420, the screen became
 *     416; asked for 375, it became 384.
 *   - The POST reply ECHOES THE REQUEST. It said 420x880 while the screen
 *     was 416x880. Only a GET afterwards tells the truth, which is why
 *     `applyScreen` reads back and returns what it actually got.
 *   - Some sizes are refused in silence: 393x852 left the screen where it
 *     was, with a 200 and no complaint. Hence: ask, read back, believe the
 *     read.
 *   - AND SOME ARE REFUSED OUTRIGHT, 422 "cannot set screen size", with no
 *     pattern worth reverse-engineering. Probed at a fixed height of 852:
 *     352 yes, 360 no, 368 no, 376 yes, 384 yes. At a fixed width of 384:
 *     600 no, 640 no, 664 yes, everything above yes. Whatever xrandr is
 *     doing when it builds a mode, it is not a modulus.
 *
 * So the size is not a gamble. The exact shape is tried first, because when
 * it works it is a perfect fit; when the pod refuses it, `/configurations`
 * is the pod's OWN list of sizes it can certainly make, and the nearest
 * shape on that list is used instead. Two attempts, no guessing.
 */

import { fitWindowToScreen } from './cdp'

export interface ScreenSize {
  width: number
  height: number
  rate: number
}

/** Below this the pages inside are unusable; above it nobody is served. */
export const MIN_EDGE = 320
export const MAX_WIDTH = 2560
export const MAX_HEIGHT = 1600

/** What X will actually build. Asking for anything else invites a silent no. */
export const SNAP = 8

const snap = (n: number): number => Math.round(n / SNAP) * SNAP

/**
 * The size to ask the pod for, given the box the person is watching in.
 *
 * It is the viewer's own box, NOT the device's full screen: what matters is
 * the rectangle the stream lands in, and that is what the client measures.
 */
export function wantedScreen(
  box: { width: number; height: number },
  rate = 30
): ScreenSize {
  const clamp = (n: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, n))
  const w = clamp(Math.round(box.width) || MIN_EDGE, MIN_EDGE, MAX_WIDTH)
  const h = clamp(Math.round(box.height) || MIN_EDGE, MIN_EDGE, MAX_HEIGHT)
  return {
    width: clamp(snap(w), MIN_EDGE, MAX_WIDTH),
    height: clamp(snap(h), MIN_EDGE, MAX_HEIGHT),
    rate,
  }
}

interface Fetcher {
  (
    url: string,
    init?: {
      method?: string
      headers?: Record<string, string>
      body?: string
    }
  ): Promise<{ ok: boolean; status: number; text: () => Promise<string> }>
}

const asJson = async (r: {
  ok: boolean
  status: number
  text: () => Promise<string>
}): Promise<unknown> => {
  const body = await r.text()
  if (!r.ok) throw new Error(`neko ${r.status}: ${body.slice(0, 200)}`)
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`neko sent no json: ${body.slice(0, 120)}`)
  }
}

/**
 * The admin password IS the session's `adminToken`, which never leaves this
 * server (routes.ts keeps it out of every response on purpose).
 */
export async function nekoLogin(
  endpoint: string,
  adminToken: string,
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<string> {
  const body = (await asJson(
    await fetcher(`http://${endpoint}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: adminToken }),
    })
  )) as { token?: string }
  if (!body.token) throw new Error('neko did not return a token')
  return body.token
}

/**
 * The nearest shape on the pod's own menu.
 *
 * Nearest by SHAPE first, not by size: a letterbox is what the person
 * complained about, and that is entirely a question of aspect ratio. Among
 * equally-shaped options the one closest in area wins, so a phone is not
 * handed a 4K desktop to scale down.
 *
 * Compared in logarithms so that "twice as wide" and "half as wide" are the
 * same distance from right. On a linear scale everything tall looks nearly
 * identical and the choice collapses.
 */
export function pickFromMenu(
  want: { width: number; height: number },
  menu: ScreenSize[]
): ScreenSize | null {
  const usable = menu.filter(m => m.width > 0 && m.height > 0)
  if (usable.length === 0) return null
  const wantAspect = Math.log(want.width / Math.max(want.height, 1))
  const wantArea = Math.log(Math.max(want.width * want.height, 1))
  let best = usable[0]
  let bestScore = Infinity
  for (const m of usable) {
    const shape = Math.abs(Math.log(m.width / m.height) - wantAspect)
    const size = Math.abs(Math.log(m.width * m.height) - wantArea)
    /* Shape dominates; size only separates ties. */
    const score = shape * 100 + size
    if (score < bestScore) {
      bestScore = score
      best = m
    }
  }
  return best
}

export async function listConfigurations(
  endpoint: string,
  bearer: string,
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<ScreenSize[]> {
  const b = (await asJson(
    await fetcher(`http://${endpoint}/api/room/screen/configurations`, {
      headers: { authorization: `Bearer ${bearer}` },
    })
  )) as ScreenSize[]
  return Array.isArray(b) ? b : []
}

/** Near enough that nobody would see the difference. */
const CLOSE_ENOUGH = 16

function landed(
  want: { width: number; height: number },
  got: ScreenSize
): boolean {
  return (
    Math.abs(got.width - want.width) <= CLOSE_ENOUGH &&
    Math.abs(got.height - want.height) <= CLOSE_ENOUGH
  )
}

export async function readScreen(
  endpoint: string,
  bearer: string,
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<ScreenSize> {
  const b = (await asJson(
    await fetcher(`http://${endpoint}/api/room/screen`, {
      headers: { authorization: `Bearer ${bearer}` },
    })
  )) as ScreenSize
  return { width: b.width, height: b.height, rate: b.rate }
}

/**
 * Ask, then READ BACK, and fall back to the pod's own menu if it would not.
 *
 * The reply to the ask is the request repeated, so it proves nothing: the
 * screen may be a few pixels off, may be unchanged, or the ask may have been
 * refused outright. Only the read afterwards is evidence.
 *
 * ── EVERY ASK RESTARTS THE VIDEO, EVEN ONE THAT FAILS ─────────────────────
 *
 * neko stops its capture pipelines before it touches the screen and starts
 * them again afterwards, whatever the outcome (the pod log shows a destroy
 * and a create around every 422). So each ask is a moment of frozen or
 * black picture for whoever is watching, and the number of asks is the
 * number of those moments. Measured 2026-09-21 after a neighbour search
 * shipped the same morning: ONE fit made 12 refused asks and 31 pipeline
 * starts in a minute. Hence three rules:
 *
 *   1. A screen that is already the right shape is not asked at all.
 *   2. A refusal is understood rather than retried blindly (below).
 *   3. At most one retry, then the menu.
 *
 * ── WHY SIZES WERE REFUSED "WITH NO PATTERN" ─────────────────────────────
 *
 * They were refused for their RATE, not their size. The pod log says so:
 * "unsupported screen rate 30". neko builds a new size with CVT at the rate
 * asked for, and X then reports that mode's refresh rounded from its pixel
 * clock -- 29 or 31 for some sizes, 30 for others. Asking for 30 on a mode
 * X lists as 29 is BadValue. (server/pkg/xorg/xorg.go, ChangeScreenSize.)
 * The failed ask still CREATED the mode, so the menu now lists it with the
 * rate X gave it, and the menu choice below picks exactly that.
 */
export async function applyScreen(
  endpoint: string,
  adminToken: string,
  want: ScreenSize,
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<ScreenSize> {
  const bearer = await nekoLogin(endpoint, adminToken, fetcher)

  const current = await readScreen(endpoint, bearer, fetcher).catch(() => null)
  if (current && landed(want, current)) return current

  const ask = async (size: ScreenSize): Promise<ScreenSize | null> => {
    try {
      await asJson(
        await fetcher(`http://${endpoint}/api/room/screen`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${bearer}`,
          },
          body: JSON.stringify(size),
        })
      )
    } catch {
      /* 422 "cannot set screen size" is an answer, not a failure. */
      return null
    }
    return await readScreen(endpoint, bearer, fetcher)
  }

  const exact = await ask(want)
  if (exact && landed(want, exact)) return exact

  const menu = await listConfigurations(endpoint, bearer, fetcher).catch(
    () => [] as ScreenSize[]
  )

  /*
   * The refused ask still created the size, at the rate X gave it, so the
   * menu now lists it -- and being exactly the wanted shape, it is what the
   * menu choice picks. No separate retry: one path, one more restart.
   */
  const nearest = pickFromMenu(want, menu)
  if (nearest) {
    const settled = await ask(nearest)
    if (settled) return settled
  }

  /*
   * Nothing took. The pod keeps whatever it had, and the caller is told what
   * that is rather than what it wished for -- the frame is drawn from this.
   */
  return exact ?? (await readScreen(endpoint, bearer, fetcher))
}

/**
 * THE DESKTOP AND THE WINDOW ON IT, TOGETHER.
 *
 * Resizing the screen alone left Chromium's window at its old size (see
 * fitWindowToScreen in cdp.ts), so every caller that reshapes the desktop
 * goes through here, and the window follows the size the screen REALLY got.
 * A window that will not follow is not a failed fit: the screen is right,
 * and the next fit tries again.
 */
export interface Desktop {
  endpoint: string
  adminToken: string
  cdpEndpoint?: string | null
}

export interface DesktopIo {
  apply: typeof applyScreen
  fitWindow: typeof fitWindowToScreen
}

/**
 * ONE FIT AT A TIME PER POD.
 *
 * The app's tab and the window inside it both ask for the shape when the
 * picture comes up, within milliseconds of each other and a few pixels
 * apart. Run side by side, both saw the old size and both asked -- two video
 * restarts. Run in turn, the second finds the screen already right (rule 1
 * in applyScreen) and asks nothing.
 */
const inTurn = new Map<string, Promise<unknown>>()

function oneAtATime<T>(key: string, work: () => Promise<T>): Promise<T> {
  const before = inTurn.get(key) ?? Promise.resolve()
  const mine = before.catch(() => undefined).then(work)
  inTurn.set(key, mine)
  void mine
    .catch(() => undefined)
    .then(() => {
      if (inTurn.get(key) === mine) inTurn.delete(key)
    })
  return mine
}

export function fitDesktop(
  desktop: Desktop,
  want: ScreenSize,
  io: DesktopIo = { apply: applyScreen, fitWindow: fitWindowToScreen }
): Promise<ScreenSize> {
  return oneAtATime(desktop.endpoint, () => fitNow(desktop, want, io))
}

async function fitNow(
  desktop: Desktop,
  want: ScreenSize,
  io: DesktopIo
): Promise<ScreenSize> {
  const got = await io.apply(desktop.endpoint, desktop.adminToken, want)
  if (desktop.cdpEndpoint) {
    try {
      await io.fitWindow(desktop.cdpEndpoint, got)
    } catch {
      /* The screen is right; the window is fitted again next time. */
    }
  }
  return got
}
