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

import WebSocket from 'ws'

export interface CdpTarget {
  id: string
  type: string
  title: string
  url: string
  webSocketDebuggerUrl?: string
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

export async function listTargets(endpoint: string): Promise<CdpTarget[]> {
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

export async function newPage(
  endpoint: string,
  url: string
): Promise<CdpTarget> {
  /* PUT, not GET: Chrome refuses the old GET form since 111. */
  const res = await fetch(
    `${httpBase(endpoint)}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' }
  )
  if (!res.ok) throw new Error(`CDP new page failed: HTTP ${res.status}`)
  return reachable((await res.json()) as CdpTarget, endpoint)
}

export async function closePage(endpoint: string, id: string): Promise<void> {
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
export async function browserWsUrl(endpoint: string): Promise<string> {
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
  const socket = new WebSocket(await browserWsUrl(endpoint), {
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
      socket.once('error', e => {
        clearTimeout(timer)
        reject(e)
      })
    })

    socket.on('message', raw => {
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
  const socket = new WebSocket(wsUrl, { perMessageDeflate: false })
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
      socket.once('error', e => {
        clearTimeout(timer)
        reject(e)
      })
    })

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`CDP ${method} timed out`)),
        CALL_TIMEOUT_MS
      )
      socket.on('message', raw => {
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
