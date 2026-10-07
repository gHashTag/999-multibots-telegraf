/**
 * A LINK TO WATCH THE BROWSER, WITH NO WHEEL ATTACHED.
 *
 * 2026-10-03, from the competitor table (remote-browser skill): Browserbase,
 * Steel and Anchor hand out a "live view" URL so a second person can watch an
 * agent work. Ours had one viewer -- the owner, through his own session
 * cookie -- and the only way to show somebody else was to hand them that
 * cookie, which is the wheel, the keyboard and every login.
 *
 * A watch link is the other thing: pictures one way, and nothing else.
 *
 * 1. NO INPUT PATH EXISTS. The viewer gets Chromium's screencast frames over
 *    a socket that reads nothing (frames.ts); there is no neko session, no
 *    WebRTC, no CDP address. The link cannot type, click, take the wheel or
 *    read a cookie, because nothing behind it can.
 * 2. ONLY THE PERSON MAKES ONE. The doors in routes.ts refuse the agent key:
 *    an agent publishing its owner's screen would be the invisible mode the
 *    whole design refuses, turned inside out.
 * 3. THE TOKEN IS STORED AS A HASH. The table holds sha256 of it; the link is
 *    shown once, at creation. A leaked database row opens nothing.
 * 4. IT ENDS. A day by default, three at most, revocable at any moment --
 *    and a revoke reaches a viewer already watching within WATCH_RECHECK_MS.
 * 5. PRIVATE PLACES ARE NOT SHOWN. A bank, a mail box, the browser's own
 *    settings, any site on the person's list ("ask" or "block"), and an
 *    address nobody can read: the picture is held, and the viewer sees why.
 *    The address comes from the screencast's own socket in frame order, so
 *    the hold lands before the first frame of the private page.
 * 6. FEW VIEWERS. A link is for showing one or two people, not a broadcast:
 *    WATCH_MAX_VIEWERS_PER_LINK sockets at once, and every opening is a line
 *    in the person's journal.
 *
 * Named limits: an iframe of a private place inside a public page (a payment
 * form on a shop) is painted with the page -- the hold reads the top address
 * only. Watching does not keep the pod awake: the reaper counts the person's
 * own viewer, not this one.
 */
import { createHash, randomBytes } from 'node:crypto'
import { recordStep } from './journal'
import type { Queryable } from './sessions'
import type { SiteRuleRow } from './site-rules'

export const WATCH_PREFIX = '/watch/'
export const WATCH_DEFAULT_HOURS = 24
export const WATCH_MAX_HOURS = 72
/** Live links per person; the oldest must be revoked or expire first. */
export const WATCH_MAX_ACTIVE = 5
export const WATCH_MAX_VIEWERS_PER_LINK = 2
/** How soon a revoke, an expiry or a changed list reaches a viewer. */
export const WATCH_RECHECK_MS = 5_000
export const WATCH_LABEL_MAX = 60
/**
 * After a hold lifts, frames are dropped this long. Chromium keeps one frame
 * in flight until it is acked, so the frame that arrives right after "left
 * the bank" can still be the bank's last paint.
 */
export const WATCH_UNHOLD_QUIET_MS = 300

/** Why the picture is held; null means it is shown. */
export type WatchHold = 'private' | 'browser' | 'unknown' | 'list'

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/

export function newWatchToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** The short public name of a link: enough to revoke it, not to open it. */
export function idOf(hash: string): string {
  return hash.slice(0, 12)
}

/** `/watch/<token>` and `/watch/<token>/frames`; anything else is null. */
export function parseWatchPath(
  path: string
): { token: string; frames: boolean } | null {
  if (!path.startsWith(WATCH_PREFIX)) return null
  const rest = path.slice(WATCH_PREFIX.length).split('/')
  const token = rest[0] ?? ''
  if (!TOKEN_SHAPE.test(token)) return null
  if (rest.length === 1) return { token, frames: false }
  if (rest.length === 2 && rest[1] === 'frames') return { token, frames: true }
  return null
}

/**
 * Is this place shown to a watcher? Pure: the list is read by the caller,
 * and a list that could not be read (null) holds everything -- a person who
 * put their bank on "block" did not agree to it being shown when the
 * database hiccups.
 */
export function watchHold(
  url: string,
  rules: SiteRuleRow[] | null,
  sensitive: (url: string) => boolean,
  ruleFor: (url: string, rules: SiteRuleRow[]) => string | null
): WatchHold | null {
  if (rules === null) return 'list'
  const u = url.trim()
  if (!u) return 'unknown'
  let protocol: string
  try {
    protocol = new URL(u).protocol
  } catch {
    return 'unknown'
  }
  if (u === 'about:blank' || /^chrome:\/\/newtab\/?$/i.test(u)) return null
  if (!/^https?:$/.test(protocol)) return 'browser'
  if (sensitive(u)) return 'private'
  if (ruleFor(u, rules)) return 'private'
  return null
}

let tableReady = false

export async function ensureWatchLinks(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(
    `CREATE TABLE IF NOT EXISTS browser_watch_links (
       token_hash   text PRIMARY KEY,
       telegram_id  text NOT NULL,
       label        text,
       created_at   timestamptz NOT NULL DEFAULT now(),
       expires_at   timestamptz NOT NULL,
       revoked_at   timestamptz,
       views        integer NOT NULL DEFAULT 0,
       last_view_at timestamptz
     )`,
    []
  )
  tableReady = true
}

/** Test seam: the cached flag would otherwise leak between test cases. */
export function resetWatchLinksForTests(): void {
  tableReady = false
  viewers.clear()
}

export type CreateResult =
  | { ok: true; token: string; id: string; expiresAt: string }
  | { ok: false; status: number; error: string }

export async function createWatchLink(
  q: Queryable,
  telegramId: string,
  want: { hours?: unknown; label?: unknown },
  now: number = Date.now(),
  token: string = newWatchToken()
): Promise<CreateResult> {
  const raw =
    want.hours === undefined ? WATCH_DEFAULT_HOURS : Number(want.hours)
  if (!Number.isFinite(raw) || raw <= 0 || raw > WATCH_MAX_HOURS)
    return {
      ok: false,
      status: 400,
      error: `hours must be above 0 and at most ${WATCH_MAX_HOURS}`,
    }
  const label =
    typeof want.label === 'string'
      ? want.label.trim().slice(0, WATCH_LABEL_MAX) || null
      : null
  await ensureWatchLinks(q)
  const { rows } = await q.query(
    `SELECT count(*)::int AS n FROM browser_watch_links
      WHERE telegram_id = $1 AND revoked_at IS NULL AND expires_at > $2`,
    [telegramId, new Date(now).toISOString()]
  )
  if (Number(rows[0]?.n ?? 0) >= WATCH_MAX_ACTIVE)
    return {
      ok: false,
      status: 409,
      error: `${WATCH_MAX_ACTIVE} links are live already: revoke one first`,
    }
  const hash = hashOf(token)
  const expiresAt = new Date(now + raw * 3_600_000).toISOString()
  await q.query(
    `INSERT INTO browser_watch_links (token_hash, telegram_id, label, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [hash, telegramId, label, new Date(now).toISOString(), expiresAt]
  )
  return { ok: true, token, id: idOf(hash), expiresAt }
}

export interface WatchLinkView {
  id: string
  label: string | null
  createdAt: string
  expiresAt: string
  revoked: boolean
  live: boolean
  views: number
  watchingNow: number
  lastViewAt: string | null
}

/** The person's links, newest first. The token is never in here. */
export async function listWatchLinks(
  q: Queryable,
  telegramId: string,
  now: number = Date.now()
): Promise<WatchLinkView[]> {
  await ensureWatchLinks(q)
  const { rows } = await q.query(
    `SELECT token_hash, label, created_at, expires_at, revoked_at, views, last_view_at
       FROM browser_watch_links WHERE telegram_id = $1
      ORDER BY created_at DESC LIMIT 20`,
    [telegramId]
  )
  const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null)
  return rows.map(r => {
    const id = idOf(String(r.token_hash))
    const expiresAt = iso(r.expires_at) ?? new Date(0).toISOString()
    const revoked = r.revoked_at != null
    return {
      id,
      label: r.label == null ? null : String(r.label),
      createdAt: iso(r.created_at) ?? expiresAt,
      expiresAt,
      revoked,
      live: !revoked && Date.parse(expiresAt) > now,
      views: Number(r.views ?? 0),
      watchingNow: viewers.get(id) ?? 0,
      lastViewAt: iso(r.last_view_at),
    }
  })
}

/** Revoke by the short id; only the person's own links. */
export async function revokeWatchLink(
  q: Queryable,
  telegramId: string,
  id: unknown,
  now: number = Date.now()
): Promise<boolean> {
  if (typeof id !== 'string' || !/^[0-9a-f]{12}$/.test(id)) return false
  await ensureWatchLinks(q)
  const { rows } = await q.query(
    `UPDATE browser_watch_links SET revoked_at = $3
      WHERE telegram_id = $1 AND left(token_hash, 12) = $2 AND revoked_at IS NULL
      RETURNING token_hash`,
    [telegramId, id, new Date(now).toISOString()]
  )
  return rows.length > 0
}

/** Whose browser a token shows, or null: unknown, revoked or expired. */
export async function resolveWatch(
  q: Queryable,
  token: string,
  now: number = Date.now()
): Promise<{ telegramId: string; id: string } | null> {
  if (!TOKEN_SHAPE.test(token)) return null
  await ensureWatchLinks(q)
  const hash = hashOf(token)
  const { rows } = await q.query(
    `SELECT telegram_id FROM browser_watch_links
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2`,
    [hash, new Date(now).toISOString()]
  )
  const who = rows[0]?.telegram_id
  return who ? { telegramId: String(who), id: idOf(hash) } : null
}

/** Sockets open per link id, in this process. */
const viewers = new Map<string, number>()

export function enterViewer(id: string): boolean {
  const n = viewers.get(id) ?? 0
  if (n >= WATCH_MAX_VIEWERS_PER_LINK) return false
  viewers.set(id, n + 1)
  return true
}

export function leaveViewer(id: string): void {
  const n = (viewers.get(id) ?? 1) - 1
  if (n > 0) viewers.set(id, n)
  else viewers.delete(id)
}

/**
 * The watcher's socket: binary frames and short JSON notes. `onClose` MUST
 * call `fn` at once when the socket is already closed -- a seat is freed
 * there, and a watcher who left during a database read would otherwise hold
 * it for the life of the process (the bee on #3510). `watchViewerOf` keeps
 * that promise for a `ws` socket.
 */
export interface WatchViewer {
  send(data: Buffer | string): void
  readonly bufferedAmount: number
  close(code?: number): void
  onClose(fn: () => void): void
}

/** What `watchViewerOf` needs of a `ws` WebSocket. */
export interface WsLike {
  readonly readyState: number
  readonly bufferedAmount: number
  send(data: Buffer | string, opts: { binary: boolean }): void
  close(code?: number): void
  on(event: 'close', fn: () => void): unknown
}

/** ws.CLOSED: its close event has already fired. */
const WS_CLOSED = 3

/**
 * A `ws` socket as a WatchViewer. The close is tracked from the moment of
 * wrapping, so a handler added later still runs, once, when the socket is
 * already gone.
 */
export function watchViewerOf(ws: WsLike): WatchViewer {
  let closed = ws.readyState === WS_CLOSED
  const waiting: Array<() => void> = []
  ws.on('close', () => {
    closed = true
    for (const fn of waiting.splice(0)) fn()
  })
  return {
    send: data => {
      if (!closed) ws.send(data, { binary: typeof data !== 'string' })
    },
    get bufferedAmount() {
      return ws.bufferedAmount
    },
    close: code => ws.close(code),
    onClose: fn => {
      if (closed) fn()
      else waiting.push(fn)
    },
  }
}

export interface WatchIo {
  /** The person's site list; null when it cannot be read. */
  rules: () => Promise<SiteRuleRow[] | null>
  /** Is the link still live (not revoked, not expired)? */
  stillLive: () => Promise<boolean>
  /** The id of the page in front now, or null when unknown. */
  frontId: () => Promise<string | null>
  sensitive: (url: string) => boolean
  ruleFor: (url: string, rules: SiteRuleRow[]) => string | null
  /** Start the screencast; resolves to the way to stop it. */
  cast: (
    onFrame: (jpeg: Buffer) => void,
    opts: { onUrl: (url: string) => void; onPage: (id: string) => void }
  ) => Promise<() => void>
}

/** Socket close codes the watch page understands. */
export const WATCH_CLOSE = {
  /** The person moved to another tab: reconnect and follow it. */
  front: 4001,
  /** The link was revoked or ran out: stop for good. */
  ended: 4003,
  /** Too many watchers on this link. */
  full: 4029,
} as const

/**
 * Frames of the person's front tab to a watcher, held on private places,
 * until the watcher leaves, the link ends, the person changes tabs or
 * `maxMs` passes. Never throws.
 */
export async function serveWatch(
  viewer: WatchViewer,
  io: WatchIo,
  opts: { recheckMs?: number; maxMs?: number; maxBuffered?: number } = {}
): Promise<void> {
  const recheckMs = opts.recheckMs ?? WATCH_RECHECK_MS
  const maxBuffered = opts.maxBuffered ?? 1024 * 1024
  let rules: SiteRuleRow[] | null = null
  try {
    rules = await io.rules()
  } catch {
    rules = null
  }
  let url = ''
  let pageId = ''
  let hold: WatchHold | null = 'unknown'
  let told: WatchHold | null | undefined
  let quietUntil = 0
  let skipOne = false
  /* Before the first address nothing was shown, so there is nothing to quiet. */
  let seen = false
  let done = false
  let stop: (() => void) | null = null
  let tick: ReturnType<typeof setInterval> | null = null
  let cap: ReturnType<typeof setTimeout> | null = null

  const say = () => {
    if (done || told === hold) return
    told = hold
    viewer.send(JSON.stringify({ hold }))
  }
  const judge = () => {
    const was = hold
    hold = watchHold(url, rules, io.sensitive, io.ruleFor)
    if (seen && was && !hold) {
      quietUntil = Date.now() + WATCH_UNHOLD_QUIET_MS
      skipOne = true
    }
    say()
  }
  const finish = (code = 1000) => {
    if (done) return
    done = true
    if (tick) clearInterval(tick)
    if (cap) clearTimeout(cap)
    try {
      stop?.()
    } catch {
      /* The pod may be gone already. */
    }
    viewer.close(code)
  }
  viewer.onClose(() => finish())
  /* A socket that was already gone fires at once: start nothing. */
  if (done) return
  if (opts.maxMs) cap = setTimeout(() => finish(), opts.maxMs)
  judge()

  tick = setInterval(() => {
    void (async () => {
      if (done) return
      try {
        if (!(await io.stillLive())) return finish(WATCH_CLOSE.ended)
      } catch {
        return finish(WATCH_CLOSE.ended)
      }
      try {
        rules = await io.rules()
      } catch {
        rules = null
      }
      judge()
      const front = await io.frontId().catch(() => null)
      if (front && pageId && front !== pageId) finish(WATCH_CLOSE.front)
    })()
  }, recheckMs)

  try {
    stop = await io.cast(
      jpeg => {
        if (done || hold) return
        if (skipOne || Date.now() < quietUntil) {
          skipOne = false
          return
        }
        if (viewer.bufferedAmount > maxBuffered) return
        viewer.send(jpeg)
      },
      {
        onUrl: u => {
          url = u
          judge()
          seen = true
        },
        onPage: id => {
          pageId = id
        },
      }
    )
    if (done) stop()
  } catch {
    finish(1011)
  }
}

/** What the watch page says on each hold, in the watcher's language. */
const HOLD_TEXT = {
  ru: {
    private: 'Владелец на личной странице: картинка на паузе', // cyrillic-ok: UI text
    browser: 'Открыта служебная страница браузера: картинка на паузе', // cyrillic-ok: UI text
    unknown: 'Ждём страницу…', // cyrillic-ok: UI text
    list: 'Картинка на паузе', // cyrillic-ok: UI text
    off: 'Браузер сейчас выключен. Страница подключится сама.', // cyrillic-ok: UI text
    ended: 'Ссылка закончилась или отозвана.', // cyrillic-ok: UI text
    full: 'По этой ссылке уже смотрят двое.', // cyrillic-ok: UI text
    title: 'Браузер — только просмотр', // cyrillic-ok: UI text
    note: 'Только просмотр: отсюда нельзя ничего нажать или ввести.', // cyrillic-ok: UI text
  },
  en: {
    private: 'The owner is on a private page: the picture is paused',
    browser: 'A browser settings page is open: the picture is paused',
    unknown: 'Waiting for the page…',
    list: 'The picture is paused',
    off: 'The browser is off right now. This page will connect by itself.',
    ended: 'This link has ended or was revoked.',
    full: 'Two people are already watching through this link.',
    title: 'Browser — watch only',
    note: 'Watch only: nothing can be pressed or typed from here.',
  },
} as const

/**
 * The watch page. No framework, no cookie, no input: an image swapped per
 * frame, a veil for holds, and a reconnect when the person changes tabs.
 */
export function watchPageHtml(nonce: string): string {
  const text = JSON.stringify(HOLD_TEXT).replace(/</g, '\\u003c')
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Watch</title>
<style nonce="${nonce}">
html,body{margin:0;height:100%;background:#0b0b0f;color:#e8e8ee;font:15px/1.4 system-ui,sans-serif}
#stage{position:fixed;inset:0 0 34px 0;display:flex;align-items:center;justify-content:center}
#shot{max-width:100%;max-height:100%;object-fit:contain}
#veil{position:fixed;inset:0 0 34px 0;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;background:rgba(11,11,15,.92)}
#bar{position:fixed;left:0;right:0;bottom:0;height:34px;display:flex;align-items:center;justify-content:center;font-size:13px;opacity:.7}
</style></head>
<body><div id="stage"><img id="shot" alt=""></div><div id="veil"></div><div id="bar"></div>
<script nonce="${nonce}">
(function(){
var T=${text};var L=(navigator.language||'').toLowerCase().indexOf('ru')===0?T.ru:T.en;
document.title=L.title;document.getElementById('bar').textContent=L.note;
var img=document.getElementById('shot'),veil=document.getElementById('veil'),last=null,over=false;
function show(t){veil.textContent=t||'';veil.style.display=t?'flex':'none'}
function connect(){
  if(over)return;
  var p=location.pathname.replace(/\\/$/,'');
  var w=Math.min(1600,Math.round(innerWidth*(devicePixelRatio||1))),h=Math.min(1600,Math.round(innerHeight*(devicePixelRatio||1)));
  var ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+p+'/frames?w='+w+'&h='+h);
  ws.binaryType='blob';
  ws.onmessage=function(e){
    if(typeof e.data==='string'){try{var m=JSON.parse(e.data);show(m.hold?L[m.hold]||L.list:'')}catch(_){}return}
    var u=URL.createObjectURL(e.data);img.onload=function(){if(last)URL.revokeObjectURL(last);last=u};img.src=u;
  };
  ws.onclose=function(e){
    if(e.code===4003){over=true;show(L.ended);return}
    if(e.code===4029){show(L.full);setTimeout(connect,15000);return}
    if(e.code===4001){setTimeout(connect,300);return}
    if(e.code===1011){show(L.off);setTimeout(connect,10000);return}
    setTimeout(connect,2000);
  };
}
connect();
})();
</script></body></html>`
}

/** Headers for the watch page: no cache, no referrer (the token is in the path), no framing. */
export function watchPageHeaders(nonce: string): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; img-src blob:; connect-src 'self'; " +
      `script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; ` +
      "frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  }
}

export function watchNonce(): string {
  return randomBytes(16).toString('base64')
}

/** The full address of a link, for the person to copy. */
export function watchUrl(
  token: string,
  env: Record<string, string | undefined> = process.env
): string {
  const base = (
    env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
  return `${base}${WATCH_PREFIX}${token}`
}

/** Count one opening, and leave a line in the person's journal. */
export async function noteView(
  q: Queryable,
  telegramId: string,
  token: string,
  now: number = Date.now()
): Promise<void> {
  try {
    await q.query(
      `UPDATE browser_watch_links SET views = views + 1, last_view_at = $2 WHERE token_hash = $1`,
      [hashOf(token), new Date(now).toISOString()]
    )
    await recordStep(q, telegramId, {
      tool: 'watch_link',
      ok: true,
      ms: 0,
      detail: { link: idOf(hashOf(token)), event: 'opened' },
    })
  } catch {
    /* A view that cannot be counted is still a view that is shown. */
  }
}

/**
 * The whole socket of one watcher, from the token to the last frame. The
 * caller has upgraded already; every refusal is a close code the page reads.
 * Nothing here starts, wakes or touches the pod: a stopped browser is "off",
 * and the person's own session is not kept alive by a watcher.
 */
export async function openWatch(
  pool: Queryable,
  token: string,
  viewer: WatchViewer,
  size: { width: number; height: number }
): Promise<void> {
  /*
   * The close is heard BEFORE the first await: a watcher who leaves while
   * the token is being read must not take a seat afterwards, and one who
   * leaves later must give it back.
   */
  let closed = false
  let seat: string | null = null
  const leave = () => {
    if (seat) leaveViewer(seat)
    seat = null
  }
  viewer.onClose(() => {
    closed = true
    leave()
  })
  let who: { telegramId: string; id: string } | null = null
  try {
    who = await resolveWatch(pool, token)
  } catch {
    viewer.close(1011)
    return
  }
  if (closed) return
  if (!who) {
    viewer.close(WATCH_CLOSE.ended)
    return
  }
  const { telegramId, id } = who
  if (!enterViewer(id)) {
    viewer.close(WATCH_CLOSE.full)
    return
  }
  seat = id
  try {
    const { readSession } = await import('./sessions')
    const session = await readSession(pool, telegramId)
    const cdp = session?.state === 'live' ? session.cdpEndpoint : null
    if (!cdp) {
      leave()
      viewer.close(1011)
      return
    }
    await noteView(pool, telegramId, token)
    const [{ siteRulesOf, ruleFor }, { isSensitive }, cdpMod, frames] =
      await Promise.all([
        import('./site-rules'),
        import('./guard'),
        import('./cdp'),
        import('./frames'),
      ])
    await serveWatch(
      viewer,
      {
        rules: () => siteRulesOf(pool, telegramId),
        stillLive: async () => (await resolveWatch(pool, token)) !== null,
        frontId: async () => (await cdpMod.frontPage(cdp)).id,
        sensitive: u => isSensitive(u),
        ruleFor,
        cast: (onFrame, opts) =>
          frames.startScreencast(
            cdp,
            frames.frameSize(size.width, size.height),
            onFrame,
            frames.SCREENCAST_IO,
            opts
          ),
      },
      { maxMs: frames.FRAMES_MAX_MS }
    )
  } catch {
    leave()
    viewer.close(1011)
  }
}
