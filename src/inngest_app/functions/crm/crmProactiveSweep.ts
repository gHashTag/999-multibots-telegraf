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
 */
import { inngest, createInngestFailureHandler } from '@/inngest_app/client'
import { isSafeMode, skippedInSafeMode } from '@/inngest_app/safeMode'
import { logger } from '@/utils/logger'

export const CRM_SWEEP_CRON = '*/30 * * * *'

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
        try {
          return await runProactiveTick(c.bot, { ...c.opts, ownerId: owner })
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
