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

export async function runRoundNow(pool: Queryable): Promise<string> {
  if (process.env.ROUNDS_ENABLED !== '1') return 'off'
  const { OWNER_TELEGRAM_ID } = await import('./telegram-tools')
  const owner = String(process.env.ROUNDS_OWNER || OWNER_TELEGRAM_ID || '')
  if (!owner) return 'no owner'
  const { runRound, SETTLE_MS } = await import('./rounds')
  const { readSession, personHasTheWheel } = await import('../browser/sessions')
  const { startBrowserAsAgent } = await import('../browser/routes')
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
        await settle(SETTLE_MS)
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
    tell: text => sendToTelegram(owner, text),
    now: () => new Date(),
  })
}
