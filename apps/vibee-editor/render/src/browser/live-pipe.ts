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
import {
  injectSkin,
  shouldDress,
  FIT_PATH,
  AVATAR_PATH,
  BRAND_SOUND_URL,
  ENGINE_CHAT_SOUND,
} from './skin'
import { telegramAvatar } from './avatar'
import { fitDesktop, isVisibleBox, wantedScreen } from './screen'
import {
  cachePolicyFor,
  EMOJI_PATH,
  EMPTY_EMOJI,
  POSTER_PATH,
  posterOf,
} from './fast-start'
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
  /** Server-side only. The pod's admin password; see FIT_PATH below. */
  adminToken?: string
  /** Server-side only. Whose window this is; see AVATAR_PATH. */
  telegramId?: string
  /**
   * The name the person goes by in Telegram (telegram-name.ts). Put into the
   * pod login beside the password, so the page never carries it.
   */
  displayName?: string
  /** Server-side only. Where the window is fitted to the screen. */
  cdpEndpoint?: string | null
}

/**
 * THE WINDOW ASKS FOR ITS OWN SHAPE.
 *
 * The mini app's Browser tab measures its box and asks the broker to reshape
 * the desktop (screen.ts). Somebody who opens the viewer URL directly -- which
 * is how it is tested, and how a link shared to a phone behaves -- had no such
 * fitter, so they got a 1280x800 desktop letterboxed into a phone.
 *
 * This is that fitter, on the viewer's own path. It needs no session of the
 * app: the person already proved who they are to get this far, the cookie is
 * on the request, and the admin password stays on this side. A reserved name
 * under the session's own prefix, so it can never collide with a pod route.
 */
export { FIT_PATH, AVATAR_PATH } from './skin'

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
export function swapLoginQuery(
  path: string,
  viewToken: string,
  displayName?: string
): string {
  const [base, query = ''] = path.split('?')
  if (!query) return path
  const params = new URLSearchParams(query)
  if (params.get('password') !== LOGIN_PLACEHOLDER) return path
  params.set('password', viewToken)
  /*
   * The name goes in only on OUR login -- the one carrying the placeholder --
   * and only when there is one; otherwise the page's own "you" stays.
   */
  if (displayName) params.set('username', displayName)
  return `${base}?${params.toString()}`
}

/**
 * Swap the placeholder the page was given for the real view token.
 *
 * Anything else is passed through untouched: a body that is not the shape we
 * expect, or a password that is not the placeholder, is somebody typing into
 * the form by hand, and rewriting that would be guessing.
 */
export function rewriteLoginBody(
  raw: string,
  viewToken: string,
  displayName?: string
): string {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return raw
    if ((parsed as { password?: unknown }).password !== LOGIN_PLACEHOLDER) {
      return raw
    }
    return JSON.stringify({
      ...parsed,
      password: viewToken,
      ...(displayName ? { username: displayName } : {}),
    })
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
  if (target.upstreamPath.split('?')[0] === FIT_PATH) {
    void fitFromQuery(target, req, res)
    return
  }
  if (target.upstreamPath.split('?')[0] === AVATAR_PATH) {
    void faceOfTheWatcher(target, res)
    return
  }
  /* The product has one sound, and it is ours (skin.ts). */
  if (target.upstreamPath.split('?')[0] === ENGINE_CHAT_SOUND) {
    res.writeHead(302, {
      Location: BRAND_SOUND_URL,
      'Cache-Control': 'public, max-age=86400',
    })
    res.end()
    return
  }
  /* 188 KB for a picker this window hides; see fast-start.ts. */
  if (target.upstreamPath.split('?')[0] === EMOJI_PATH) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
    })
    res.end(EMPTY_EMOJI)
    return
  }
  if (target.upstreamPath.split('?')[0] === POSTER_PATH) {
    void posterForTheLoader(target, res)
    return
  }

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
      path: swapLoginQuery(
        target.upstreamPath,
        target.viewToken,
        target.displayName
      ),
      method: req.method,
      headers,
    },
    podRes => {
      const out = { ...podRes.headers }
      /* A hashed bundle can never change: cache it for a year. */
      const policy = cachePolicyFor(req.method, target.upstreamPath)
      if (policy && (podRes.statusCode || 0) === 200) {
        out['cache-control'] = policy
      }
      if (podRes.headers['set-cookie']) {
        out['set-cookie'] = rescopeSetCookie(
          podRes.headers['set-cookie'],
          target.sessionId
        )
      }

      /*
       * THE DOCUMENT IS DRESSED; EVERYTHING ELSE STREAMS.
       *
       * The window is ours -- our origin, our app, our person -- and it
       * arrived looking like somebody else's product. So the html, which is
       * a few kilobytes of shell, is read and restyled (skin.ts). The video,
       * the scripts, the fonts and every upload still go straight through:
       * buffering a browser's traffic to paint it would be both slow and
       * none of our business.
       */
      if (!shouldDress(podRes.headers)) {
        res.writeHead(podRes.statusCode || 502, out)
        podRes.pipe(res)
        return
      }
      /* The length changes when the skin goes in; chunked is simplest. */
      delete out['content-length']
      /*
       * The dressed document must never come from a cache: the pod's file
       * server sends Last-Modified and no policy, which lets a browser keep
       * yesterday's skin by heuristic. The bundles it loads are the cached
       * part (fast-start.ts), not this.
       */
      out['cache-control'] = 'no-cache'
      delete out['last-modified']
      delete out['etag']
      let page = ''
      podRes.setEncoding('utf8')
      podRes.on('data', c => (page += c))
      podRes.on('end', () => {
        const dressed = injectSkin(page)
        res.writeHead(podRes.statusCode || 502, out)
        res.end(dressed)
      })
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
    const body = rewriteLoginBody(raw, target.viewToken, target.displayName)
    upstream.setHeader('content-length', Buffer.byteLength(body))
    upstream.end(body)
  })
}

/**
 * The page the person left open, for the loader to stand on while the stream
 * connects. 404 when there is none: the loader stands on its own.
 */
async function posterForTheLoader(
  target: PipeTarget,
  res: ServerResponse
): Promise<void> {
  const jpeg = await posterOf(target.cdpEndpoint)
  if (!jpeg) {
    res.writeHead(404, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    })
    res.end('no poster')
    return
  }
  /* The page as it is NOW: never from a cache. */
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'no-store',
  })
  res.end(jpeg)
}

/**
 * The person's own face, for the disc in the bar.
 *
 * 404 when there is none -- no token, no photo, Telegram unreachable. The
 * initials stay and the window works; a face is a nicety, not a function.
 */
async function faceOfTheWatcher(
  target: PipeTarget,
  res: ServerResponse
): Promise<void> {
  const face = target.telegramId
    ? await telegramAvatar(target.telegramId)
    : null
  if (!face) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('no photo')
    return
  }
  res.writeHead(200, {
    'Content-Type': face.contentType,
    /* Their own face, in their own window: never a shared cache. */
    'Cache-Control': 'private, max-age=3600',
  })
  res.end(face.bytes)
}

async function fitFromQuery(
  target: PipeTarget,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const answer = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (!target.adminToken) return answer(409, { ok: false, error: 'no admin' })
  const q = new URLSearchParams((req.url || '').split('?')[1] || '')
  const box = { width: Number(q.get('w')), height: Number(q.get('h')) }
  /* A hidden window is not asking for anything (screen.ts isVisibleBox). */
  if (!isVisibleBox(box)) return answer(200, { ok: true, ignored: 'hidden' })
  const want = wantedScreen(box)
  try {
    const got = await fitDesktop(
      {
        endpoint: target.endpoint,
        adminToken: target.adminToken,
        cdpEndpoint: target.cdpEndpoint,
      },
      want
    )
    answer(200, { ok: true, screen: got })
  } catch (e) {
    /* A pod that will not resize is still a pod; the person keeps watching. */
    answer(502, { ok: false, error: e instanceof Error ? e.message : 'failed' })
  }
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
  /*
   * The pod is never offered compression. Kept as hardening, and NOT the fix
   * it was first shipped as -- corrected the same day.
   *
   * The symptom was "Invalid WebSocket frame: RSV1 must be clear" after the
   * first message, which reads like compression, so compression was blamed.
   * Wrong: capturing the raw bytes showed frame 1's payload was the literal
   * text "TP/1.1 101 Switching Protocols". Two 'upgrade' listeners were
   * answering the same socket -- the editor's sync server and this proxy --
   * and the second 101 was being parsed as a frame header; its bits land on
   * RSV1 by accident. The real fix is the single dispatcher in
   * render-server.ts.
   *
   * Not negotiating compression through a proxy that rewrites the handshake
   * is still the safer default, so it stays.
   */
  delete headers['sec-websocket-extensions']
  const cookie = stripOurCookie(req.headers.cookie, target.sessionId)
  if (cookie) headers.cookie = cookie
  else delete headers.cookie

  const upstream = httpRequest({
    host,
    port,
    path: swapLoginQuery(
      target.upstreamPath,
      target.viewToken,
      target.displayName
    ),
    method: req.method,
    headers,
  })

  upstream.on('upgrade', (podRes, podSocket, podHead) => {
    const lines = [
      'HTTP/1.1 101 Switching Protocols',
      /* And never advertise one back, in case a pod answers with it anyway. */
      ...Object.entries(podRes.headers)
        .filter(([k]) => k.toLowerCase() !== 'sec-websocket-extensions')
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`),
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
