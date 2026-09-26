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

/**
 * CHROMIUM'S WINDOW CANNOT BE NARROWER THAN THIS.
 *
 * Its tab strip and toolbar have a minimum width, and a screen narrower than
 * that leaves the window hanging off the right edge: the owner's photo, a
 * phone-shaped screen ~400px wide, with the extensions and menu buttons and
 * the right of every page cut off. So a narrow box is scaled UP to this
 * width with its shape kept (wantedScreen), and the viewer scales the
 * picture back down into the frame -- all of it visible, a little smaller.
 * 520 leaves room over the ~500 Chromium needs.
 */
export const MIN_WINDOW_WIDTH = 520

/** Below this the pages inside are unusable; above it nobody is served. */
export const MIN_EDGE = 320
export const MAX_WIDTH = 2560
export const MAX_HEIGHT = 1600

/** What X will actually build. Asking for anything else invites a silent no. */
export const SNAP = 8

const snap = (n: number): number => Math.round(n / SNAP) * SNAP

/**
 * IS THIS A BOX SOMEBODY IS LOOKING AT?
 *
 * A hidden frame measures 0 x 0 -- the app keeps its Browser tab mounted
 * while the person is elsewhere, and a window with display:none still fires
 * `resize`. wantedScreen read that 0 as "the smallest screen there is" and
 * the pod shrank to it; the next visible window asked for its own size back.
 * Measured on the pod 2026-09-21 22:04: the video pipeline torn down and
 * rebuilt more than ten times in a minute while the owner, with the app's
 * tab kept and the Queen's BROWSER tab open, looked at a black window. Every
 * size request restarts the video, even a refused one.
 *
 * So a box under 2 px on either side is not a request at all: the pod is
 * left alone. NaN and missing values are the same answer.
 */
export function isVisibleBox(box: { width: number; height: number }): boolean {
  return (
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width >= 2 &&
    box.height >= 2
  )
}

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
  let bw = Math.round(box.width) || MIN_EDGE
  let bh = Math.round(box.height) || MIN_EDGE
  /*
   * Narrower than Chromium's window can be: scale the whole box up, keeping
   * its SHAPE, so the picture still fills the frame -- just drawn a little
   * smaller -- instead of the window running off the right of the screen.
   */
  if (bw > 0 && bw < MIN_WINDOW_WIDTH) {
    bh = Math.round((bh * MIN_WINDOW_WIDTH) / bw)
    bw = MIN_WINDOW_WIDTH
  }
  const w = clamp(bw, MIN_EDGE, MAX_WIDTH)
  const h = clamp(bh, MIN_EDGE, MAX_HEIGHT)
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
 * Give the admin session back. A failure here is not the errand's failure:
 * the picture was taken, the screen was set, the mouse was handed over.
 */
export async function nekoLogout(
  endpoint: string,
  bearer: string,
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<void> {
  await fetcher(`http://${endpoint}/api/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}` },
  })
}

/**
 * ONE ADMIN SESSION PER ERRAND, AND IT IS HANDED BACK.
 *
 * Every admin errand used to log in and walk away. neko keeps what it hands
 * out, so the sessions piled up: measured on the owner's own pod on
 * 2026-09-26, `GET /api/sessions` listed 35 of them, all named `admin`, none
 * connected -- one per screenshot, per screen resize, per handover of the
 * mouse, over three days. It costs memory in the pod for nothing, and it
 * makes the one list that answers "is anybody watching this browser?"
 * (mouse.ts pickPersonSession) read through 35 of our own ghosts.
 *
 * The cure is the errand's own scope: log in, do the one thing, log out in
 * `finally` so a thrown errand still gives its session back. neko answers
 * POST /api/logout with 200 for an admin bearer, verified live the same day.
 */
export async function withNekoAdmin<T>(
  endpoint: string,
  adminToken: string,
  fetcher: Fetcher,
  errand: (bearer: string) => Promise<T>
): Promise<T> {
  const bearer = await nekoLogin(endpoint, adminToken, fetcher)
  try {
    return await errand(bearer)
  } finally {
    await nekoLogout(endpoint, bearer, fetcher).catch(() => {})
  }
}

/**
 * THE WHOLE SCREEN, AS THE PERSON SEES IT.
 *
 * A CDP screenshot is the PAGE: no tabs, no address bar, no permission
 * prompt, no dialog Chromium draws over it, and nothing about what the
 * stream actually shows. neko's own shot is the X screen itself -- the same
 * pixels the video carries. 2026-09-22: the owner saw a grey window for an
 * evening; the CDP shot showed a healthy page throughout, and the fault
 * (a layer in our skin over the video) was found only once this picture and
 * the viewer's own were set side by side.
 *
 * Admin-only on neko, so it goes through the pod's admin login, server-side.
 */
export interface ShotFetcher {
  (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ): Promise<{
    ok: boolean
    status: number
    text: () => Promise<string>
    arrayBuffer: () => Promise<ArrayBuffer>
  }>
}

export async function desktopShot(
  endpoint: string,
  adminToken: string,
  fetcher: ShotFetcher = fetch as unknown as ShotFetcher
): Promise<string> {
  return await withNekoAdmin(endpoint, adminToken, fetcher, async bearer => {
    const res = await fetcher(`http://${endpoint}/api/room/screen/shot.jpg`, {
      headers: { authorization: `Bearer ${bearer}` },
    })
    if (!res.ok)
      throw new Error(`the pod refused the screen shot (${res.status})`)
    return Buffer.from(await res.arrayBuffer()).toString('base64')
  })
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
 * The failed ask still CREATED the mode; see the retry below for why it is
 * asked for again at one hertz less, and why the menu cannot help.
 */
export async function applyScreen(
  endpoint: string,
  adminToken: string,
  want: ScreenSize,
  fetcher: Fetcher = fetch as unknown as Fetcher
): Promise<ScreenSize> {
  return await withNekoAdmin(endpoint, adminToken, fetcher, async bearer => {
    const current = await readScreen(endpoint, bearer, fetcher).catch(
      () => null
    )
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

    /*
     * REFUSED FOR ITS RATE: THE MODE NOW EXISTS, AT ONE HERTZ LESS.
     *
     * CVT rounds a new mode's pixel clock DOWN, so its real refresh lands just
     * under the rate asked for, and X rounds that to the nearest whole number:
     * 30 for a big screen, 29 for a phone-sized one (the clock step is a
     * bigger share of a small clock). The refused ask still created the mode,
     * so the same size at one hertz less is what lands.
     *
     * It cannot come from the menu: neko reads its list of sizes ONCE, at
     * start (server/internal/desktop/manager.go), so a mode made afterwards is
     * never on it. Relying on the menu is exactly what put the owner back on
     * 800x1600, with black edges either side, after the fix that assumed it.
     *
     * Only after a refusal (422). A polite 200 that left the screen alone is
     * not a rate problem, and a second ask would be a second video restart
     * for nothing.
     */
    if (!exact) {
      const slower = await ask({ ...want, rate: want.rate - 1 })
      if (slower && landed(want, slower)) return slower
    }

    const menu = await listConfigurations(endpoint, bearer, fetcher).catch(
      () => [] as ScreenSize[]
    )

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
  })
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

/*
 * A REFIT RESTARTS THE VIDEO, SO IT MUST BE RARE.
 *
 * Measured 2026-09-22 on the owner's pod: the video pipeline was rebuilt
 * eight times in one minute -- the app and the window's own script each
 * asked for the shape, a phone shape that does not land fell back to the
 * menu, and the next ask tried again. Every rebuild reconnects the viewer,
 * and neko takes control away from a reconnecting viewer: the owner could
 * not press a single button. So the same ask is not repeated for
 * FIT_GIVE_UP_MS (it has either landed or is known not to), and a
 * different ask waits FIT_MIN_GAP_MS after the last refit.
 */
export const FIT_MIN_GAP_MS = 8_000
export const FIT_GIVE_UP_MS = 10 * 60_000
const lastFit = new Map<
  string,
  { at: number; want: ScreenSize; got: ScreenSize }
>()

export function resetFitMemoryForTests(): void {
  lastFit.clear()
}

/** Whether an ask should be answered from the last refit instead. Pure. */
export function shouldSkipFit(
  last: { at: number; want: ScreenSize } | undefined,
  want: ScreenSize,
  now: number
): boolean {
  if (!last) return false
  const age = now - last.at
  if (age < FIT_MIN_GAP_MS) return true
  const same =
    last.want.width === want.width && last.want.height === want.height
  return same && age < FIT_GIVE_UP_MS
}

export function fitDesktop(
  desktop: Desktop,
  want: ScreenSize,
  io: DesktopIo = { apply: applyScreen, fitWindow: fitWindowToScreen },
  now: () => number = Date.now
): Promise<ScreenSize> {
  const last = lastFit.get(desktop.endpoint)
  if (last && shouldSkipFit(last, want, now())) return Promise.resolve(last.got)
  return oneAtATime(desktop.endpoint, async () => {
    const got = await fitNow(desktop, want, io)
    lastFit.set(desktop.endpoint, { at: now(), want, got })
    return got
  })
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
