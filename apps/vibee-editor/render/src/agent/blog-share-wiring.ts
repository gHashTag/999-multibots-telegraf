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
  for (const [net, url, labels] of [
    ['X', urls.x, ['post']],
    ['LinkedIn', urls.linkedin, ['post', 'опубликовать']], // cyrillic-ok: LinkedIn's Russian label
    /* Reddit's submit page says "Post"; in Russian, "Опубликовать". */
    ['Reddit', urls.reddit, ['post', 'опубликовать']], // cyrillic-ok: Reddit's Russian label
  ] as const) {
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
      out[net] = pressed
        ? `нажато «${pressed}»` // cyrillic-ok: told to the owner
        : 'кнопка публикации не найдена — окно оставлено открытым' // cyrillic-ok: told to the owner
    } catch (e) {
      out[net] = `ошибка: ${String(e).slice(0, 120)}` // cyrillic-ok: told to the owner
    }
  }
  return out
}
