/**
 * The blog-share cron (blog-share.ts) wired to the real feed, the owner's
 * approvals and their browser. Kept apart so the logic stays testable.
 */
import type { Queryable } from '../browser/sessions'
import type { DeskWho } from '../browser/desk-page'
import {
  ANSWER_WAIT_MS,
  autopostOn,
  blogShareTick,
  linkFor,
  parseRss,
  LEFT_THE_FORM,
  needleOf,
  NO_PROFILE_CHECK,
  NOT_SEEN_ON_PROFILE,
  PROFILE_LOOK_EVERY_MS,
  PROFILE_LOOKS,
  PROFILE_SETTLE_MS,
  profileUrlFor,
  QUEUE_SKILL,
  redditPressLine,
  releaseOf,
  RELEASES_URL,
  releaseTitleOfSlug,
  RSS_URL,
  SEEN_ON_PROFILE,
  staticArticleUrl,
  seenOn,
  SHARE_LABELS,
  shareUrls,
  SUBREDDIT,
  summaryWithEvidence,
  type Article,
  type Answer,
  type GhRelease,
} from './blog-share'
import {
  AFTER_CLICK_SETTLE_MS,
  AUTOPOST_SWITCH,
  FIRST_SETTLE_MS,
  LOOK_EVERY_MS,
  LOOKS,
} from '../spec/blog-share.gen'
import type { TelegramAnswer } from './blog-autopost'
/* The channel's env names have one home: channel-delivery.ts. */
import { ENV_NAMES as CHANNEL_ENV } from '../channel-delivery'

const settle = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export async function runBlogShare(pool: Queryable): Promise<string> {
  if (process.env.BLOG_SHARE_ENABLED !== '1') return 'off'
  const { OWNER_TELEGRAM_ID } = await import('./telegram-tools')
  const owner = String(process.env.BLOG_SHARE_OWNER || OWNER_TELEGRAM_ID || '')
  if (!owner) return 'no owner'
  const { requestPermission } = await import('../browser/agent-tools')
  const { readApproval } = await import('../browser/approvals')
  const { sendToTelegram } = await import('../auth/telegram-sender')
  const fetchRss = async () => {
    const r = await fetch(RSS_URL, { signal: AbortSignal.timeout(20_000) })
    if (!r.ok) throw new Error(`feed answered ${r.status}`)
    return await r.text()
  }
  /* The order's one home: the owner's own skill (blog-share.ts QUEUE_SKILL). */
  const queue = async () => {
    const { rows } = await pool.query(
      `SELECT content FROM user_skills WHERE telegram_id = $1 AND name = $2
        ORDER BY updated_at DESC LIMIT 1`,
      [owner, QUEUE_SKILL]
    )
    return String((rows[0] as { content?: unknown } | undefined)?.content ?? '')
  }
  const tell = (text: string) => sendToTelegram(owner, text)

  /*
   * AUTOPOST (spec v6): every new article at once, the backlog on its
   * schedule, Telegram among the networks; the owner gets a receipt. Its own
   * failure never stops the questions below (releases keep their yes).
   */
  const { autopost, said: auto } = await autopostStep({
    pool,
    env: process.env,
    fetchRss,
    queue,
    publish: (a, skip) => publishEverywhere(pool, owner, a, skip),
    tell,
  })
  const said = await blogShareTick({
    pool,
    owner,
    now: Date.now,
    fetchRss,
    ask: what => requestPermission(pool, owner, what, ANSWER_WAIT_MS),
    answerOf: async id =>
      ((await readApproval(pool, id))?.state ?? 'expired') as Answer,
    publish: a => publishEverywhere(pool, owner, a),
    tell,
    queue,
    autopost,
    /* Releases of ours (spec v5): GitHub's list, newest first. */
    releases: {
      list: async () => {
        const r = await fetch(RELEASES_URL, {
          headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(20_000),
        })
        if (!r.ok) throw new Error(`releases answered ${r.status}`)
        return (await r.json()) as GhRelease[]
      },
      done: releaseFinished,
    },
  })
  /* A quiet autopost tick stays out of the log, as a quiet question tick does. */
  return auto && !auto.startsWith('autopost: nothing due')
    ? `${auto}; ${said}`
    : said
}

/**
 * The autopost half of a tick (spec v6): on by BLOG_AUTOPOST=1 (autopost_on),
 * a tick of blog-autopost.ts with the channel as a network; off, the cutoff
 * is cleared. Its failure is said, never thrown: the questions still run.
 */
export async function autopostStep(d: {
  pool: Queryable
  env: Record<string, string | undefined>
  fetchRss: () => Promise<string>
  queue: () => Promise<string>
  publish: (
    a: Article,
    skip: ReadonlySet<string>
  ) => Promise<Record<string, string>>
  tell: (text: string) => Promise<void>
  now?: () => number
  doFetch?: typeof fetch
}): Promise<{ autopost: boolean; said: string }> {
  const autopost = autopostOn(d.env[AUTOPOST_SWITCH] ?? '')
  const { blogAutopostTick, autopostOff } = await import('./blog-autopost')
  try {
    if (!autopost) {
      await autopostOff(d.pool)
      return { autopost, said: '' }
    }
    const said = await blogAutopostTick({
      pool: d.pool,
      now: d.now ?? Date.now,
      fetchRss: d.fetchRss,
      queue: d.queue,
      publish: d.publish,
      telegram: telegramChannel(d.env, d.doFetch),
      tell: d.tell,
    })
    return { autopost, said }
  } catch (e) {
    return { autopost, said: `autopost failed: ${String(e).slice(0, 200)}` }
  }
}

/**
 * THE TELEGRAM CHANNEL AS A NETWORK (spec v6, TELEGRAM). The channel the
 * reels go to (channel-delivery.ts): the same env names, deploy name first
 * (ENV_NAMES via readChannelConfig), the same Bot API host per bot
 * (telegramApiFor). The post is the title and the article's static page --
 * never a #/ route, which every crawler reads as the home page (skill
 * link-previews) -- with the link preview on. The receipt is the message_id.
 */
export function telegramChannel(
  env: Record<string, string | undefined> = process.env,
  doFetch: typeof fetch = fetch
): {
  configured: boolean
  send: (a: Article) => Promise<TelegramAnswer>
} {
  return {
    configured: channelConfig(env).ok,
    send: async a => {
      const cfg = channelConfig(env)
      if (!cfg.ok) return { error: 'the channel is not configured' }
      const { telegramApiFor } = await import('../telegram-api')
      const link = linkFor({ ...a, link: staticArticleUrl(a.link) }, 'telegram')
      const r = await doFetch(`${telegramApiFor(cfg.token)}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text: `${a.title}\n\n${link}`,
          link_preview_options: { is_disabled: false, url: link },
        }),
        signal: AbortSignal.timeout(20_000),
      })
      const body = (await r.json().catch(() => ({}))) as {
        ok?: boolean
        description?: string
        result?: { message_id?: unknown }
      }
      const id = Number(body.result?.message_id)
      if (r.ok && body.ok && Number.isInteger(id)) return { messageId: id }
      return {
        error: String(body.description || `HTTP ${r.status}`).slice(0, 200),
      }
    },
  }
}

/** The channel's token and chat id, read by channel-delivery.ts's own names. */
function channelConfig(env: Record<string, string | undefined>) {
  const read = (names: readonly string[]) =>
    names.map(n => (env[n] || '').trim()).find(Boolean) ?? ''
  const token = read(CHANNEL_ENV.token)
  const chatId = read(CHANNEL_ENV.chatId)
  return { ok: Boolean(token && chatId), token, chatId }
}

/* crates.io refuses a request that does not say who is asking. */
const UA = 'vibee-blog-share (https://t27.ai)'

/**
 * Did the release's pipeline finish? t27c's ends on crates.io: the swarm's
 * job makes the GitHub release before the crate exists. t27b ships no crate;
 * its binaries are the release's assets.
 */
export async function releaseFinished(r: GhRelease): Promise<boolean> {
  const rel = releaseOf(r.tag_name)
  if (!rel) return false
  if (rel.tool === 't27b') return (r.assets ?? []).length > 0
  const res = await fetch(
    `https://crates.io/api/v1/crates/${rel.tool}/${rel.version}`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) }
  )
  return res.ok
}

/*
 * Each network's own share page, already filled in, then its Post button by
 * label. Never throws for one network: the other still gets its turn, and
 * the owner is told what each did.
 */
export async function publishEverywhere(
  pool: Queryable,
  owner: string,
  a: Article,
  /*
   * Networks that already carry the article (spec v6 network_step "skip"):
   * neither their API nor their page is touched. Instagram rides on the
   * Facebook token, so a Facebook that carries it skips Instagram too.
   */
  skip: ReadonlySet<string> = new Set()
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
  const only = apiNetworksFor(skip)
  const [meta, social] = await Promise.all(
    [postByApi, postBySocialApi].map(post =>
      post(pool, owner, cardPost(a), {
        ...apiDeps,
        ...(only ? { only } : {}),
      }).catch(() => ({}) as Record<string, string>)
    )
  )
  const viaApi: Record<string, string> = { ...meta, ...social }

  const { startBrowserAsAgent } = await import('../browser/routes')
  const { readSession } = await import('../browser/sessions')
  const { newDeskPage, deskClick } = await import('../browser/desk-page')
  const { evaluateOn, closePage } = await import('../browser/cdp')
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
  if (skip.has('X')) {
    /* nothing: X carries the article already (v6) */
  } else if (String(viaApi.X || '').startsWith(VIA_API)) {
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
    /* Switched off by the owner (spec v3, network_used): not even opened. */
    ...(urls.reddit === null
      ? []
      : ([['Reddit', urls.reddit, SHARE_LABELS.Reddit]] as const)),
    ['Threads', urls.threads, SHARE_LABELS.Threads],
  ] as const) {
    if (skip.has(net)) continue
    if (net === 'X' && !String(out.X || '').startsWith('тред не получился'))
      continue
    /* Already answered by its API -- the browser does not post it twice. */
    if (net !== 'X' && net in viaApi) continue
    if (isNotConnected(url, logins)) {
      out[net] = notOpened(net)
      continue
    }
    /*
     * A COMMUNITY REDDIT CLOSED IS NOT OPENED (reddit.ts redditShareRefusal):
     * r/t27ai was banned on 2026-10-03, and every run since opened its dead
     * submit page and left the form in the owner's browser. Nor is an
     * article the Reddit desk already offered or posted there opened again.
     */
    if (net === 'Reddit' && SUBREDDIT) {
      const { redditShareRefusal, deskPostedTo } = await import('./reddit')
      const { communityStateFor } = await import('./reddit-wiring')
      const refused = await redditShareRefusal(SUBREDDIT, a.slug, {
        state: communityStateFor(pool, owner),
        deskPosted: (sub, slug) => deskPostedTo(pool, sub, slug),
      })
      if (refused) {
        out[net] = refused
        continue
      }
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
        await deskClick(who, cdp, page.id, found.x, found.y)
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
        ? net === 'Reddit' && SUBREDDIT
          ? redditPressLine(`нажато «${pressed}`, SUBREDDIT) // cyrillic-ok: told to the owner
          : `нажато «${pressed}` // cyrillic-ok: told to the owner
        : 'кнопка публикации не найдена — окно оставлено открытым' // cyrillic-ok: told to the owner
    } catch (e) {
      out[net] = `ошибка: ${String(e).slice(0, 120)}` // cyrillic-ok: told to the owner
    }
  }
  return out
}

/**
 * The API networks a run may post to: all of them (undefined, as before v6)
 * when nothing is skipped, else those whose article is not there yet.
 * Instagram has no token of its own: it goes with Facebook. Pure.
 */
export function apiNetworksFor(
  skip: ReadonlySet<string>
): Array<'threads' | 'facebook' | 'linkedin' | 'x'> | undefined {
  if (!skip.size) return undefined
  return (
    [
      ['threads', 'Threads'],
      ['facebook', 'Facebook'],
      ['linkedin', 'LinkedIn'],
      ['x', 'X'],
    ] as const
  )
    .filter(([, name]) => !skip.has(name))
    .map(([net]) => net)
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
  const { newDeskPage, deskClick, deskType } = await import(
    '../browser/desk-page'
  )
  const { evaluateOn, closePage } = await import('../browser/cdp')
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
        await deskClick(who, cdp, page.id, found.x, found.y)
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
    await deskType(who, cdp, page.id, text, { enterForNewline: true })
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
  /* A release's card: its title is spelled by its slug (spec v5). */
  const release = releaseTitleOfSlug(slug)
  if (release) return release
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
