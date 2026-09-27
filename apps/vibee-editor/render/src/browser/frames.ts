/**
 * LIVE FRAMES WHILE THE VIDEO CONNECTS.
 *
 * The video is WebRTC, and WebRTC takes seconds before the first picture:
 * the socket, the offer and answer, ICE over TCP, DTLS, a keyframe. The
 * person stares at a loader for all of it. Chromium can hand over its own
 * frames directly -- Page.startScreencast sends a JPEG whenever the page
 * changes -- over a plain WebSocket that is up in one round trip.
 *
 * So the loader shows the page LIVE, frame by frame, from the moment the
 * window opens, and steps aside when the real video starts. This is the
 * first piece of a "watch" mode (docs §45): the same channel is what a
 * person on a network that WebRTC cannot cross would watch instead.
 *
 * ── WHAT THIS CHANNEL IS NOT ──────────────────────────────────────────────
 *
 * It carries PICTURES ONE WAY. Nothing the person types or clicks goes
 * through it: input stays on the video's own channel, which runs to the pod
 * directly. That is what keeps the owner's first rule intact -- a password
 * the person types reaches the pod and nothing else -- and why this module
 * has no input path at all.
 *
 * It is behind the same door as the video: the /live/ cookie of the
 * person's own session (live-proxy.ts). Same person, same page, fewer bytes.
 */

import { browserWsUrl, frontPage } from './cdp'
import { FRAMES_PATH } from './skin'

/** One home for the path: the window's loader asks for it (skin.ts). */
export { FRAMES_PATH }

/**
 * One screencast's lifetime, not the lifetime of the picture.
 *
 * This was two minutes, which is right for a bridge: the video arrives in
 * seconds and the bridge is gone. It is wrong when the video never arrives --
 * measured 2026-09-27, neko retrying and reloading until it gave up -- because
 * then this channel IS the picture (watch mode, skin.ts) and two minutes was
 * an expiry date on the only thing the person could see.
 *
 * It stays a cap: a screencast nobody is watching must not run forever, and
 * one Chromium under `pids.max` cannot afford stray sessions. What makes the
 * picture outlive it is the window asking again (WATCH_RETRY_MS) -- so the
 * limit guards the resource instead of ending the view.
 */
export const FRAMES_MAX_MS = 10 * 60 * 1000

/** A viewer that cannot keep up gets fewer frames, not a growing queue. */
export const FRAMES_MAX_BUFFERED = 1024 * 1024

export const FRAMES_QUALITY = 55

/** A socket to Chromium: text in, text out. */
export interface CdpSocket {
  send(text: string): void
  close(): void
  onMessage(fn: (text: string) => void): void
  onClose(fn: () => void): void
}

export interface ScreencastIo {
  front: (endpoint: string) => Promise<{ id: string }>
  connect: (endpoint: string) => Promise<CdpSocket>
}

async function connectWs(endpoint: string): Promise<CdpSocket> {
  const mod = (await import('ws')) as unknown as {
    default: new (
      url: string,
      o?: { perMessageDeflate?: boolean }
    ) => {
      send(t: string): void
      close(): void
      once(e: 'open' | 'error', fn: (e?: Error) => void): void
      on(e: 'message', fn: (d: unknown) => void): void
      on(e: 'close', fn: () => void): void
    }
  }
  const ws = new mod.default(await browserWsUrl(endpoint), {
    perMessageDeflate: false,
  })
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', e => reject(e))
  })
  return {
    send: t => ws.send(t),
    close: () => ws.close(),
    onMessage: fn => ws.on('message', d => fn(String(d))),
    onClose: fn => ws.on('close', fn),
  }
}

const SCREENCAST_IO: ScreencastIo = { front: frontPage, connect: connectWs }

export interface FrameSize {
  width: number
  height: number
}

/** The size asked for, kept to what a screen could want. */
export function frameSize(w: unknown, h: unknown): FrameSize {
  const clamp = (v: unknown, fallback: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n > 0
      ? Math.min(1600, Math.max(200, n))
      : fallback
  }
  return { width: clamp(w, 800), height: clamp(h, 1200) }
}

/**
 * Start Chromium's own screencast of the front page. Every frame is handed
 * to `onFrame` and acknowledged -- Chromium sends the next one only after
 * that. Returns the way to stop it.
 */
export async function startScreencast(
  endpoint: string,
  size: FrameSize,
  onFrame: (jpeg: Buffer) => void,
  io: ScreencastIo = SCREENCAST_IO
): Promise<() => void> {
  const page = await io.front(endpoint)
  const sock = await io.connect(endpoint)
  let nextId = 1
  let session = ''
  let stopped = false
  const send = (method: string, params: Record<string, unknown>) =>
    sock.send(
      JSON.stringify({
        id: nextId++,
        method,
        params,
        ...(session ? { sessionId: session } : {}),
      })
    )

  sock.onMessage(text => {
    let msg: {
      id?: number
      result?: { sessionId?: string }
      method?: string
      params?: { data?: string; sessionId?: number }
    }
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }
    if (msg.id === 1 && msg.result?.sessionId) {
      session = msg.result.sessionId
      send('Page.startScreencast', {
        format: 'jpeg',
        quality: FRAMES_QUALITY,
        maxWidth: size.width,
        maxHeight: size.height,
        everyNthFrame: 1,
      })
      return
    }
    if (msg.method === 'Page.screencastFrame' && msg.params) {
      if (msg.params.data) onFrame(Buffer.from(msg.params.data, 'base64'))
      /* Without the ack Chromium sends nothing more. */
      if (!stopped) {
        send('Page.screencastFrameAck', { sessionId: msg.params.sessionId })
      }
    }
  })

  send('Target.attachToTarget', { targetId: page.id, flatten: true })

  return () => {
    if (stopped) return
    stopped = true
    try {
      if (session) send('Page.stopScreencast', {})
    } finally {
      sock.close()
    }
  }
}

/** The viewer's end: a WebSocket as the `ws` library gives it. */
export interface FrameViewer {
  send(data: Buffer): void
  readonly bufferedAmount: number
  close(code?: number): void
  onClose(fn: () => void): void
}

/**
 * Frames from the person's browser to the person's window, until the window
 * closes the socket or FRAMES_MAX_MS passes. Never throws: a window without
 * frames still has its loader and its video coming.
 */
export async function serveFrames(
  viewer: FrameViewer,
  cdpEndpoint: string | null | undefined,
  size: FrameSize,
  io: ScreencastIo = SCREENCAST_IO,
  maxMs = FRAMES_MAX_MS
): Promise<void> {
  if (!cdpEndpoint) {
    viewer.close(1011)
    return
  }
  let stop: (() => void) | null = null
  let done = false
  const finish = () => {
    if (done) return
    done = true
    clearTimeout(cap)
    stop?.()
    viewer.close(1000)
  }
  const cap = setTimeout(finish, maxMs)
  viewer.onClose(finish)
  try {
    stop = await startScreencast(
      cdpEndpoint,
      size,
      jpeg => {
        if (done) return
        /* Behind already: drop this frame, the next one is newer anyway. */
        if (viewer.bufferedAmount > FRAMES_MAX_BUFFERED) return
        viewer.send(jpeg)
      },
      io
    )
    if (done) stop()
  } catch {
    finish()
  }
}
