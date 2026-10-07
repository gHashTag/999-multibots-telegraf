/**
 * THE OWNER'S CARD "CONNECT THREADS AND LINKEDIN" (specs/automation/connect-card.t27).
 *
 * Threads and LinkedIn can be posted to by the blog desk only after the owner
 * grants consent on the network's own page, and until now the only door to
 * that page was a screen deep in the app's Profile. This module brings the
 * door to the chat he already reads:
 *
 *   runConnectCard     one card, buttons only for networks that can be
 *                      connected, an honest line for those that cannot;
 *                      sent at most once a week per network, never once
 *                      the network is connected
 *   GET  /api/social/connect/<nonce>   a tiny page, opened by a Telegram
 *                      web_app button, so it carries his signed launch data
 *   POST /api/social/connect/<nonce>   redeems the link with that signature
 *                      (or his app session) and answers the consent URL;
 *                      the agent's key is refused before anything is spent
 *
 * The OAuth start and callback themselves are meta-connect.ts and
 * social-api.ts, unchanged: the link only leads to them. Connecting posts
 * nothing; every post still waits for the owner's yes (blog-share.ts).
 * The card carries a link, never a token, and the link is not a credential
 * to the network: it starts a consent the owner must still grant himself.
 */
import { randomBytes } from 'node:crypto'
import { openBrowserButton } from '../browser/announce'
import type { Queryable } from '../browser/sessions'
import * as SPEC from '../spec/connect-card.gen'
import {
  appOf,
  canSeal,
  readTokens,
  redirectUri,
  startConnect,
  statusView,
  type Network,
} from './meta-connect'
import { startApiConnect } from './social-api'

type Env = Record<string, string | undefined>

/* ---------------------------------------------------------------------------
 * The rules, mirrored from the spec (its tests run against these).
 * ------------------------------------------------------------------------- */

export type ConnectState =
  | 'connected'
  | 'needs-connect'
  | 'no-client-id'
  | 'no-seal-key'

/** A link is honoured once, and only while it is young. Pure. */
export function linkOk(ageMs: number, used: boolean): boolean {
  return !used && ageMs < SPEC.LINK_TTL_MS
}

/** Where a network stands; a usable token wins whatever else is true. Pure. */
export function connectState(
  app: boolean,
  sealable: boolean,
  held: boolean,
  usable: boolean
): ConnectState {
  if (held && usable) return 'connected'
  if (!app) return 'no-client-id'
  if (!sealable) return 'no-seal-key'
  return 'needs-connect'
}

/** Not connected, and the last card for it is a week old or there was none. Pure. */
export function shouldCard(
  state: ConnectState,
  everSent: boolean,
  sinceMs: number
): boolean {
  return state !== 'connected' && (!everSent || sinceMs >= SPEC.CARD_EVERY_MS)
}

/** Only a network that can really be connected gets a button. Pure. */
export function hasButton(state: ConnectState): boolean {
  return state === 'needs-connect'
}

/** The door that turns a link into a consent page opens for the person only. Pure. */
export function mayStart(actor: 'agent' | 'person'): boolean {
  return actor === 'person'
}

/* ---------------------------------------------------------------------------
 * Where every network stands, for the card, the status door and social_status.
 * ------------------------------------------------------------------------- */

export const CARD_TARGETS: readonly Network[] = ['threads', 'linkedin']
const ALL: readonly Network[] = ['threads', 'facebook', 'linkedin', 'x']

/** Which networks have their app on the service: a yes or no, never the id. */
export function appsOf(env: Env = process.env): Record<Network, boolean> {
  const out = {} as Record<Network, boolean>
  for (const n of ALL) out[n] = !!appOf(n, env)
  return out
}

/** The connect state of each network from its app and what is held. Pure. */
export function connectStates(
  apps: Record<Network, boolean>,
  held: ReadonlyArray<{ network: string; usable?: unknown }>,
  sealable: boolean
): Record<Network, ConnectState> {
  const out = {} as Record<Network, ConnectState>
  for (const n of ALL) {
    const row = held.find(h => h.network === n)
    out[n] = connectState(!!apps[n], sealable, !!row, row?.usable === true)
  }
  return out
}

const LABEL: Record<Network, string> = {
  threads: 'Threads',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
}

/** Names of the variables a network needs; names only, never a value. */
const VARS: Record<Network, string> = {
  threads: 'THREADS_APP_ID, THREADS_APP_SECRET',
  facebook: 'META_APP_ID, META_APP_SECRET',
  linkedin: 'LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET',
  x: 'X_CLIENT_ID, X_CLIENT_SECRET',
}

/* ---------------------------------------------------------------------------
 * The links table: one row per network per card.
 * ------------------------------------------------------------------------- */

let linksReady = false
export async function ensureConnectLinks(q: Queryable): Promise<void> {
  if (linksReady) return
  await q.query(`CREATE TABLE IF NOT EXISTS social_connect_links (
    nonce text PRIMARY KEY,
    owner text NOT NULL,
    network text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    used boolean NOT NULL DEFAULT false,
    stale boolean NOT NULL DEFAULT false
  )`)
  linksReady = true
}
export function resetConnectLinksForTests(): void {
  linksReady = false
}

/** When each network was last carded (ms since epoch); a stale row does not count. */
async function lastCarded(
  q: Queryable,
  owner: string
): Promise<Map<string, number>> {
  const { rows } = await q.query(
    `SELECT network, extract(epoch from max(created_at)) * 1000 AS last
       FROM social_connect_links
      WHERE owner = $1 AND stale = false
      GROUP BY network`,
    [owner]
  )
  return new Map(rows.map(r => [String(r.network), Number(r.last)]))
}

/* ---------------------------------------------------------------------------
 * The card.
 * ------------------------------------------------------------------------- */

export interface CardDeps {
  pool: Queryable
  owner: string
  /** The Bot API send; sendToTelegram in production, a recorder in tests. */
  send: (owner: string, text: string, markup?: unknown) => Promise<void>
  now: () => number
  env?: Env
}

/** The render's own origin, the one the OAuth callback already lives on. */
function base(env: Env): string {
  return redirectUri(env).replace(/\/api\/social\/meta\/callback$/, '')
}

const nonce = (): string => randomBytes(24).toString('base64url')

export async function runConnectCard(d: CardDeps): Promise<string> {
  const env = d.env ?? process.env
  if (!d.owner) return 'no owner'
  await ensureConnectLinks(d.pool)
  const held = statusView(await readTokens(d.pool, d.owner, env), d.now())
  const states = connectStates(appsOf(env), held as never, canSeal(env))
  const last = await lastCarded(d.pool, d.owner)
  const due = CARD_TARGETS.filter(n => {
    const at = last.get(n)
    return shouldCard(states[n], at !== undefined, d.now() - (at ?? 0))
  })
  if (due.length === 0) return 'nothing due'

  // cyrillic-ok-next-line: the owner reads Russian
  const lines = [
    'Подключите соцсети для блога: одно нажатие — и откроется страница самой сети, где вы даёте согласие.',
  ]
  const buttons: Array<Array<{ text: string; web_app: { url: string } }>> = []
  const ids: string[] = []
  for (const n of due) {
    const id = nonce()
    ids.push(id)
    const button = hasButton(states[n])
    /* A network with no button is still recorded, so the honest line is sent
     * once a week too; its row is born used and can never be redeemed. */
    await d.pool.query(
      `INSERT INTO social_connect_links (nonce, owner, network, created_at, used)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5)`,
      [id, d.owner, n, d.now(), !button]
    )
    if (button) {
      /* A web_app button: the page opens inside Telegram, signed by it. */
      buttons.push([
        openBrowserButton(
          `Подключить ${LABEL[n]}`, // cyrillic-ok: button label
          `${base(env)}/api/social/connect/${id}`
        ),
      ])
    } else if (states[n] === 'no-client-id') {
      lines.push(
        `${LABEL[n]}: кнопки нет — на сервисе vibee-render не заданы ${VARS[n]}.` // cyrillic-ok: told to the owner
      )
    } else {
      lines.push(
        `${LABEL[n]}: кнопки нет — не задан META_TOKEN_KEY, токен нечем запечатать.` // cyrillic-ok: told to the owner
      )
    }
  }
  if (buttons.length > 0)
    lines.push(
      'Ссылка действует час и один раз. Публикации по-прежнему только после вашего «да».' // cyrillic-ok: told to the owner
    )
  try {
    await d.send(
      d.owner,
      lines.join('\n\n'),
      buttons.length > 0 ? { inline_keyboard: buttons } : undefined
    )
  } catch (e) {
    /* A card that never arrived is not a card sent: its rows go stale, so the
     * week's wait does not start and the next tick tries again. */
    await d.pool.query(
      `UPDATE social_connect_links SET stale = true, used = true
        WHERE nonce = ANY($1::text[])`,
      [ids]
    )
    throw e
  }
  return `carded ${due.join(', ')}`
}

/* ---------------------------------------------------------------------------
 * The door a card's button opens.
 * ------------------------------------------------------------------------- */

const LINK_PATH = /^\/api\/social\/connect\/([A-Za-z0-9_-]{16,64})$/

export function isConnectLinkPath(path: string): boolean {
  return LINK_PATH.test(path)
}

export interface LinkDeps {
  getPool: () => Promise<Queryable>
  /** The person's own credential only: initData signature or app session. */
  identity: (req: { url?: string; method?: string }) => string | null
  actor: (req: { url?: string; method?: string }) => 'agent' | 'person'
  owner: string
  now: () => number
  env?: Env
}

export type LinkReply =
  | { status: number; json: Record<string, unknown> }
  | { status: number; html: string }

/*
 * The page posts back with Telegram's signed launch data and opens what the
 * door answers with the WebApp's own openLink: the consent page of the
 * network, in the phone's browser, where the owner is signed in.
 */
const PAGE =
  `<!doctype html><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<script src="https://telegram.org/js/telegram-web-app.js"></script>` +
  `<body style="font:16px/1.5 system-ui;padding:32px;background:#111;color:#eee">` +
  `<p id="s">Открываю страницу согласия…</p>` + // cyrillic-ok: shown to the owner
  `<script>(async()=>{const w=window.Telegram&&Telegram.WebApp;const s=document.getElementById('s');` +
  `try{const r=await fetch(location.pathname,{method:'POST',headers:{'x-telegram-init-data':(w&&w.initData)||''}});` +
  `const j=await r.json();if(j.ok&&j.url){w?w.openLink(j.url):location.assign(j.url);` +
  `s.textContent='Страница согласия открыта. Это окно можно закрыть.'}` + // cyrillic-ok: shown to the owner
  `else s.textContent=j.error||'Не получилось.'}` + // cyrillic-ok: shown to the owner
  `catch(e){s.textContent='Нет связи с сервером.'}})()</script></body>` // cyrillic-ok: shown to the owner

export async function handleConnectLink(
  req: { url?: string; method?: string },
  d: LinkDeps
): Promise<LinkReply> {
  const env = d.env ?? process.env
  const path = new URL(req.url || '/', 'http://x').pathname
  const m = path.match(LINK_PATH)
  if (!m) return { status: 404, json: { ok: false } }
  if ((req.method || 'GET') === 'GET') return { status: 200, html: PAGE }
  if (req.method !== 'POST') return { status: 405, json: { ok: false } }

  /* Before the ticket is touched: an agent that read the card spends nothing. */
  if (!mayStart(d.actor(req)))
    return {
      status: 403,
      json: { ok: false, error: 'подключает только сам владелец' }, // cyrillic-ok: user-facing error
    }
  const who = d.identity(req)
  if (!who) return { status: 401, json: { ok: false, error: 'нужна подпись' } } // cyrillic-ok: user-facing error
  if (who !== d.owner) return { status: 403, json: { ok: false } }

  const pool = await d.getPool()
  await ensureConnectLinks(pool)
  /* Taken in one statement: two taps race, one wins. */
  const { rows } = await pool.query(
    `UPDATE social_connect_links SET used = true
      WHERE nonce = $1 AND owner = $2 AND used = false
      RETURNING network, extract(epoch from created_at) * 1000 AS at`,
    [m[1], who]
  )
  const row = rows[0]
  if (!row || !linkOk(d.now() - Number(row.at), false)) {
    /* A dead link puts the card back in the queue: the next tick sends a fresh one. */
    await pool.query(
      `UPDATE social_connect_links SET stale = true
        WHERE owner = $1 AND network IN (
          SELECT network FROM social_connect_links WHERE nonce = $2)`,
      [who, m[1]]
    )
    return {
      status: 410,
      json: {
        ok: false,
        error:
          'Ссылка устарела или уже использована. Новая карточка придёт в течение нескольких минут.', // cyrillic-ok: told to the owner
      },
    }
  }
  const network = String(row.network) as Network
  const out =
    network === 'linkedin' || network === 'x'
      ? await startApiConnect(pool, who, network, env)
      : await startConnect(pool, who, network, env)
  return { status: out.ok ? 200 : 503, json: out }
}
