/**
 * The blog-share cron (blog-share.ts) wired to the real feed, the owner's
 * approvals and their browser. Kept apart so the logic stays testable.
 */
import type { Queryable } from '../browser/sessions'
import {
  ANSWER_WAIT_MS,
  blogShareTick,
  parseRss,
  RSS_URL,
  shareUrls,
  type Article,
  type Answer,
} from './blog-share'
import {
  AFTER_CLICK_SETTLE_MS,
  FIRST_SETTLE_MS,
  LOOK_EVERY_MS,
  LOOKS,
} from '../spec/blog-share.gen'

const settle = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export async function runBlogShare(pool: Queryable): Promise<string> {
  if (process.env.BLOG_SHARE_ENABLED !== '1') return 'off'
  const { OWNER_TELEGRAM_ID } = await import('./telegram-tools')
  const owner = String(process.env.BLOG_SHARE_OWNER || OWNER_TELEGRAM_ID || '')
  if (!owner) return 'no owner'
  const { requestPermission } = await import('../browser/agent-tools')
  const { readApproval } = await import('../browser/approvals')
  const { sendToTelegram } = await import('../auth/telegram-sender')
  return await blogShareTick({
    pool,
    owner,
    now: Date.now,
    fetchRss: async () => {
      const r = await fetch(RSS_URL, { signal: AbortSignal.timeout(20_000) })
      if (!r.ok) throw new Error(`feed answered ${r.status}`)
      return await r.text()
    },
    ask: what => requestPermission(pool, owner, what, ANSWER_WAIT_MS),
    answerOf: async id =>
      ((await readApproval(pool, id))?.state ?? 'expired') as Answer,
    publish: a => publishEverywhere(pool, owner, a),
    tell: text => sendToTelegram(owner, text),
  })
}

/*
 * Each network's own share page, already filled in, then its Post button by
 * label. Never throws for one network: the other still gets its turn, and
 * the owner is told what each did.
 */
export async function publishEverywhere(
  pool: Queryable,
  owner: string,
  a: Article
): Promise<Record<string, string>> {
  /*
   * META'S OWN API FIRST (meta-connect.t27 route()): a network the owner
   * connected by OAuth is posted with its API and comes back with the post's
   * id; only the networks without a token are left to the browser below.
   */
  const { postByApi } = await import('./meta-connect')
  const viaApi = await postByApi(pool, owner, cardPost(a), {
    fetch: (url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }) as never,
    sleep: settle,
  }).catch(() => ({}) as Record<string, string>)

  const { startBrowserAsAgent } = await import('../browser/routes')
  const { readSession } = await import('../browser/sessions')
  const { newPage, evaluateOn, clickAt, closePage } = await import(
    '../browser/cdp'
  )
  const { findProbe, foundOf } = await import('../browser/find-target')
  let s = await readSession(pool, owner)
  if (!s || s.state !== 'live' || !s.cdpEndpoint) {
    await startBrowserAsAgent(owner)
    s = await readSession(pool, owner)
  }
  if (!s?.cdpEndpoint)
    return Object.keys(viaApi).length
      ? { ...viaApi, browser: 'браузер не запустился' } // cyrillic-ok: told to the owner
      : { error: 'the browser did not start' }
  const cdp = s.cdpEndpoint
  const urls = shareUrls(a)
  const out: Record<string, string> = { ...viaApi }
  /*
   * X FIRST, AS A THREAD (blog-share.ts xThread). The link is not in the
   * first post: it goes below, in the same thread. If the composer does not
   * answer as expected, the old one-post share is used instead and the
   * owner is told which of the two happened.
   */
  const { noteShape } = await import('./reach-log')
  try {
    out.X = await postThreadOnX(cdp, a)
    /* Which shape it took, written down while it is certain (reach-log.ts). */
    void noteShape(pool, a.slug, 'thread')
  } catch (e) {
    out.X = `тред не получился: ${String(e).slice(0, 100)}` // cyrillic-ok: told to the owner
  }

  /*
   * A NETWORK THE BROWSER IS NOT SIGNED INTO IS NOT OPENED (#2965's rule,
   * browser/logins.ts): its share page would be a sign-in form, and "Post"
   * on a sign-in form is somebody else's button. Unreadable logins: every
   * network is tried, as before.
   */
  const { loginsOfPerson } = await import('../browser/logins')
  const { isNotConnected } = await import('./rounds')
  const { receiptOf, LEFT_THE_FORM } = await import('./blog-share')
  const logins = await loginsOfPerson(pool, owner).catch(() => null)
  for (const [net, url, labels] of [
    ['X', urls.x, ['post', 'опубликовать']], // cyrillic-ok: X's Russian label
    ['LinkedIn', urls.linkedin, ['post', 'опубликовать']], // cyrillic-ok: LinkedIn's Russian label
    /* Reddit's submit page says "Post"; in Russian, "Опубликовать". */
    ['Reddit', urls.reddit, ['post', 'опубликовать']], // cyrillic-ok: Reddit's Russian label
    /* Threads' composer says "Post"; in Russian, "Опубликовать". */
    ['Threads', urls.threads, ['post', 'опубликовать']], // cyrillic-ok: Threads' Russian label
  ] as const) {
    if (net === 'X' && !String(out.X || '').startsWith('тред не получился'))
      continue
    /* Already answered by its API -- the browser does not post it twice. */
    if (net !== 'X' && net in viaApi) continue
    if (isNotConnected(url, logins)) {
      out[net] = 'не подключена — вход не найден, ничего не нажато' // cyrillic-ok: told to the owner
      continue
    }
    try {
      const page = await newPage(cdp, url)
      await settle(FIRST_SETTLE_MS)
      let pressed: string | null = null
      /*
       * One look at six seconds missed the button on a cold browser: the
       * composer had not drawn yet, and the only allowed article of the month
       * was reported "button not found" on X and LinkedIn alike. Look again
       * every three seconds, up to half a minute.
       */
      let found: ReturnType<typeof foundOf> = null
      for (let look = 0; look < LOOKS && !found; look++) {
        if (look > 0) await settle(LOOK_EVERY_MS)
        for (const label of labels) {
          found = foundOf(
            await evaluateOn(cdp, page.id, findProbe(label)).catch(() => null)
          )
          if (found) break
        }
      }
      if (found) {
        const before = String(
          await evaluateOn(cdp, page.id, 'location.href').catch(() => '')
        )
        await clickAt(cdp, page.id, found.x, found.y)
        await settle(AFTER_CLICK_SETTLE_MS)
        const after = String(
          await evaluateOn(cdp, page.id, 'location.href').catch(() => '')
        )
        const receipt = receiptOf(before, after)
        pressed = `${found.label}» · ${receipt}`
        /*
         * Every run used to leave its tabs in the person's browser, day
         * after day. A confirmed post closes its tab; an unconfirmed one
         * stays open -- it is the only evidence of what went wrong.
         */
        if (receipt === LEFT_THE_FORM)
          await closePage(cdp, page.id).catch(() => undefined)
      }
      if (net === 'X') void noteShape(pool, a.slug, 'single')
      out[net] = pressed
        ? `нажато «${pressed}` // cyrillic-ok: told to the owner
        : 'кнопка публикации не найдена — окно оставлено открытым' // cyrillic-ok: told to the owner
    } catch (e) {
      out[net] = `ошибка: ${String(e).slice(0, 120)}` // cyrillic-ok: told to the owner
    }
  }
  return out
}

/**
 * A thread on X: the words first, the link in the post below (the reader,
 * 2026-09-23 -- posts carrying an external link reach fewer people).
 *
 * Written against the composer the person sees, by the labels they read:
 * the box says what is happening, the plus adds the second post, and the
 * button at the end posts all of them. Anything else throws, and the caller
 * falls back to the old single post rather than leaving the article
 * unpublished.
 */
async function postThreadOnX(cdp: string, a: Article): Promise<string> {
  const { xThread } = await import('./blog-share')
  const { newPage, evaluateOn, clickAt, typeText, closePage } = await import(
    '../browser/cdp'
  )
  const { findProbe, foundOf } = await import('../browser/find-target')
  const thread = xThread(a)
  const page = await newPage(cdp, 'https://x.com/compose/post')
  await settle(8_000)

  const press = async (labels: string[]): Promise<string> => {
    for (const label of labels) {
      const found = foundOf(
        await evaluateOn(cdp, page.id, findProbe(label)).catch(() => null)
      )
      if (found) {
        await clickAt(cdp, page.id, found.x, found.y)
        return found.label
      }
    }
    throw new Error(`no ${labels[0]}`)
  }

  await press(['what is happening', 'что происходит', 'post text'])
  await typeText(cdp, page.id, thread.first)
  await settle(1_000)
  /* The plus adds another post to the same thread. */
  await press(['add post', 'добавить пост', 'add another post'])
  await settle(1_000)
  await typeText(cdp, page.id, thread.second)
  await settle(1_000)
  const before = String(
    await evaluateOn(cdp, page.id, 'location.href').catch(() => '')
  )
  const pressed = await press([
    'post all',
    'опубликовать все',
    'опубликовать всё',
  ])
  await settle(5_000)
  const after = String(
    await evaluateOn(cdp, page.id, 'location.href').catch(() => '')
  )
  const { receiptOf, LEFT_THE_FORM } = await import('./blog-share')
  const receipt = receiptOf(before, after)
  if (receipt === LEFT_THE_FORM)
    await closePage(cdp, page.id).catch(() => undefined)
  return `тред опубликован («${pressed}»): текст, ссылка вторым постом · ${receipt}` // cyrillic-ok: told to the owner
}

/** The post the API connectors are given: the card lives at our own address. */
function cardPost(a: Article) {
  const base = (
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
  return {
    title: a.title,
    link: a.link,
    summary: a.summary,
    cardUrl: `${base}/api/social/card/${a.slug}.jpg`,
  }
}

/*
 * The title of an article by its slug, from the blog's own feed -- the card's
 * public address names a slug, never words, so it cannot print anybody else's.
 * Read once per ten minutes at most.
 */
let feedCache: { at: number; articles: Article[] } | null = null
export async function blogTitleOf(slug: string): Promise<string | null> {
  if (!feedCache || Date.now() - feedCache.at > 600_000) {
    const r = await fetch(RSS_URL, { signal: AbortSignal.timeout(20_000) })
    if (!r.ok) return null
    feedCache = { at: Date.now(), articles: parseRss(await r.text()) }
  }
  return feedCache.articles.find(x => x.slug === slug)?.title ?? null
}
