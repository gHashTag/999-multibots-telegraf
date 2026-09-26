/**
 * IS THE BROWSER STILL A BROWSER?
 *
 * Measured 2026-09-24..26 on the owner's own pod: `GET /json/version` and
 * `PUT /json/new` answered perfectly while `Runtime.evaluate` timed out after
 * 21 s and `Page.captureScreenshot` returned "Internal error". `browser_status`
 * therefore said `{ running: true, pages: 17 }` for three days about a browser
 * the agent could neither read nor photograph -- so no sign-in could ever be
 * completed, and nothing above looked broken.
 *
 * The lesson is the shape of this check: HTTP liveness is not liveness. A pod
 * is a browser when a page it just opened can RUN something and say what it
 * saw. That is the pair of calls that failed, so that is the pair asked here.
 *
 * WHAT THIS IS NOT. Not a monitor and not a reaper: one honest answer, used
 * where the answer changes what we do -- after a restart, before reporting one
 * as successful (routes.ts).
 */

/** The three calls this needs, injected so a test needs no pod. */
export interface HealthIo {
  newPage: (endpoint: string, url: string) => Promise<{ id: string }>
  evaluateOn: (
    endpoint: string,
    pageId: string,
    expr: string
  ) => Promise<unknown>
  closePage: (endpoint: string, pageId: string) => Promise<void>
}

/** What a healthy browser must be able to say back. */
export const HEALTH_EXPR = '(() => 1 + 1)()'
export const HEALTH_ANSWER = 2

/** Time one probe is given. A degraded pod answers by not answering. */
export const PROBE_TIMEOUT_MS = 15_000
/** How long a restarted pod is given to become a browser again. */
export const READY_TIMEOUT_MS = 150_000
/** Pause between probes while waiting. */
export const PROBE_EVERY_MS = 5_000

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Fails loudly rather than hanging: a hung probe is the bug it looks for. */
async function within<T>(ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('probe timed out')), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * One probe: open a blank tab, run something in it, read the answer, close the
 * tab. Never throws -- the answer is the boolean. The tab is closed even when
 * the probe fails, because a probe that leaks tabs feeds the very state it is
 * looking for.
 */
export async function browserAnswers(
  cdpEndpoint: string,
  io: HealthIo,
  timeoutMs = PROBE_TIMEOUT_MS
): Promise<boolean> {
  let pageId = ''
  try {
    const page = await within(timeoutMs, io.newPage(cdpEndpoint, 'about:blank'))
    pageId = String(page?.id ?? '')
    if (!pageId) return false
    const got = await within(
      timeoutMs,
      io.evaluateOn(cdpEndpoint, pageId, HEALTH_EXPR)
    )
    return got === HEALTH_ANSWER
  } catch {
    return false
  } finally {
    if (pageId) await io.closePage(cdpEndpoint, pageId).catch(() => undefined)
  }
}

/**
 * Wait until the browser answers, or say it never did. A restarted pod needs
 * about ten seconds to have Chromium up; a redeployed one needs more, and a
 * dead one needs forever, which is what the deadline is for.
 */
export async function waitForBrowser(
  cdpEndpoint: string,
  io: HealthIo,
  opts: {
    timeoutMs?: number
    everyMs?: number
    probeMs?: number
    now?: () => number
  } = {}
): Promise<boolean> {
  const now = opts.now ?? (() => Date.now())
  const deadline = now() + (opts.timeoutMs ?? READY_TIMEOUT_MS)
  for (;;) {
    if (await browserAnswers(cdpEndpoint, io, opts.probeMs)) return true
    if (now() >= deadline) return false
    await wait(opts.everyMs ?? PROBE_EVERY_MS)
  }
}

/** The real pod, reached the way everything else reaches it. */
export async function cdpHealthIo(): Promise<HealthIo> {
  const { newPage, evaluateOn, closePage } = await import('./cdp')
  return {
    newPage: (endpoint, url) => newPage(endpoint, url),
    evaluateOn: (endpoint, pageId, expr) => evaluateOn(endpoint, pageId, expr),
    closePage: (endpoint, pageId) => closePage(endpoint, pageId),
  }
}
