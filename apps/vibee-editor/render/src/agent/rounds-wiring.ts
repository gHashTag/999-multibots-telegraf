/**
 * The round (rounds.ts) wired to the person's own browser and their chat.
 * Kept apart so the walking is testable without a pod.
 *
 * Switched on by ROUNDS_ENABLED=1; ROUNDS_OWNER names whose accounts are
 * walked (the platform owner by default). The browser is started if it is
 * off -- a round that skipped every time the pod was asleep would never run.
 */
import type { Queryable } from '../browser/sessions'

const settle = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function runRoundNow(
  pool: Queryable,
  /* Asked for by a person: their own accounts, whatever the cron's owner is. */
  asked?: string,
  /* Which desk is being walked (agent/profiles.ts); all of them by default. */
  profileId?: string
): Promise<string> {
  if (!asked && process.env.ROUNDS_ENABLED !== '1') return 'off'
  const { OWNER_TELEGRAM_ID } = await import('./telegram-tools')
  const owner =
    asked || String(process.env.ROUNDS_OWNER || OWNER_TELEGRAM_ID || '')
  if (!owner) return 'no owner'
  const { runRound, SETTLE_MS, ROUND_SITES } = await import('./rounds')
  const { readStrategy, roundStrategyOf } = await import('./strategies')
  /*
   * THE STRATEGY IS READ AT THE START OF EVERY ROUND, so changing where the
   * agent looks costs a row in the database -- not a deploy (owner,
   * 2026-09-23: "setting things up will take forever this way").
   */
  const { profileOf, strategyKeyOf, allSites } = await import('./profiles')
  const desk = profileOf(profileId)
  const key = strategyKeyOf(desk?.id ?? 'all')
  const strategy = roundStrategyOf(await readStrategy(pool, key), {
    /* A desk walks its own accounts; the whole round walks every desk's. */
    sites: desk ? desk.sites : allSites().length ? allSites() : ROUND_SITES,
    everyMin: Number(process.env.ROUNDS_EVERY_MIN) || 180,
    settleMs: SETTLE_MS,
  })
  const { readSession, personHasTheWheel } = await import('../browser/sessions')
  const { startBrowserAsAgent, restartBrowserAsAgent } = await import(
    '../browser/routes'
  )
  const { newPage, evaluateOn, closePage } = await import('../browser/cdp')
  const { sendToTelegram } = await import('../auth/telegram-sender')

  return await runRound({
    personHasTheWheel: async () =>
      personHasTheWheel(await readSession(pool, owner), Date.now()),
    look: async url => {
      let s = await readSession(pool, owner)
      if (!s || s.state !== 'live' || !s.cdpEndpoint) {
        await startBrowserAsAgent(owner)
        s = await readSession(pool, owner)
      }
      if (!s?.cdpEndpoint) throw new Error('the browser did not start')
      const page = await newPage(s.cdpEndpoint, url)
      try {
        await settle(strategy.settleMs)
        const got = (await evaluateOn(
          s.cdpEndpoint,
          page.id,
          `(() => {
             const main = document.querySelector('main, article') || document.body
             return { title: document.title, text: (main.innerText || '').slice(0, 400) }
           })()`
        )) as { title?: unknown; text?: unknown }
        return {
          title: typeof got?.title === 'string' ? got.title : '',
          text: typeof got?.text === 'string' ? got.text : '',
        }
      } finally {
        /* A round leaves no tabs behind: the person's browser is theirs. */
        await closePage(s.cdpEndpoint, page.id).catch(() => {})
      }
    },
    tell: text => sendToTelegram(owner, desk ? `[${desk.name}] ${text}` : text),
    restart: () => restartBrowserAsAgent(owner),
    now: () => new Date(),
    sites: strategy.sites,
  })
}
