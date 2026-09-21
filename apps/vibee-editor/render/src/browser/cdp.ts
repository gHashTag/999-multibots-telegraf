/**
 * TALKING TO THE POD'S BROWSER.
 *
 * The smallest Chrome DevTools Protocol client that covers what an agent
 * needs: open a page, read it, look at it, click, type, run a script. The
 * surface was taken from the one in `gHashTag/trios`
 * (`crates/trios-sacred/.../cdp_client.zig`) -- not the code, which is Zig and
 * which no build file there references, but its list: discoverTargets,
 * connectToTarget, navigate, screenshot, evaluate, click, typeText, getTitle,
 * enable{Page,DOM,Runtime}.
 *
 * WHY THIS EXISTS AT ALL. Two facts, both measured:
 *
 *   - headful Chromium binds CDP to 127.0.0.1 INSIDE the pod and ignores
 *     --remote-debugging-address, so the pod runs a socat bridge on 9223 and
 *     this talks to that (deployment/remote-browser/cdp-bridge.conf);
 *   - that port is on a private network and NEVER published. Whoever reaches
 *     CDP reads every cookie in the profile and acts as the person.
 *
 * The agent drives the SAME browser the person is watching. That is the whole
 * design: no second window, no headless twin, nothing the person cannot see.
 */

/*
 * `ws` IS LOADED ONLY WHEN A BROWSER IS ACTUALLY DRIVEN.
 *
 * These tools live in the registry every agent reads, so this module is
 * imported by anything that touches `TOOLS` -- including tests that only
 * enumerate it. A top-level `import WebSocket from 'ws'` made that chain
 * heavy enough to time out unrelated tests at five seconds, measured by
 * removing one line and watching them pass.
 */
import type WebSocketType from 'ws'

type WebSocketCtor = new (
  url: string,
  options?: { perMessageDeflate?: boolean }
) => WebSocketType
type RawData = Parameters<Parameters<WebSocketType['on']>[1]>[0]

let wsModule: WebSocketCtor | undefined

async function socketClass(): Promise<WebSocketCtor> {
  if (!wsModule) {
    const mod = (await import('ws')) as unknown as { default: WebSocketCtor }
    wsModule = mod.default
  }
  return wsModule
}

export interface CdpTarget {
  id: string
  type: string
  title: string
  url: string
  webSocketDebuggerUrl?: string
}

/**
 * CHROMIUM ANSWERS ONLY TO AN IP OR TO localhost.
 *
 * Its DevTools HTTP endpoint refuses any Host header that is a name, as a
 * defence against DNS rebinding. Measured against the pod, same request,
 * two Host headers:
 *
 *   Host: 127.0.0.1                          -> 200
 *   Host: browser-pod.railway.internal:9223  -> 500 "Host header is specified
 *                                              and is not an IP address or
 *                                              localhost."
 *
 * Locally the broker reached the pod as 127.0.0.1 and everything worked; on
 * Railway it reaches it by its private DNS name, and every call came back
 * 500 -- browser_status saw a running pod with no pages, and browser_open
 * failed outright. The name is resolved to an address first, so the Host
 * Chromium sees is an IP. It applies to the socket too: the WebSocket URL is
 * rewritten to this same resolved address.
 *
 * Every network call in this module goes through one of the four functions
 * that call this, so every caller is covered wherever its endpoint came from.
 */
const IP_OR_LOCAL = /^(\[[0-9a-f:.]+\]|\d{1,3}(\.\d{1,3}){3}|localhost)$/i
const resolvedCache = new Map<string, { at: number; value: string }>()
/** Private DNS can move when a pod redeploys; do not trust an old answer. */
const RESOLVE_TTL_MS = 30_000

export async function ipEndpoint(
  endpoint: string,
  lookup: (
    host: string
  ) => Promise<{ address: string; family: number }> = async h =>
    (await import('node:dns/promises')).lookup(h)
): Promise<string> {
  const hostPort = endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const m = hostPort.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/)
  if (!m) return hostPort
  const [, host, port] = m
  if (IP_OR_LOCAL.test(host)) return hostPort
  const hit = resolvedCache.get(hostPort)
  if (hit && Date.now() - hit.at < RESOLVE_TTL_MS) return hit.value
  const { address, family } = await lookup(host)
  const h = family === 6 ? `[${address}]` : address
  const value = port ? `${h}:${port}` : h
  resolvedCache.set(hostPort, { at: Date.now(), value })
  return value
}

/** Test seam. */
export function forgetResolved(): void {
  resolvedCache.clear()
}

/** Long enough for a page, short enough that a hung pod is not a hung agent. */
const CALL_TIMEOUT_MS = 20_000

const httpBase = (endpoint: string) =>
  endpoint.startsWith('http') ? endpoint : `http://${endpoint}`

/**
 * CDP HANDS BACK THE ADDRESS IT THINKS IT IS ON, AND IT IS WRONG HERE.
 *
 * `webSocketDebuggerUrl` carries `ws://127.0.0.1:9222/...` -- Chromium's own
 * loopback inside the pod. We arrived through the socat bridge on a different
 * port, so connecting to what it says reaches nothing and the call hangs
 * until its timeout. Measured: `browser_status` and `browser_open` worked
 * (both plain HTTP) while `browser_evaluate` timed out, which is exactly the
 * shape of this bug.
 *
 * So every socket address is rewritten to the endpoint we actually used.
 */
export function rewriteWsUrl(wsUrl: string, endpoint: string): string {
  const hostPort = endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return wsUrl.replace(/^(wss?:\/\/)[^/]+/, `$1${hostPort}`)
}

const reachable = (t: CdpTarget, endpoint: string): CdpTarget => ({
  ...t,
  webSocketDebuggerUrl: t.webSocketDebuggerUrl
    ? rewriteWsUrl(t.webSocketDebuggerUrl, endpoint)
    : undefined,
})

export async function listTargets(given: string): Promise<CdpTarget[]> {
  const endpoint = await ipEndpoint(given)
  const res = await fetch(`${httpBase(endpoint)}/json/list`)
  if (!res.ok) throw new Error(`CDP list failed: HTTP ${res.status}`)
  const targets = (await res.json()) as CdpTarget[]
  return targets.map(t => reachable(t, endpoint))
}

/** The page the person is looking at: the first real page, not an extension. */
export async function frontPage(endpoint: string): Promise<CdpTarget> {
  const targets = await listTargets(endpoint)
  const page = targets.find(
    t => t.type === 'page' && !t.url.startsWith('chrome-extension://')
  )
  if (!page) throw new Error('the browser has no page open')
  return page
}

export async function newPage(given: string, url: string): Promise<CdpTarget> {
  const endpoint = await ipEndpoint(given)
  /* PUT, not GET: Chrome refuses the old GET form since 111. */
  const res = await fetch(
    `${httpBase(endpoint)}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' }
  )
  if (!res.ok) throw new Error(`CDP new page failed: HTTP ${res.status}`)
  return reachable((await res.json()) as CdpTarget, endpoint)
}

export async function closePage(given: string, id: string): Promise<void> {
  const endpoint = await ipEndpoint(given)
  await fetch(`${httpBase(endpoint)}/json/close/${id}`)
}

/**
 * THE PAGE'S OWN SOCKET ACCEPTS A CONNECTION AND THEN SAYS NOTHING.
 *
 * Measured against a live pod: `ws://…/devtools/browser/…` answers
 * `Browser.getVersion` immediately, while `ws://…/devtools/page/<id>` opens,
 * takes the command and never replies -- no error, no close, just silence
 * until the timeout. It is not the bridge (the browser endpoint runs through
 * the same socat) and not the `Host` header (tried three, all silent).
 *
 * So everything goes through the BROWSER endpoint and attaches to the page
 * with `Target.attachToTarget({ flatten: true })`, addressing it by
 * `sessionId`. That is the shape Chrome itself has preferred since flattened
 * sessions landed, and here it is the only one that answers.
 */
export async function browserWsUrl(given: string): Promise<string> {
  const endpoint = await ipEndpoint(given)
  const res = await fetch(`${httpBase(endpoint)}/json/version`)
  if (!res.ok) throw new Error(`CDP version failed: HTTP ${res.status}`)
  const info = (await res.json()) as { webSocketDebuggerUrl?: string }
  if (!info.webSocketDebuggerUrl)
    throw new Error('the pod exposes no CDP socket')
  return rewriteWsUrl(info.webSocketDebuggerUrl, endpoint)
}

/**
 * Opens one socket to the browser, attaches to the target, runs the calls and
 * leaves. A pooled connection would be faster and would also mean one slow
 * page holding up another call; a pod is one person's browser and the calls
 * are seconds apart.
 */
export async function onPage<T>(
  endpoint: string,
  targetId: string,
  work: (call: Call) => Promise<T>
): Promise<T> {
  const WS = await socketClass()
  const socket = new WS(await browserWsUrl(endpoint), {
    perMessageDeflate: false,
  })
  let nextId = 1
  const waiting = new Map<number, (m: CdpMessage) => void>()

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('CDP connect timed out')),
        CALL_TIMEOUT_MS
      )
      socket.once('open', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('error', (e: Error) => {
        clearTimeout(timer)
        reject(e)
      })
    })

    socket.on('message', (raw: RawData) => {
      let msg: CdpMessage
      try {
        msg = JSON.parse(String(raw)) as CdpMessage
      } catch {
        return
      }
      if (typeof msg.id !== 'number') return
      const waiter = waiting.get(msg.id)
      if (!waiter) return
      waiting.delete(msg.id)
      waiter(msg)
    })

    const send = (
      method: string,
      params: Record<string, unknown>,
      sessionId?: string
    ) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const id = nextId++
        const timer = setTimeout(() => {
          waiting.delete(id)
          reject(new Error(`CDP ${method} timed out`))
        }, CALL_TIMEOUT_MS)
        waiting.set(id, msg => {
          clearTimeout(timer)
          if (msg.error)
            reject(new Error(`CDP ${method}: ${msg.error.message}`))
          else resolve(msg.result || {})
        })
        socket.send(
          JSON.stringify({
            id,
            method,
            params,
            ...(sessionId ? { sessionId } : {}),
          })
        )
      })

    const attached = await send('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    const sessionId = String(attached.sessionId || '')
    if (!sessionId) throw new Error('could not attach to the page')

    return await work((method, params = {}) => send(method, params, sessionId))
  } finally {
    socket.close()
  }
}

interface CdpMessage {
  id?: number
  result?: Record<string, unknown>
  error?: { message?: string }
}

export type Call = (
  method: string,
  params?: Record<string, unknown>
) => Promise<Record<string, unknown>>

export async function callOnTarget(
  wsUrl: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const WS = await socketClass()
  const socket = new WS(wsUrl, { perMessageDeflate: false })
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('CDP connect timed out')),
        CALL_TIMEOUT_MS
      )
      socket.once('open', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('error', (e: Error) => {
        clearTimeout(timer)
        reject(e)
      })
    })

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`CDP ${method} timed out`)),
        CALL_TIMEOUT_MS
      )
      socket.on('message', (raw: RawData) => {
        let msg: { id?: number; result?: unknown; error?: { message?: string } }
        try {
          msg = JSON.parse(String(raw))
        } catch {
          return
        }
        if (msg.id !== 1) return
        clearTimeout(timer)
        if (msg.error) reject(new Error(`CDP ${method}: ${msg.error.message}`))
        else resolve((msg.result as Record<string, unknown>) || {})
      })
      socket.send(JSON.stringify({ id: 1, method, params }))
    })
  } finally {
    socket.close()
  }
}

/** Run JavaScript in the page and get the value back. */
export async function evaluateOn(
  endpoint: string,
  targetId: string,
  expression: string
): Promise<unknown> {
  return await onPage(endpoint, targetId, async call => {
    const out = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    const thrown = out.exceptionDetails as { text?: string } | undefined
    if (thrown) throw new Error(`page threw: ${thrown.text ?? 'unknown'}`)
    const result = out.result as { value?: unknown } | undefined
    return result?.value
  })
}

/**
 * A click where the person would see one: a real mouse press and release at a
 * point, not a synthetic DOM event. A page that only reacts to trusted events
 * -- which is most of the ones worth automating -- ignores the synthetic kind.
 */
export async function clickAt(
  endpoint: string,
  targetId: string,
  x: number,
  y: number
): Promise<void> {
  const base = { x, y, button: 'left', clickCount: 1 }
  await onPage(endpoint, targetId, async call => {
    await call('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' })
    await call('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' })
  })
}

/** Types into whatever has focus, character by character, as a person would. */
export async function typeText(
  endpoint: string,
  targetId: string,
  text: string
): Promise<void> {
  await onPage(endpoint, targetId, async call => {
    for (const ch of text) {
      await call('Input.dispatchKeyEvent', { type: 'char', text: ch })
    }
  })
}

export async function screenshot(
  endpoint: string,
  targetId: string
): Promise<string> {
  return await onPage(endpoint, targetId, async call => {
    const out = await call('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 70,
    })
    return String(out.data ?? '')
  })
}

/**
 * THE WINDOW FILLS THE SCREEN, EVERY TIME THE SCREEN CHANGES SHAPE.
 *
 * Reshaping the desktop resizes the X screen and nothing else. Chromium's
 * window kept the size it had before, and the window manager did not
 * re-maximise it. Measured in the running pod, 2026-09-21: screen 800x1600,
 * window 945x1060 -- wider than the screen, so the right edge of every page
 * was cut off, and 540px shorter, so the bottom third of the picture was the
 * bare black desktop. Those were the "black fields" in the owner's photo.
 *
 * So after the screen changes, every window is set to exactly the screen:
 * first back to "normal" (a maximised or fullscreen window refuses explicit
 * bounds), then to 0,0 at the screen's size. Explicit bounds rather than
 * "maximised": the window manager is the part that did not notice the screen
 * change, so asking it to maximise could answer with the old size again.
 */
export interface WindowIo {
  targets: (endpoint: string) => Promise<CdpTarget[]>
  wsUrl: (endpoint: string) => Promise<string>
  call: (
    wsUrl: string,
    method: string,
    params?: Record<string, unknown>
  ) => Promise<Record<string, unknown>>
}

const WINDOW_IO: WindowIo = {
  targets: listTargets,
  wsUrl: browserWsUrl,
  call: callOnTarget,
}

/** Returns how many windows were fitted. */
export async function fitWindowToScreen(
  endpoint: string,
  size: { width: number; height: number },
  io: WindowIo = WINDOW_IO
): Promise<number> {
  const pages = (await io.targets(endpoint)).filter(t => t.type === 'page')
  if (pages.length === 0) return 0
  const ws = await io.wsUrl(endpoint)

  /* Tabs share a window; each window is fitted once. */
  const windows = new Set<number>()
  for (const page of pages) {
    try {
      const found = await io.call(ws, 'Browser.getWindowForTarget', {
        targetId: page.id,
      })
      if (typeof found.windowId === 'number') windows.add(found.windowId)
    } catch {
      /* A tab closing under us has no window left to fit. */
    }
  }

  for (const windowId of windows) {
    await io.call(ws, 'Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal' },
    })
    await io.call(ws, 'Browser.setWindowBounds', {
      windowId,
      bounds: { left: 0, top: 0, width: size.width, height: size.height },
    })
  }
  return windows.size
}
