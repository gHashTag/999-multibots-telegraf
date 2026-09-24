/**
 * The blog-share cron (blog-share.ts) wired to the real feed, the owner's
 * approvals and their browser. Kept apart so the logic stays testable.
 */
import type { Queryable } from '../browser/sessions'
import {
  blogShareTick,
  RSS_URL,
  shareUrls,
  type Article,
  type Answer,
} from './blog-share'

const settle = (ms: number) => new Promise(r => setTimeout(r, ms))

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
    ask: what => requestPermission(pool, owner, what),
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
async function publishEverywhere(
  pool: Queryable,
  owner: string,
  a: Article
): Promise<Record<string, string>> {
  const { startBrowserAsAgent } = await import('../browser/routes')
  const { readSession } = await import('../browser/sessions')
  const { newPage, evaluateOn, clickAt } = await import('../browser/cdp')
  const { findProbe, foundOf } = await import('../browser/find-target')
  let s = await readSession(pool, owner)
  if (!s || s.state !== 'live' || !s.cdpEndpoint) {
    await startBrowserAsAgent(owner)
    s = await readSession(pool, owner)
  }
  if (!s?.cdpEndpoint) return { error: 'the browser did not start' }
  const cdp = s.cdpEndpoint
  const urls = shareUrls(a)
  const out: Record<string, string> = {}
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

  for (const [net, url, labels] of [
    ['X', urls.x, ['post']],
    ['LinkedIn', urls.linkedin, ['post', 'опубликовать']], // cyrillic-ok: LinkedIn's Russian label
    /* Reddit's submit page says "Post"; in Russian, "Опубликовать". */
    ['Reddit', urls.reddit, ['post', 'опубликовать']], // cyrillic-ok: Reddit's Russian label
  ] as const) {
    if (net === 'X' && !String(out.X || '').startsWith('тред не получился'))
      continue
    try {
      const page = await newPage(cdp, url)
      await settle(6_000)
      let pressed: string | null = null
      for (const label of labels) {
        const found = foundOf(
          await evaluateOn(cdp, page.id, findProbe(label)).catch(() => null)
        )
        if (found) {
          await clickAt(cdp, page.id, found.x, found.y)
          pressed = found.label
          break
        }
      }
      if (net === 'X') void noteShape(pool, a.slug, 'single')
      out[net] = pressed
        ? `нажато «${pressed}»` // cyrillic-ok: told to the owner
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
  const { newPage, evaluateOn, clickAt, typeText } = await import(
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
  const pressed = await press([
    'post all',
    'опубликовать все',
    'опубликовать всё',
  ])
  return `тред опубликован («${pressed}»): текст, ссылка вторым постом` // cyrillic-ok: told to the owner
}
