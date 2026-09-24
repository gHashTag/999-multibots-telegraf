/**
 * A scenario (scenarios.ts) run in the person's own browser.
 *
 * Kept apart from the steps themselves so the rules -- no secret in a
 * scenario, a failed step stops the run -- are tested without a pod, and so
 * this file holds only the wiring: where to press, how to ask, what to read.
 */
import type { Queryable } from '../browser/sessions'
import type { RunResult, Scenario } from './scenarios'

const settle = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

/** How long a step waits for the person before the run gives up. */
export const ASK_WAIT_MS = 120_000

export async function runScenarioNow(
  pool: Queryable,
  who: string,
  scenario: Scenario
): Promise<RunResult> {
  const { runScenario } = await import('./scenarios')
  const { readSession } = await import('../browser/sessions')
  const { startBrowserAsAgent } = await import('../browser/routes')
  const { newPage, evaluateOn, clickAt, typeText, frontPage } = await import(
    '../browser/cdp'
  )
  const { findProbe, foundOf } = await import('../browser/find-target')
  const { askForInput, waitForAnswer } = await import(
    '../browser/input-request'
  )

  const live = async () => {
    let s = await readSession(pool, who)
    if (!s || s.state !== 'live' || !s.cdpEndpoint) {
      await startBrowserAsAgent(who)
      s = await readSession(pool, who)
    }
    if (!s?.cdpEndpoint) throw new Error('the browser did not start')
    return s.cdpEndpoint
  }
  /* The tab the run works in: whatever is in front when it starts. */
  let target: string | null = null
  const where = async () => {
    const cdp = await live()
    if (!target) target = (await frontPage(cdp)).id
    return { cdp, id: target }
  }

  return await runScenario(scenario, {
    open: async url => {
      const cdp = await live()
      target = (await newPage(cdp, url)).id
    },
    press: async words => {
      const { cdp, id } = await where()
      const found = foundOf(
        await evaluateOn(cdp, id, findProbe(words)).catch(() => null)
      )
      if (!found) throw new Error(`nothing says "${words}"`)
      await clickAt(cdp, id, found.x, found.y)
      return found.label
    },
    type: async text => {
      const { cdp, id } = await where()
      await typeText(cdp, id, text)
    },
    ask: async (kind, why) => {
      /* The person types it into their own browser; nothing comes back here
         but the fact that they did (browser/input-request.ts). */
      const asked = askForInput(who, {
        id: `scenario-${Date.now()}`,
        kind: kind as 'password',
        why,
        host: '',
        label: scenario.name,
      })
      const answer = await waitForAnswer(who, asked.id, ASK_WAIT_MS)
      return Boolean(answer?.typed || answer?.chosen)
    },
    read: async () => {
      const { cdp, id } = await where()
      const got = await evaluateOn(
        cdp,
        id,
        `(() => (document.body && document.body.innerText || '').slice(0, 4000))()`
      ).catch(() => '')
      return typeof got === 'string' ? got : ''
    },
    wait: settle,
  })
}
