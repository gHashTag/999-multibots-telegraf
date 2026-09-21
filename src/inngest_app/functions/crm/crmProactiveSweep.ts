/**
 * THE SELLER'S CLOCK, MOVED TO INNGEST.
 *
 * Until 2026-09-12 the proactive CRM sweep ran on a setInterval inside the
 * bot process: invisible from outside, no run history, no trace, no way to
 * cancel or rerun one tick. This cron function is the same tick
 * (`runProactiveTick` in services/crmProactive.ts) driven by the Inngest
 * server, so every sweep is a run: visible in the dashboard, inspectable via
 * the Inngest MCP (`list_function_runs`, `get_run_trace`), rerunnable.
 *
 * Rules:
 *   - concurrency 1: two ticks never overlap (sweepOnce also keeps its own
 *     `running` latch, so a timer left on by CRM_SWEEP_DRIVER=timer cannot
 *     collide either).
 *   - retries 0: a tick may push a card to the owner; a retry after a partial
 *     failure would push a second one. The next tick is thirty minutes away.
 *   - safe mode (e2e_test=true probes): skipped, nothing is sent.
 *   - no carrier: the bots are not up yet in this process -- reported as
 *     'paused', not thrown. The next run finds them.
 *   - every seller (2026-09-13): one run sweeps the owner and then each
 *     other connected account (`resolveSellers`), in turn. The run's
 *     output lists who was swept and what happened for each.
 *   - one step per seller (2026-09-17): until then the whole tick was ONE
 *     `step.run('sweep')`, i.e. one HTTP request from the Inngest server to
 *     the bot for every seller in turn, each of which may wait up to
 *     INGEST_TIMEOUT_MS (170 s) on the render. Three runs on 2026-09-16
 *     failed with "HTTP 502 before the SDK responded" after 15 s, 2m02s and
 *     exactly 5m00s: the Railway edge gave up on the request (or the app
 *     was restarting under it) and, with retries 0, that was the run. Now
 *     `resolve-sellers` is its own step and every seller is a `sweep-<id>`
 *     step: each request carries one seller, a finished seller is memoized
 *     and never swept twice inside a run, and the trace names the seller a
 *     502 landed on. Retries stay 0 for the reason above.
 *   - a step budget (2026-09-21): see SWEEP_STEP_BUDGET_MS.
 */
import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { logger } from '@/utils/logger'

export const CRM_SWEEP_CRON = '*/30 * * * *'

/**
 * ONE SELLER STILL OUTLASTS THE WIRE.
 *
 * Splitting the tick into one step per seller (2026-09-17) shortened the
 * request but did not bound it. An honest single sweep may legitimately run
 * for minutes -- crmProactive's own arithmetic puts the worst case at 880 s
 * (ingest 170 + crm_leads 170 + three model turns of 180) -- while the edge in
 * front of this app gives up long before that. Production, 2026-09-21, run
 * 01M31ASM93K61CECEAWEYWH9GW: the request went out at 06:30:00, the run failed
 * at 06:35:00 sharp with "HTTP 502 before the SDK responded", and the sweep it
 * was carrying logged its result at 06:36:14 -- alive the whole time, just
 * nobody left on the socket. With retries 0 that killed the run and paged the
 * owner about a sweep that then finished fine.
 *
 * So the step stops waiting first, at a budget comfortably under the five
 * minutes the edge allows.
 *
 * NOTHING IS LOST BY NOT WAITING. The sweep's effects -- the card, the
 * messages, the journal rows -- happen inside the bot process, not in this
 * return value; the step only reports. Letting go of the promise gives up a
 * line in the trace, not the work. The sweep keeps its own per-seller
 * `running` latch, so the next tick will not double it.
 */
export const SWEEP_STEP_BUDGET_MS = 240_000

export type SlowSweep = { did: 'slow'; why: string; ms: number }

export async function withStepBudget<T>(
  work: Promise<T>,
  ms: number,
  onSlow: () => SlowSweep
): Promise<T | SlowSweep> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<SlowSweep>(resolve => {
    timer = setTimeout(() => resolve(onSlow()), ms)
  })
  /*
   * The loser keeps running on purpose (see above), so it needs a handler of
   * its own: an unattended rejection after we walked away would take the
   * process down, and the process is the thing still doing the work.
   */
  work.catch(() => undefined)
  try {
    return await Promise.race([work, budget])
  } finally {
    clearTimeout(timer)
  }
}

export const crmProactiveSweep = inngest.createFunction(
  {
    id: 'crm-proactive-sweep',
    name: 'CRM: proactive seller sweep',
    retries: 0,
    concurrency: { limit: 1 },
    onFailure: createInngestFailureHandler('crm-proactive-sweep'),
  },
  { cron: CRM_SWEEP_CRON },
  async ({ event, step }) => {
    if (isSafeMode(event as never)) return skippedInSafeMode('crm-sweep')

    const started = Date.now()
    const plan = await step.run('resolve-sellers', async () => {
      const { crmCarrier, resolveSellers } = await import(
        '@/services/crmProactive'
      )
      const c = crmCarrier()
      if (!c) {
        logger.warn('[crm-proactive] inngest tick: no carrier registered yet')
        return {
          did: 'paused' as const,
          why: 'carrier not registered',
          owner: null as string | null,
          sellers: [] as string[],
        }
      }
      const sellers = await resolveSellers(c.opts)
      return {
        did: 'planned' as const,
        why: '',
        owner: String(c.opts.ownerId),
        sellers,
      }
    })
    if (plan.did === 'paused') {
      return { did: plan.did, why: plan.why, ms: Date.now() - started }
    }

    // Sequential on purpose (see runProactiveTickAll): one MTProto session
    // on the render at a time. A seller whose sweep throws gets a failed
    // row; the next seller still runs.
    const outcomes: Array<{ owner: string; outcome: unknown }> = []
    for (const owner of plan.sellers) {
      const outcome = await step.run(`sweep-${owner}`, async () => {
        const { crmCarrier, runProactiveTick } = await import(
          '@/services/crmProactive'
        )
        const c = crmCarrier()
        if (!c) return { did: 'paused' as const, why: 'carrier gone mid-run' }
        const at = Date.now()
        try {
          return await withStepBudget(
            runProactiveTick(c.bot, { ...c.opts, ownerId: owner }),
            SWEEP_STEP_BUDGET_MS,
            () => {
              const ms = Date.now() - at
              logger.warn('[crm-proactive] sweep outlasted the step budget', {
                owner,
                ms,
                budgetMs: SWEEP_STEP_BUDGET_MS,
              })
              return {
                did: 'slow' as const,
                why: 'обход идёт дольше бюджета шага, продолжается в процессе бота', // cyrillic-ok
                ms,
              }
            }
          )
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e)
          logger.error('[crm-proactive] tick failed for seller', { owner, why })
          return { did: 'failed' as const, why }
        }
      })
      outcomes.push({ owner, outcome })
    }

    return {
      sellers: plan.sellers,
      outcomes,
      ms: Date.now() - started,
      owner: plan.owner,
    }
  }
)
