/**
 * The blog-share cron (blog-share.ts) wired to the real feed, the owner's
 * approvals and their browser. Kept apart so the logic stays testable.
 */
import type { Queryable } from '../browser/sessions'
import type { DeskWho } from '../browser/desk-page'
import {
  ANSWER_WAIT_MS,
  blogShareTick,
  parseRss,
  LEFT_THE_FORM,
  needleOf,
  NO_PROFILE_CHECK,
  NOT_SEEN_ON_PROFILE,
  PROFILE_LOOK_EVERY_MS,
  PROFILE_LOOKS,
  PROFILE_SETTLE_MS,
  profileUrlFor,
  RSS_URL,
  SEEN_ON_PROFILE,
  seenOn,
  SHARE_LABELS,
  shareUrls,
  summaryWithEvidence,
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
  const { postByApi, VIA_API } = await import('./meta-connect')
  const { postBySocialApi } = await import('./social-api')
  const apiDeps = {
    fetch: ((url: string, init?: object) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })) as never,
    sleep: settle,
  }
  /* LinkedIn and X by their own APIs too (social-api.t27), same rule. */
  const [meta, social] = await Promise.all(
    [postByApi, postBySocialApi].map(post =>
      post(pool, owner, cardPost(a), apiDeps).catch(
        () => ({}) as Record<string, string>
      )
    )
  )
  const viaApi: Record<string, string> = { ...meta, ...social }

  const { startBrowserAsAgent } = await import('../browser/routes')
  const { readSession } = await import('../browser/sessions')
  const { newDeskPage } = await import('../browser/desk-page')
  const { evaluateOn, clickAt, closePage } = await import('../browser/cdp')
  const { findProbe, foundOf } = await import('../browser/find-target')
  let s = await readSession(pool, owner)
  if (!s || s.state !== 'live' || !s.cdpEndpoint) {
    await startBrowserAsAgent(owner, 'blog-share')
    s = await readSession(pool, owner)
  }
  if (!s?.cdpEndpoint)
    return Object.keys(viaApi).length
      ? { ...viaApi, browser: 'браузер не запустился' } // cyrillic-ok: told to the owner
      : { error: 'the browser did not start' }
  const cdp = s.cdpEndpoint
  const who: DeskWho = { pool, telegramId: owner }
  const urls = shareUrls(a)
  const out: Record<string, string> = { ...viaApi }
  /*
   * X FIRST, AS A THREAD (blog-share.ts xThread). The link is not in the
   * first post: it goes below, in the same thread. If the composer does not
   * answer as expected, the old one-post share is used instead and the
   * owner is told which of the two happened.
   */
  const { noteShape } = await import('./reach-log')

  /*
   * A NETWORK THE BROWSER IS NOT SIGNED INTO IS NOT OPENED (#2965's rule,
   * browser/logins.ts): its share page would be a sign-in form, and "Post"
   * on a sign-in form is somebody else's button. Unreadable logins: every
   * network is tried, as before. Read BEFORE the X thread, which used to open
   * X's composer whatever the browser held.
   */
  const { loginsOfPerson, readMarks } = await import('../browser/logins')
  const { judgeUse, refusedLine } = await import('../browser/login-use')
  const { isNotConnected } = await import('./rounds')
  const { receiptOf } = await import('./blog-share')
  const logins = await loginsOfPerson(pool, owner).catch(() => null)
  /* The owner's line for a network that is not opened, by WHY it is not. */
  const notOpened = (net: string): string => {
    const l = logins?.find(x => x.name === net)
    return l?.state === 'refused'
      ? refusedLine(l.refusedAt)
      : 'не подключена — вход не найден, ничего не нажато' // cyrillic-ok: told to the owner
  }
  /*
   * A GATED PAGE IS THE LOGIN'S TEST (login-use.ts). The share page and the
   * composer need the login to show; one that lands on the network's sign-in
   * page is a refusal, written down so browser_logins says `refused` until
   * the person signs in again. Its tab is closed: a sign-in form left behind
   * is the stuck-sign-in litter `tri browser tidy` kept finding.
   */
  const walled = async (asked: string, pageId: string): Promise<boolean> => {
    /* Origin and path only: a sign-in URL's query can carry a one-time token. */
    const landed = String(await evaluateOn(cdp, pageId, LANDED).catch(() => ''))
    const use = await judgeUse(pool, owner, asked, landed, () => readMarks(cdp))
    if (!use?.refused) return false
    await closePage(cdp, pageId).catch(() => undefined)
    return true
  }

  /* Posted by X's API already: no thread in the browser on top of it. */
  if (String(viaApi.X || '').startsWith(VIA_API)) {
    /* nothing: the API answered */
  } else if (isNotConnected(urls.x, logins)) {
    out.X = notOpened('X')
  } else
    try {
      const thread = await postThreadOnX(cdp, a, walled, who)
      if (thread === WALLED) out.X = refusedLine(new Date().toISOString())
      else {
        out.X = thread
        /* Which shape it took, written down while it is certain (reach-log.ts). */
        void noteShape(pool, a.slug, 'thread')
      }
    } catch (e) {
      out.X = `тред не получился: ${String(e).slice(0, 100)}` // cyrillic-ok: told to the owner
    }
  for (const [net, url, labels] of [
    ['X', urls.x, SHARE_LABELS.X],
    ['LinkedIn', urls.linkedin, SHARE_LABELS.LinkedIn],
    ['Reddit', urls.reddit, SHARE_LABELS.Reddit],
    ['Threads', urls.threads, SHARE_LABELS.Threads],
  ] as const) {
    if (net === 'X' && !String(out.X || '').startsWith('тред не получился'))
      continue
    /* Already answered by its API -- the browser does not post it twice. */
    if (net !== 'X' && net in viaApi) continue
    if (isNotConnected(url, logins)) {
      out[net] = notOpened(net)
      continue
    }
    try {
      const page = await newDeskPage(cdp, url, who)
      await settle(FIRST_SETTLE_MS)
      if (await walled(url, page.id)) {
        out[net] = refusedLine(new Date().toISOString())
        continue
      }
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
        const check = await confirmIfLeft(cdp, net, a, receipt, who)
        pressed = `${found.label}» · ${receipt} · ${check}`
        /*
         * Every run used to leave its tabs in the person's browser, day
         * after day. A post seen on the profile closes its tab; an
         * unconfirmed one stays open -- it is the only evidence of what
         * went wrong.
         */
        if (check === SEEN_ON_PROFILE)
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
/** Where a page ended up, without its query. */
export const LANDED = 'location.origin + location.pathname'

/** What postThreadOnX answers when X sent its composer to the sign-in page. */
const WALLED = 'walled'

async function postThreadOnX(
  cdp: string,
  a: Article,
  walled: (asked: string, pageId: string) => Promise<boolean>,
  who: DeskWho
): Promise<string> {
  const { xThread } = await import('./blog-share')
  const { newDeskPage } = await import('../browser/desk-page')
  const { evaluateOn, clickAt, typeText, closePage } = await import(
    '../browser/cdp'
  )
  const { findProbe, foundOf } = await import('../browser/find-target')
  const thread = xThread(a)
  const COMPOSE = 'https://x.com/compose/post'
  const page = await newDeskPage(cdp, COMPOSE, who)
  await settle(8_000)
  if (await walled(COMPOSE, page.id)) return WALLED

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
    /*
     * Nothing was pressed, so nothing went out: the draft is closed rather
     * than left open beside the share link the caller opens next -- two X
     * drafts side by side invite the person to post the article twice.
     */
    await closePage(cdp, page.id).catch(() => undefined)
    throw new Error(`no ${labels[0]}`)
  }

  /*
   * What was typed is read back before anything is posted: a box that does
   * not hold it throws, the caller falls back to the share link whose text
   * comes in the URL, and the mangled draft is closed unposted.
   */
  const { composerHolds } = await import('./blog-share')
  const typedInto = async (box: number, text: string): Promise<void> => {
    await typeText(cdp, page.id, text, { enterForNewline: true })
    await settle(1_000)
    const seen = await evaluateOn(cdp, page.id, xComposerText(box)).catch(
      () => null
    )
    if (composerHolds(seen, text)) return
    await closePage(cdp, page.id).catch(() => undefined)
    throw new Error(
      `post ${box + 1} came out different from what was typed -- nothing posted`
    )
  }

  await press(['what is happening', 'что происходит', 'post text']) // cyrillic-ok: X's Russian label
  await typedInto(0, thread.first)
  /* The plus adds another post to the same thread. */
  await press(['add post', 'добавить пост', 'add another post']) // cyrillic-ok: X's Russian label
  await settle(1_000)
  await typedInto(1, thread.second)
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
  const { receiptOf } = await import('./blog-share')
  const receipt = receiptOf(before, after)
  const check = await confirmIfLeft(cdp, 'X', a, receipt, who)
  if (check === SEEN_ON_PROFILE)
    await closePage(cdp, page.id).catch(() => undefined)
  return `тред отправлен («${pressed}»): текст, ссылка вторым постом · ${receipt} · ${check}` // cyrillic-ok: told to the owner
}

/** Runs in the page: the text of every X composer box number `box`. */
export function xComposerText(box: number): string {
  return `[...document.querySelectorAll('[data-testid="tweetTextarea_${box}"]')].map(e => e.innerText)`
}

/** The post the API connectors are given: the card lives at our own address. */
function cardPost(a: Article) {
  const base = (
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
  return {
    title: a.title,
    link: a.link,
    /* LinkedIn, Facebook and Instagram have room for the evidence label. */
    summary: summaryWithEvidence(a),
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
/**
 * Only a page that left the form is worth a look at the profile; anything
 * else is already unconfirmed by its receipt.
 */
async function confirmIfLeft(
  cdp: string,
  net: string,
  a: Article,
  receipt: string,
  who: DeskWho
): Promise<string> {
  if (receipt !== LEFT_THE_FORM) return NOT_SEEN_ON_PROFILE
  return await confirmOnProfile(cdp, net, needleOf(a), who)
}

/**
 * A RECEIPT IS NOT A POST (spec v2). The page can leave the form for an
 * error page or a sign-in wall. So the owner's own profile is opened in the
 * same browser and the post's opening words are looked for, a few times,
 * because a fresh post reaches the feed late. Reads only: nothing is
 * clicked or typed here. Never throws: a failure is "not seen".
 */
export async function confirmOnProfile(
  cdp: string,
  net: string,
  needle: string,
  who: DeskWho
): Promise<string> {
  const start = profileUrlFor(net)
  if (!start) return NO_PROFILE_CHECK
  const { newDeskPage } = await import('../browser/desk-page')
  const { evaluateOn, closePage } = await import('../browser/cdp')
  let page: { id: string } | null = null
  try {
    page = await newDeskPage(cdp, start, who)
    await settle(PROFILE_SETTLE_MS)
    if (net === 'X') {
      /* x.com/home links to the person's own profile; that page is read. */
      const own = String(
        (await evaluateOn(cdp, page.id, X_PROFILE_LINK).catch(() => '')) || ''
      )
      if (!/^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]+$/.test(own))
        return NOT_SEEN_ON_PROFILE
      await closePage(cdp, page.id).catch(() => undefined)
      page = await newDeskPage(cdp, own, who)
      await settle(PROFILE_SETTLE_MS)
    }
    for (let look = 0; look < PROFILE_LOOKS; look++) {
      if (look > 0) await settle(PROFILE_LOOK_EVERY_MS)
      const text = String(
        (await evaluateOn(cdp, page.id, PAGE_TEXT).catch(() => '')) || ''
      )
      if (seenOn(text, needle)) return SEEN_ON_PROFILE
    }
    return NOT_SEEN_ON_PROFILE
  } catch {
    return NOT_SEEN_ON_PROFILE
  } finally {
    if (page) await closePage(cdp, page.id).catch(() => undefined)
  }
}

const PAGE_TEXT = 'document.body ? document.body.innerText : ""'
const X_PROFILE_LINK =
  '(document.querySelector(\'a[data-testid="AppTabBar_Profile_Link"]\') || {}).href || ""'
