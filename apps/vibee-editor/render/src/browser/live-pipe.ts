/**
 * THE PIPE ITSELF: BYTES BETWEEN THE PERSON AND THEIR POD.
 *
 * `live-proxy.ts` decides whether the request may pass; this moves it. The
 * split is deliberate -- the decision is pure and mutation-tested, and this
 * file is the part that cannot be tested without sockets.
 *
 * TWO REWRITES HAPPEN HERE, both to keep one session's browser out of
 * another's reach:
 *
 *   going up   -- our own `blive_<id>` cookie is stripped. It authenticates
 *                 the person to US, and the pod has no business holding a
 *                 token that opens itself.
 *   coming back -- the pod's own cookies are re-scoped from `Path=/` to this
 *                 session's path, so a second session in the same browser
 *                 cannot be handed the first one's room cookie.
 */

import { request as httpRequest } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { cookieNameFor, LIVE_PREFIX, LOGIN_PLACEHOLDER } from './live-proxy'

/** Ours to hold, never to forward. */
export function stripOurCookie(
  cookieHeader: string | undefined,
  sessionId: string
): string | undefined {
  if (!cookieHeader) return undefined
  const name = cookieNameFor(sessionId)
  const kept = cookieHeader
    .split(';')
    .map(p => p.trim())
    .filter(p => p.slice(0, p.indexOf('=')).trim() !== name)
  return kept.length ? kept.join('; ') : undefined
}

/**
 * A cookie the pod sets for the whole site would be sent to every path we
 * serve, including another session's. Pin it to this session instead.
 */
export function rescopeSetCookie(
  values: string[] | string | undefined,
  sessionId: string
): string[] {
  const list = Array.isArray(values) ? values : values ? [values] : []
  const scope = `${LIVE_PREFIX}${sessionId}`
  return list.map(v =>
    /;\s*Path=/i.test(v)
      ? v.replace(/;\s*Path=[^;]*/i, `; Path=${scope}`)
      : `${v}; Path=${scope}`
  )
}

function hostPort(endpoint: string): { host: string; port: number } {
  const at = endpoint.lastIndexOf(':')
  return { host: endpoint.slice(0, at), port: Number(endpoint.slice(at + 1)) }
}

export interface PipeTarget {
  endpoint: string
  upstreamPath: string
  sessionId: string
  /** Server-side only. Swapped into the pod login; never sent to a client. */
  viewToken: string
}

/** The one request whose body we touch: the page logging in to its own pod. */
export function isPodLogin(method: string | undefined, path: string): boolean {
  return (
    (method || 'GET').toUpperCase() === 'POST' && path.startsWith('/api/login')
  )
}

/**
 * The pod's password travels in the WebSocket address, not in a body:
 *
 *   new WebSocket(`${url}?password=${...}&username=${...}`)
 *
 * and neko then calls its OWN /api/login with it, server-side (its log says
 * `agent: Go-http-client`, `module=legacy`). So this, not the body rewrite
 * below, is where the placeholder actually becomes the real token for the
 * flow the page uses. Both are kept: the REST login is a real endpoint too.
 */
export function swapLoginQuery(path: string, viewToken: string): string {
  const [base, query = ''] = path.split('?')
  if (!query) return path
  const params = new URLSearchParams(query)
  if (params.get('password') !== LOGIN_PLACEHOLDER) return path
  params.set('password', viewToken)
  return `${base}?${params.toString()}`
}

/**
 * Swap the placeholder the page was given for the real view token.
 *
 * Anything else is passed through untouched: a body that is not the shape we
 * expect, or a password that is not the placeholder, is somebody typing into
 * the form by hand, and rewriting that would be guessing.
 */
export function rewriteLoginBody(raw: string, viewToken: string): string {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return raw
    if ((parsed as { password?: unknown }).password !== LOGIN_PLACEHOLDER) {
      return raw
    }
    return JSON.stringify({ ...parsed, password: viewToken })
  } catch {
    return raw
  }
}

/** An ordinary request: the page, its assets, neko's REST calls. */
export function pipeHttp(
  target: PipeTarget,
  req: IncomingMessage,
  res: ServerResponse
): void {
  const { host, port } = hostPort(target.endpoint)
  const headers = { ...req.headers }
  delete headers.host
  const cookie = stripOurCookie(req.headers.cookie, target.sessionId)
  if (cookie) headers.cookie = cookie
  else delete headers.cookie

  /*
   * The login is the only body that is read rather than streamed, and it is
   * small. Everything else -- uploads included -- still goes straight
   * through, because buffering a browser's traffic to inspect it would be
   * both slow and none of our business.
   */
  const rewriting = isPodLogin(req.method, target.upstreamPath)
  if (rewriting) delete headers['content-length']

  const upstream = httpRequest(
    {
      host,
      port,
      path: swapLoginQuery(target.upstreamPath, target.viewToken),
      method: req.method,
      headers,
    },
    podRes => {
      const out = { ...podRes.headers }
      if (podRes.headers['set-cookie']) {
        out['set-cookie'] = rescopeSetCookie(
          podRes.headers['set-cookie'],
          target.sessionId
        )
      }
      res.writeHead(podRes.statusCode || 502, out)
      podRes.pipe(res)
    }
  )

  /*
   * A pod that has just been reaped, or is still coming up, fails here. The
   * person gets a plain answer rather than a hung request, because a browser
   * that never answers looks identical to one that is merely slow.
   */
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('browser pod is not reachable')
  })

  if (!rewriting) {
    req.pipe(upstream)
    return
  }
  let raw = ''
  req.on('data', c => (raw += c))
  req.on('end', () => {
    const body = rewriteLoginBody(raw, target.viewToken)
    upstream.setHeader('content-length', Buffer.byteLength(body))
    upstream.end(body)
  })
}

/**
 * The WebSocket: neko's signalling, and the channel that carries the person's
 * keyboard and mouse into the pod. Node hands us a raw socket here, so the
 * upgrade is spoken by hand in both directions.
 */
/**
 * How often an open viewer socket says "still here".
 *
 * The socket is the honest signal that somebody is watching: it carries the
 * keyboard and it stays open for as long as the tab does. A single touch at
 * upgrade time would make a long quiet viewing look idle to the reaper and
 * take the browser out from under the person watching it.
 */
export const WATCHING_HEARTBEAT_MS = 60_000

export function pipeUpgrade(
  target: PipeTarget,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  /** Called while this socket lives, so the idle reaper leaves it alone. */
  onWatching?: () => void
): void {
  const { host, port } = hostPort(target.endpoint)
  const headers = { ...req.headers }
  delete headers.host
  const cookie = stripOurCookie(req.headers.cookie, target.sessionId)
  if (cookie) headers.cookie = cookie
  else delete headers.cookie

  const upstream = httpRequest({
    host,
    port,
    path: swapLoginQuery(target.upstreamPath, target.viewToken),
    method: req.method,
    headers,
  })

  upstream.on('upgrade', (podRes, podSocket, podHead) => {
    const lines = [
      'HTTP/1.1 101 Switching Protocols',
      ...Object.entries(podRes.headers).map(
        ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`
      ),
      '',
      '',
    ]
    socket.write(lines.join('\r\n'))
    if (podHead?.length) socket.write(podHead)
    podSocket.pipe(socket)
    socket.pipe(podSocket)

    onWatching?.()
    const beat = onWatching
      ? setInterval(onWatching, WATCHING_HEARTBEAT_MS)
      : undefined

    /* One half closing must take the other with it, or sockets pile up. */
    const bothDown = () => {
      if (beat) clearInterval(beat)
      /* One last mark: idle is counted from when watching STOPPED. */
      onWatching?.()
      podSocket.destroy()
      socket.destroy()
    }
    podSocket.on('error', bothDown)
    socket.on('error', bothDown)
    podSocket.on('close', bothDown)
    socket.on('close', bothDown)
  })

  /* A pod that answers the upgrade with an ordinary response is not usable. */
  upstream.on('response', () => socket.destroy())
  upstream.on('error', () => socket.destroy())

  if (head?.length) upstream.write(head)
  upstream.end()
}

/** Refuse an upgrade without leaving the socket open. */
export function refuseUpgrade(socket: Duplex, status: number): void {
  socket.write(`HTTP/1.1 ${status} \r\nConnection: close\r\n\r\n`)
  socket.destroy()
}
