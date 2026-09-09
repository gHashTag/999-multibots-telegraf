/**
 * /inngest_probe — admin-only safe probe of every served Inngest function.
 *
 * Spec: gHashTag/t27 `specs/automation/inngest-probe-suite.t27`.
 *
 *   /inngest_probe          show the plan (what runs, what is expected) + a
 *                           confirm button; nothing is invoked yet
 *   /inngest_probe status   the read-only 24 h run summary (same source as
 *                           GET /api/inngest/functions/status)
 *   [button]                invoke the suite; the message is edited with
 *                           progress and then replaced by the verdict table
 *
 * Why a button: the command is cheap to type by accident; the suite starts
 * 20+ runs on the production Inngest server. All of them are safe-mode
 * (`e2e_test: true`) and stop at the guard, but a run is still a run in the
 * history, so the admin confirms once.
 *
 * Why in-process and not an Inngest function: the suite invokes functions
 * through the server's GraphQL API, which is private to the Railway network.
 * The bot is inside that network; an outside caller is not. Only one suite
 * runs at a time.
 */
import type { Telegraf } from 'telegraf'
import { Markup } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { requireAdmin, isAdmin } from '@/middleware/adminOnly'
import { logger } from '@/utils/logger'
import {
  planProbes,
  renderProbePlanText,
  renderProbeReportText,
  runProbeSuite,
  type ProbeSuiteReport,
} from '@/inngest_app/probe/probeSuite'
import { InngestProbeClient } from '@/inngest_app/probe/inngestProbeClient'
import {
  fetchFunctionsStatusSafe,
  renderRunsSummaryText,
} from '@/inngest_app/status/functionsStatus'

export const PROBE_GO_ACTION = 'inngest_probe:go'
export const PROBE_CANCEL_ACTION = 'inngest_probe:cancel'
/** Telegram edits are rate-limited; do not edit the progress line more often. */
export const PROGRESS_EDIT_MIN_MS = 3_000

let running: { by: number; since: Date } | null = null

export function probeSuiteIsRunning(): boolean {
  return running !== null
}

/** Test seam: forget a running suite. */
export function resetProbeSuiteLockForTests(): void {
  running = null
}

function textOf(ctx: MyContext): string {
  return ctx.message && 'text' in ctx.message ? ctx.message.text : ''
}

/** Split for Telegram's 4096-char limit, on line boundaries. */
export function chunkText(text: string, limit = 4000): string[] {
  const out: string[] = []
  let cur = ''
  for (const line of text.split('\n')) {
    if (cur.length + line.length + 1 > limit && cur) {
      out.push(cur)
      cur = ''
    }
    cur = cur ? `${cur}\n${line}` : line
  }
  if (cur) out.push(cur)
  return out
}

async function replyChunks(ctx: MyContext, text: string): Promise<void> {
  for (const part of chunkText(text)) await ctx.reply(part)
}

export interface ProbeRunner {
  (
    onProgress: (done: number, total: number) => Promise<void>
  ): Promise<ProbeSuiteReport>
}

const defaultRunner: ProbeRunner = onProgress =>
  runProbeSuite({ client: new InngestProbeClient(), onProgress })

export function setupInngestProbeCommand(
  bot: Telegraf<MyContext>,
  runner: ProbeRunner = defaultRunner
): void {
  bot.command('inngest_probe', requireAdmin(), async ctx => {
    const arg = textOf(ctx).split(/\s+/)[1] ?? ''
    if (arg === 'status') {
      const status = await fetchFunctionsStatusSafe({ now: new Date() })
      if (status.ok === false) {
        await ctx.reply(
          `Inngest недоступен: ${status.error.error}\n${status.error.gqlUrl}`
        )
        return
      }
      await replyChunks(ctx, renderRunsSummaryText(status.payload))
      return
    }
    if (running) {
      await ctx.reply(
        `Прогон уже идёт (запустил ${running.by}, ${running.since.toISOString()}). Дождитесь отчёта.`
      )
      return
    }
    const plan = planProbes()
    await replyChunks(ctx, renderProbePlanText(plan))
    await ctx.reply(
      'Запустить?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('▶️ Запустить (safe mode)', PROBE_GO_ACTION),
          Markup.button.callback('Отмена', PROBE_CANCEL_ACTION),
        ],
      ])
    )
  })

  bot.action(PROBE_CANCEL_ACTION, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    await ctx.editMessageText('Отменено.').catch(() => undefined)
  })

  bot.action(PROBE_GO_ACTION, async ctx => {
    await ctx.answerCbQuery().catch(() => undefined)
    const userId = ctx.from?.id
    if (!userId || !isAdmin(userId)) {
      await ctx.reply('❌ Только для администраторов.')
      return
    }
    if (running) {
      await ctx
        .editMessageText(`Прогон уже идёт (запустил ${running.by}).`)
        .catch(() => undefined)
      return
    }
    running = { by: userId, since: new Date() }
    logger.info('[inngest-probe] suite started', { by: userId })
    let lastEdit = 0
    const onProgress = async (done: number, total: number) => {
      const t = Date.now()
      if (t - lastEdit < PROGRESS_EDIT_MIN_MS) return
      lastEdit = t
      await ctx
        .editMessageText(`Прогон идёт… ${done}/${total}`)
        .catch(() => undefined)
    }
    try {
      await ctx.editMessageText('Прогон идёт… 0/0').catch(() => undefined)
      const report = await runner(onProgress)
      logger.info('[inngest-probe] suite finished', {
        by: userId,
        ok: report.ok,
        counts: report.counts,
      })
      const text = renderProbeReportText(report)
      const [first, ...rest] = chunkText(text)
      await ctx.editMessageText(first).catch(() => ctx.reply(first))
      for (const part of rest) await ctx.reply(part)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('[inngest-probe] suite crashed', { by: userId, error: msg })
      await ctx
        .editMessageText(`Прогон не завершился: ${msg}`)
        .catch(() => ctx.reply(`Прогон не завершился: ${msg}`))
    } finally {
      running = null
    }
  })
}
