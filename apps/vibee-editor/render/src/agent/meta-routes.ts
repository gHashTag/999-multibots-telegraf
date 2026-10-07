/**
 * The doors of the Meta connector (meta-connect.ts):
 *
 *   GET /api/social/meta/start?network=threads|facebook|linkedin|x  owner, by their own hand
 *   GET /api/social/meta/callback                        Meta's redirect; the state is the proof
 *   GET /api/social/meta/status                          owner; never a token
 *   GET /api/social/card/<slug>.jpg                      public; Meta fetches the card here
 */
import type { Queryable } from '../browser/sessions'
import {
  appOf,
  finishConnect,
  readTokensRelinked,
  scrub,
  startConnect,
  statusView,
  takeState,
  type Fetch,
  type Network,
} from './meta-connect'
import { finishApiConnect, startApiConnect } from './social-api'

export function isMetaPath(path: string): boolean {
  return (
    path === '/api/social/meta/start' ||
    path === '/api/social/meta/callback' ||
    path === '/api/social/meta/status' ||
    /^\/api\/social\/card\/[a-z0-9-]{1,120}\.jpg$/.test(path)
  )
}

export interface MetaDeps {
  getPool: () => Promise<Queryable>
  identity: (req: { url?: string; method?: string }) => string | null
  actor: (req: { url?: string; method?: string }) => 'agent' | 'person'
  owner: string
  fetch: Fetch
  now: () => number
  /** The title of a blog article by its slug, from the feed; null if none. */
  titleOf: (slug: string) => Promise<string | null>
  drawCard: (title: string) => Promise<Buffer>
}

export type MetaReply =
  | { status: number; json: Record<string, unknown> }
  | { status: number; html: string }
  | { status: number; jpeg: Buffer }

const page = (said: string): string =>
  `<!doctype html><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<body style="font:16px/1.5 system-ui;padding:32px;background:#111;color:#eee">` +
  `<p>${said.replace(/[<>&]/g, c => `&#${c.charCodeAt(0)};`)}</p></body>`

export async function handleMeta(
  req: { url?: string; method?: string },
  d: MetaDeps
): Promise<MetaReply> {
  const u = new URL(req.url || '/', 'http://x')
  const path = u.pathname

  const card = path.match(/^\/api\/social\/card\/([a-z0-9-]{1,120})\.jpg$/)
  if (card) {
    const title = await d.titleOf(card[1]).catch(() => null)
    if (!title) return { status: 404, json: { ok: false } }
    return { status: 200, jpeg: await d.drawCard(title) }
  }

  if (path === '/api/social/meta/callback') {
    const pool = await d.getPool()
    const st = await takeState(pool, u.searchParams.get('state') || '', d.now())
    if (!st)
      return {
        status: 400,
        html: page(
          'Ссылка устарела или уже использована. Начните подключение заново.'
        ), // cyrillic-ok: shown to the owner
      }
    const code = u.searchParams.get('code')
    if (!code)
      return {
        status: 400,
        html: page(
          `Подключение отменено: ${scrub(u.searchParams.get('error_description') || 'нет кода')}`
        ), // cyrillic-ok: shown to the owner
      }
    try {
      const who =
        st.network === 'linkedin' || st.network === 'x'
          ? await finishApiConnect(
              pool,
              d.fetch,
              st.owner,
              st.network,
              code,
              st.verifier,
              d.now()
            )
          : await finishConnect(
              pool,
              d.fetch,
              st.owner,
              st.network,
              code,
              d.now()
            )
      return {
        status: 200,
        html: page(`Подключено: ${who}. Окно можно закрыть.`),
      } // cyrillic-ok: shown to the owner
    } catch (e) {
      return { status: 502, html: page(`Не получилось: ${scrub(String(e))}`) } // cyrillic-ok: shown to the owner
    }
  }

  const who = d.identity(req)
  if (!who) return { status: 401, json: { ok: false, error: 'нужна подпись' } } // cyrillic-ok: user-facing error
  if (who !== d.owner) return { status: 403, json: { ok: false } }
  const pool = await d.getPool()

  if (path === '/api/social/meta/status') {
    /* A Page's Instagram linked after Connect is found here too (v2). */
    const held = await readTokensRelinked(pool, d.fetch, who, d.now())
    /* Whether each Meta app is configured: a yes or no, never the id or secret. */
    const apps = {
      threads: !!appOf('threads'),
      facebook: !!appOf('facebook'),
      linkedin: !!appOf('linkedin'),
      x: !!appOf('x'),
    }
    return {
      status: 200,
      json: { ok: true, apps, networks: statusView(held, d.now()) },
    }
  }

  /* Connecting is the owner's own act: an agent may not grant itself a network. */
  if (d.actor(req) !== 'person')
    return {
      status: 403,
      json: { ok: false, error: 'подключает только сам владелец' },
    } // cyrillic-ok: user-facing error
  const network = u.searchParams.get('network')
  if (network === 'linkedin' || network === 'x') {
    const out = await startApiConnect(pool, who, network)
    return { status: out.ok ? 200 : 503, json: out }
  }
  if (network !== 'threads' && network !== 'facebook')
    return {
      status: 400,
      json: { ok: false, error: 'network: threads | facebook | linkedin | x' },
    }
  const out = await startConnect(pool, who, network as Network)
  return { status: out.ok ? 200 : 503, json: out }
}
