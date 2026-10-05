/**
 * The engage desk (engage-desk.ts) wired to the person's own browser, their
 * approvals, the blog feed and the one model call kept for prose. Kept apart
 * so every rule in engage-desk.ts stays testable without a pod.
 *
 * READ-ONLY UNTIL A YES. A search opens the network's own search page in the
 * signed-in browser (Reddit: its own search JSON fetched by a Reddit page),
 * reads the posts, and closes the tab. The only writing this file does is in
 * `commentOn`, and engage-desk.ts calls it for a row whose approval says
 * "allowed" and nothing else. Buttons are found by the words printed on them
 * (browser/find-target.ts); the model writes prose and never decides a click.
 *
 * Switched on by ENGAGE_DESK_ENABLED=1.
 */
import type { Queryable } from '../browser/sessions'
import { parseRss, RSS_URL } from './blog-share'
import {
  ANSWER_WAIT_MS,
  engageTick,
  habrThread,
  handleKey,
  parseHabrSearch,
  parsePageItems,
  parseRedditSearch,
  readRules,
  searchUrl,
  voiceFrom,
  VOICE_REFRESH_MS,
  type Answer,
  type Found,
  type Network,
} from './engage-desk'

const settle = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Where the time of the last search is kept, so a deploy cannot forget it. */
export const LAST_SEARCH_KEY = 'engage:last-search'
/** When the open search started; cleared when it ends (spec v3). */
export const SEARCH_STARTED_KEY = 'engage:search-started'
/** The owner's voice profile, rebuilt from his feed once a week. */
export const VOICE_KEY = 'engage:voice'

let running = false

export async function runEngageDesk(pool: Queryable): Promise<string> {
  if (process.env.ENGAGE_DESK_ENABLED !== '1') return 'off'
  if (running) return 'already running'
  const { OWNER_TELEGRAM_ID } = await import('./telegram-tools')
  const owner = String(process.env.ENGAGE_DESK_OWNER || OWNER_TELEGRAM_ID || '')
  if (!owner) return 'no owner'
  const { requestPermission } = await import('../browser/agent-tools')
  const { readApproval } = await import('../browser/approvals')
  const { sendToTelegram } = await import('../auth/telegram-sender')
  const { readStrategy, writeStrategy } = await import('./strategies')
  const { loginsOfPerson } = await import('../browser/logins')
  const { readAsThePerson, writeDraft } = await import('./reddit-wiring')
  running = true
  try {
    return await engageTick({
      pool,
      now: Date.now,
      lastSearch: async () => {
        const row = await readStrategy(pool, LAST_SEARCH_KEY).catch(() => null)
        const at = (row as { at?: unknown } | null)?.at
        const ms = typeof at === 'string' ? Date.parse(at) : NaN
        return Number.isFinite(ms) ? ms : 0
      },
      markSearch: async atMs => {
        await writeStrategy(pool, LAST_SEARCH_KEY, {
          at: new Date(atMs).toISOString(),
        })
      },
      searchStarted: async () => {
        const row = await readStrategy(pool, SEARCH_STARTED_KEY).catch(
          () => null
        )
        const at = (row as { at?: unknown } | null)?.at
        const ms = typeof at === 'string' ? Date.parse(at) : NaN
        return Number.isFinite(ms) ? ms : 0
      },
      markStarted: async atMs => {
        await writeStrategy(pool, SEARCH_STARTED_KEY, {
          at: atMs ? new Date(atMs).toISOString() : null,
        })
      },
      /*
       * The owner's handles beyond the ones engage-desk.ts names: the Reddit
       * account his browser is signed into, and ENGAGE_DESK_OWN_HANDLES
       * (comma-separated) when set. Read only; nothing is guessed.
       */
      ownHandles: async () => {
        const extra = String(process.env.ENGAGE_DESK_OWN_HANDLES ?? '')
          .split(',')
          .map(handleKey)
          .filter(Boolean)
        const me = await readAsThePerson(
          pool,
          owner,
          'https://www.reddit.com/api/me.json'
        ).catch(() => null)
        const name = (typeof me === 'string' ? safeJson(me) : me) as {
          data?: { name?: unknown }
          name?: unknown
        } | null
        const reddit = name?.data?.name ?? name?.name
        return typeof reddit === 'string' && reddit ? [...extra, reddit] : extra
      },
      fetchRss: async () => {
        const r = await fetch(RSS_URL, { signal: AbortSignal.timeout(20_000) })
        if (!r.ok) throw new Error(`feed answered ${r.status}`)
        return await r.text()
      },
      parseRss,
      /*
       * Only a network whose sign-in cookie is SEEN is searched: a search page
       * behind a sign-in wall reads nothing, and "unknown" is not "signed in".
       */
      signedIn: async () => {
        const logins = await loginsOfPerson(pool, owner).catch(() => null)
        return (logins ?? [])
          .filter(l => l.state === 'signed_in')
          .map(l => l.id)
      },
      search: async (network, query) =>
        network === 'reddit'
          ? parseRedditSearch(
              await readAsThePerson(pool, owner, searchUrl('reddit', query)),
              Date.now()
            )
          : network === 'habr'
            ? parseHabrSearch(
                await habrJson(searchUrl('habr', query)),
                Date.now()
              )
            : await searchPage(pool, owner, network, query),
      /*
       * Reddit: the thread's own JSON; Habr: its public comments API, no
       * cookie; elsewhere the page's visible replies.
       */
      thread: async (network, url) =>
        network === 'reddit'
          ? redditThread(
              await readAsThePerson(
                pool,
                owner,
                `${url.replace(/\/$/, '')}.json?limit=20`
              )
            )
          : network === 'habr'
            ? habrThread(await habrJson(habrCommentsUrl(url)))
            : await pageText(pool, owner, url),
      rulesOf: async (_network, community) =>
        community
          ? readRules(
              await readAsThePerson(
                pool,
                owner,
                `https://www.reddit.com/r/${encodeURIComponent(community)}/about/rules.json`
              )
            )
          : { read: false, bansAi: false, bansPromo: false },
      voice: async articles => {
        const row = (await readStrategy(pool, VOICE_KEY).catch(() => null)) as {
          at?: string
          voice?: string
        } | null
        const at = row?.at ? Date.parse(row.at) : NaN
        if (
          row?.voice &&
          Number.isFinite(at) &&
          Date.now() - at < VOICE_REFRESH_MS
        )
          return row.voice
        const voice = voiceFrom(articles)
        await writeStrategy(pool, VOICE_KEY, {
          at: new Date().toISOString(),
          voice,
        }).catch(() => {})
        return voice
      },
      draft: writeDraft,
      ask: what => requestPermission(pool, owner, what, ANSWER_WAIT_MS),
      answerOf: async id =>
        ((await readApproval(pool, id))?.state ?? 'expired') as Answer,
      comment: (network, url, text) =>
        commentOn(pool, owner, network, url, text),
      readBack: (network, url, snippet) => readBack(pool, owner, url, snippet),
      leads: (network, url, snippet) =>
        network === 'reddit'
          ? readAsThePerson(
              pool,
              owner,
              `${url.replace(/\/$/, '')}.json?limit=200`
            ).then(raw => ({ replies: repliesUnder(raw, snippet) }))
          : Promise.resolve({ replies: null }),
      tell: text => sendToTelegram(owner, `[Engage] ${text}`),
    })
  } finally {
    running = false
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/**
 * Habr's public API, read by the server itself: no cookie, no tab in the
 * person's browser. A refusal is an error, said in the tally -- never "0".
 */
async function habrJson(url: string): Promise<unknown> {
  const r = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!r.ok) throw new Error(`habr answered ${r.status}`)
  return await r.json()
}

/** A Habr post URL -> its comments API. Pure. */
export function habrCommentsUrl(url: string): string {
  const id = /\/(\d+)\/?$/.exec(url)?.[1] ?? ''
  return `https://habr.com/kek/v2/articles/${id}/comments/`
}

/*
 * The probe each search page runs: the posts as the person sees them. Read
 * by the attributes the networks render today; a page that changed shape
 * yields nothing, and nothing is proposed -- never a guess.
 */
const PROBE: Record<Exclude<Network, 'reddit'>, string> = {
  x: `[...document.querySelectorAll('article')].slice(0, 20).map(a => {
    const t = a.querySelector('time'); const l = t && t.closest('a');
    const u = a.querySelector('[data-testid="User-Name"]');
    const tx = a.querySelector('[data-testid="tweetText"]');
    return { url: l ? l.href : '', author: u ? (u.innerText.split('\\n')[1] || '') : '',
             text: tx ? tx.innerText : '', at: t ? t.getAttribute('datetime') : '' };
  })`,
  linkedin: `[...document.querySelectorAll('[data-urn^="urn:li:activity"], [data-id^="urn:li:activity"]')].slice(0, 20).map(e => {
    const urn = e.getAttribute('data-urn') || e.getAttribute('data-id');
    const tx = e.querySelector('.update-components-text, .feed-shared-text');
    const au = e.querySelector('.update-components-actor__title, .update-components-actor__name');
    const sub = e.querySelector('.update-components-actor__sub-description');
    return { url: 'https://www.linkedin.com/feed/update/' + urn + '/',
             author: au ? au.innerText.split('\\n')[0].trim() : '',
             text: tx ? tx.innerText : '', rel: sub ? sub.innerText : '' };
  })`,
  threads: `[...document.querySelectorAll('a[href*="/post/"] time')].slice(0, 20).map(t => {
    const a = t.closest('a'); let box = a; for (let i = 0; i < 6 && box && box.parentElement; i++) box = box.parentElement;
    const au = box ? box.querySelector('a[href^="/@"]') : null;
    return { url: a ? a.href : '', author: au ? au.innerText : '',
             text: box ? box.innerText : '', at: t.getAttribute('datetime') };
  })`,
  habr: `[...document.querySelectorAll('article')].slice(0, 20).map(a => {
    const l = a.querySelector('a.tm-title__link, h2 a'); const t = a.querySelector('time');
    const au = a.querySelector('.tm-user-info__username');
    return { url: l ? l.href : '', author: au ? au.innerText.trim() : '',
             text: a.innerText, at: t ? t.getAttribute('datetime') : '' };
  })`,
}

/** Reddit thread JSON -> the top replies as text, or null when unreadable. */
export function redditThread(raw: unknown): string | null {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!Array.isArray(data) || data.length < 2) return null
  const kids = (data[1] as { data?: { children?: unknown[] } })?.data?.children
  if (!Array.isArray(kids)) return null
  return kids
    .map(k => (k as { data?: { body?: unknown } })?.data?.body)
    .filter((b): b is string => typeof b === 'string')
    .slice(0, 12)
    .map(b => `- ${b.replace(/\s+/g, ' ').slice(0, 300)}`)
    .join('\n')
}

/** Replies under the comment that starts with `snippet`, or null. */
export function repliesUnder(raw: unknown, snippet: string): number | null {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!Array.isArray(data) || data.length < 2) return null
  const walk = (list: unknown): number | null => {
    const kids = (list as { data?: { children?: unknown[] } })?.data?.children
    if (!Array.isArray(kids)) return null
    for (const k of kids) {
      const c = (k as { data?: Record<string, unknown> })?.data
      if (!c) continue
      const body = String(c.body ?? '').replace(/\s+/g, ' ')
      if (body.startsWith(snippet)) {
        const r = c.replies as { data?: { children?: unknown[] } } | ''
        return r && Array.isArray(r.data?.children)
          ? r.data!.children!.length
          : 0
      }
      const deeper = c.replies ? walk(c.replies) : null
      if (deeper !== null) return deeper
    }
    return null
  }
  return walk(data[1])
}

/** The visible text of a post page (its replies), read and the tab closed. */
async function pageText(
  pool: Queryable,
  owner: string,
  url: string
): Promise<string | null> {
  const { endpointOf } = await import('./reddit-wiring')
  const { newDeskPage } = await import('../browser/desk-page')
  const { evaluateOn, closePage } = await import('../browser/cdp')
  const cdp = await endpointOf(pool, owner, 'engage')
  const page = await newDeskPage(cdp, url, { pool, telegramId: owner })
  try {
    await settle(8_000)
    const t = await evaluateOn(
      cdp,
      page.id,
      `document.body.innerText.replace(/\\s+/g, ' ').slice(0, 4000)`
    ).catch(() => null)
    return typeof t === 'string' && t.length > 0 ? t : null
  } finally {
    await closePage(cdp, page.id).catch(() => {})
  }
}

async function searchPage(
  pool: Queryable,
  owner: string,
  network: Exclude<Network, 'reddit'>,
  query: string
): Promise<Found[]> {
  const { endpointOf } = await import('./reddit-wiring')
  const { newDeskPage } = await import('../browser/desk-page')
  const { evaluateOn, closePage } = await import('../browser/cdp')
  const cdp = await endpointOf(pool, owner, 'engage')
  const page = await newDeskPage(cdp, searchUrl(network, query), {
    pool,
    telegramId: owner,
  })
  try {
    await settle(8_000)
    const raw = await evaluateOn(cdp, page.id, PROBE[network])
    /* A probe that did not run is a search error, not "read 0 posts". */
    if (!Array.isArray(raw)) throw new Error('the search page did not read')
    return parsePageItems(network, raw, Date.now())
  } finally {
    /* A search must not leave the person's browser fuller than it was. */
    await closePage(cdp, page.id).catch(() => {})
  }
}

/*
 * The words each network prints on its comment controls, in order: what to
 * press to open the box, then the box itself (typed into), then the button
 * that posts. English and the Russian the person's browser may show.
 *
 * THE BOX'S OWN NAME, NOT THE GREY HINT IN IT (2026-10-05, measured on the
 * owner's pod): X's "Post your reply" is a placeholder div drawn over the
 * editor, and the editor itself is called "Post text"; Reddit, shown in
 * Russian, names its box and its button in words the list did not have
 * (below). The old words found nothing, and four approved comments
 * stopped at the box.
 */
export const STEPS: Record<
  Network,
  { open: string[] | null; box: string[]; send: string[] }
> = {
  x: {
    open: null,
    box: ['post text', 'post your reply', 'опубликуйте ответ'], // cyrillic-ok: X's Russian label
    send: ['reply', 'ответить'], // cyrillic-ok: X's Russian label
  },
  linkedin: {
    open: ['comment', 'комментировать'], // cyrillic-ok: LinkedIn's Russian label
    box: ['add a comment', 'добавьте комментарий'], // cyrillic-ok: LinkedIn's Russian label
    send: ['comment', 'post', 'комментировать', 'опубликовать'], // cyrillic-ok: LinkedIn's Russian label
  },
  threads: {
    open: ['reply', 'ответить'], // cyrillic-ok: Threads' Russian label
    box: ['reply to', 'ответить'], // cyrillic-ok: Threads' Russian label
    send: ['post', 'опубликовать'], // cyrillic-ok: Threads' Russian label
  },
  habr: {
    open: null,
    box: ['comment', 'комментарий'], // cyrillic-ok: Habr's Russian label
    send: ['send', 'отправить'], // cyrillic-ok: Habr's Russian label
  },
  reddit: {
    open: null,
    box: [
      'join the conversation',
      'add a comment',
      'вступить в беседу',
      'присоединиться к обсуждению',
    ], // cyrillic-ok: Reddit's Russian label
    send: ['comment', 'комментарий', 'комментировать'], // cyrillic-ok: Reddit's Russian label
  },
}

/**
 * THE ONLY WRITE. Called by engage-desk.ts for an approved row and nothing
 * else. The tab is brought to the front so the person sees what is typed,
 * and LEFT OPEN when a control is missing: a half-typed approved comment is
 * one tap for the owner to finish.
 */
async function commentOn(
  pool: Queryable,
  owner: string,
  network: Network,
  url: string,
  text: string
): Promise<string> {
  const { endpointOf, pressOne } = await import('./reddit-wiring')
  const { newDeskPage, deskType } = await import('../browser/desk-page')
  const { activatePage } = await import('../browser/cdp')
  const cdp = await endpointOf(pool, owner, 'engage')
  const who = { pool, telegramId: owner }
  const page = await newDeskPage(cdp, url, who)
  await activatePage(cdp, page.id).catch(() => {})
  await settle(8_000)
  const s = STEPS[network]
  if (s.open) {
    await pressOne(who, cdp, page.id, s.open)
    await settle(2_000)
  }
  await pressOne(who, cdp, page.id, s.box)
  await settle(1_000)
  await deskType(who, cdp, page.id, text)
  await settle(1_500)
  const pressed = await pressOne(who, cdp, page.id, s.send)
  await settle(5_000)
  return `нажато «${pressed}»` // cyrillic-ok: told to the owner
}

/** The receipt: the post page, opened fresh, carries the comment's words. */
async function readBack(
  pool: Queryable,
  owner: string,
  url: string,
  snippet: string
): Promise<boolean> {
  const { endpointOf } = await import('./reddit-wiring')
  const { newDeskPage } = await import('../browser/desk-page')
  const { evaluateOn, closePage } = await import('../browser/cdp')
  const cdp = await endpointOf(pool, owner, 'engage')
  const page = await newDeskPage(cdp, url, { pool, telegramId: owner })
  try {
    await settle(8_000)
    const found = await evaluateOn(
      cdp,
      page.id,
      `document.body.innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(snippet)})`
    )
    return found === true
  } finally {
    await closePage(cdp, page.id).catch(() => {})
  }
}
