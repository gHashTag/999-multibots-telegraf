/**
 * TOOLS THAT LET THE CRM REMEMBER.
 *
 * `crm-tools.ts` reports the audience: how many people, who is warm, who went
 * quiet. It writes nothing -- measured 2026-09-08, zero INSERTs in the whole
 * file -- so the hot-lead list returned the same names every day and the same
 * people got written to twice.
 *
 * These two close that: one records what happened, one shows what already did.
 * Kept in a separate file because everything new here is written in English,
 * while `crm-tools.ts` is an older file with Russian identifiers throughout;
 * mixing them would mean rewriting that file's working code to add a feature.
 *
 * ── NOTHING HERE REACHES ANOTHER PERSON ────────────────────────────────────
 *
 * A touch changes our own memory only. That is why it needs no button
 * confirmation, unlike `tg_send`, which does and keeps it.
 */

import type { AgentTool, ToolContext } from './tools'
import { visibleScope, askSupabase, whoPaid, audienceOf } from './crm-tools'
import { stageOf, waitingOn, type Stage } from './crm-stages'
import {
  recordTouch,
  touchesFor,
  touchesByLead,
  TOUCH_KINDS,
  type TouchKind,
} from './crm-touches'

/** Days since an ISO timestamp, or null when it cannot be read. */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(String(iso))
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

interface LeadRow {
  telegram_id: string | number
  bot_name?: string | null
}

/**
 * The lead's REAL owner-bot, and whether the caller may touch them.
 *
 * The bot is read from `users`, never taken from the arguments: trusting a
 * claimed `bot_name` would make the check decorative -- name your own bot and
 * touch anybody.
 *
 * A refusal is worded as "no such person" rather than "not yours", so a probe
 * cannot learn whose client somebody is by being told off.
 */
async function reachable(
  ctx: ToolContext | undefined,
  leadId: string
): Promise<{ ok: true; botName: string | null } | { ok: false; why: string }> {
  const scope = await visibleScope(ctx)
  const rows = await askSupabase<LeadRow>(
    `users?select=telegram_id,bot_name&telegram_id=eq.${encodeURIComponent(leadId)}&limit=1`
  )
  const found = rows[0]
  if (!found) return { ok: false, why: 'такого человека нет' }
  const botName = found.bot_name || null
  // `scope === null` means a keeper, who sees the whole platform.
  if (scope !== null && (!botName || !scope.includes(botName))) {
    return { ok: false, why: 'такого человека нет' }
  }
  return { ok: true, botName }
}

export const CRM_TOUCH_TOOLS: AgentTool[] = [
  {
    name: 'crm_touch',
    description:
      'Записать, что с человеком уже что-то сделали: written (написали), replied (он ответил), ' +
      'later (просил позже), refused (отказался), bought (купил), note (заметка). ' +
      'НИЧЕГО НЕ ОТПРАВЛЯЕТ — меняет только нашу память, чтобы завтра не предложить того же ' +
      'человека снова. Вызывай СРАЗУ после того, как владелец подтвердил отправку.',
    parameters: {
      type: 'object',
      properties: {
        telegram_id: {
          type: 'string',
          description: 'кого коснулись — id из списка лидов',
        },
        kind: {
          type: 'string',
          description:
            'written | replied | later | refused | bought | note',
        },
        note: {
          type: 'string',
          description: 'своими словами: о чём договорились, что человек ответил',
        },
      },
      required: ['telegram_id', 'kind'],
    },
    async handler(a: Record<string, any>, ctx) {
      const leadId = String(a?.telegram_id ?? '').trim()
      if (!leadId) return { saved: false, why: 'не назван telegram_id' }

      const kind = String(a?.kind ?? '').trim() as TouchKind
      if (!TOUCH_KINDS.includes(kind)) {
        return {
          saved: false,
          why: `«kind» должно быть одним из: ${TOUCH_KINDS.join(', ')}`,
        }
      }

      const may = await reachable(ctx, leadId)
      if (!may.ok) return { saved: false, why: may.why }
      if (!ctx?.pool) return { saved: false, why: 'память недоступна' }

      const outcome = await recordTouch(ctx.pool as never, {
        owner: String(ctx.telegramId),
        lead: leadId,
        botName: may.botName,
        kind,
        note: a?.note ? String(a.note) : undefined,
      })
      return {
        saved: outcome === 'recorded',
        /*
         * Said plainly when it failed. A memory that silently does not save is
         * worse than none: the list keeps looking correct while it forgets, and
         * the person writes to somebody twice believing they did not.
         */
        why: outcome === 'recorded' ? undefined : 'не удалось сохранить',
        kind,
        telegram_id: leadId,
      }
    },
  },

  {
    name: 'crm_history',
    description:
      'Что мы уже делали с этим человеком: касания, свежие сверху. Смотри ПЕРЕД тем, как ' +
      'предлагать написать, — чтобы не повторить тот же повод второй раз. ' +
      'Бесплатно и ничего не отправляет.',
    parameters: {
      type: 'object',
      properties: {
        telegram_id: { type: 'string', description: 'о ком спрашиваем' },
      },
      required: ['telegram_id'],
    },
    async handler(a: Record<string, any>, ctx) {
      const leadId = String(a?.telegram_id ?? '').trim()
      if (!leadId || !ctx?.pool) return { total: 0, touches: [] }
      const may = await reachable(ctx, leadId)
      if (!may.ok) return { total: 0, touches: [] }
      const past = await touchesFor(
        ctx.pool as never,
        String(ctx.telegramId),
        leadId
      )
      return {
        telegram_id: leadId,
        total: past.length,
        touches: past,
        what_to_do:
          past.length === 0
            ? 'С этим человеком мы ещё ничего не делали.'
            : 'Не повторяй прошлый повод — сошлись на том, о чём уже говорили.',
      }
    },
  },

  {
    name: 'crm_waiting',
    description:
      'Кто ждёт ОТВЕТА, а не «кому можно написать». Три вида: ours — человек ответил, а мы молчим ' +
      '(самое дорогое); theirs — мы написали и тишина; due — просил вернуться позже, и позже настало. ' +
      'Стадия и причина считаются из фактов, руками ничего не проставляется. Ничего не отправляет.',
    parameters: {
      type: 'object',
      properties: {
        no_answer_after_days: {
          type: 'number',
          description: 'через сколько дней тишины считать, что ответа нет (по умолчанию 3)',
        },
        later_after_days: {
          type: 'number',
          description: 'через сколько дней возвращать тех, кто просил позже (по умолчанию 14)',
        },
      },
    },
    async handler(a: Record<string, any>, ctx) {
      const scope = await visibleScope(ctx)
      if (!ctx?.pool) return { waiting: [], why: 'память недоступна' }

      const noAnswerAfterDays =
        Number(a?.no_answer_after_days) > 0
          ? Math.floor(Number(a.no_answer_after_days))
          : 3
      const laterAfterDays =
        Number(a?.later_after_days) > 0
          ? Math.floor(Number(a.later_after_days))
          : 14

      const [people, paid, touches] = await Promise.all([
        audienceOf(scope),
        whoPaid(),
        touchesByLead(ctx.pool as never, String(ctx.telegramId)),
      ])

      /*
       * Only people this owner has actually touched can be waiting: waiting is
       * a property of a conversation, and there is no conversation with
       * somebody nobody has written to. Starting from the touch table rather
       * than from the audience also keeps this cheap -- the audience is
       * thousands of rows, the touched are dozens.
       */
      const known = new Map(people.map(p => [String(p.telegram_id), p]))
      const out: Array<Record<string, unknown>> = []
      for (const [leadId, list] of touches) {
        const person = known.get(leadId)
        // Outside the caller's visibility, or gone from `users` entirely.
        if (!person) continue
        const quietDays = daysSince(person.updated_at)
        const w = waitingOn({
          paid: paid.has(leadId),
          touches: list,
          quietDays,
          noAnswerAfterDays,
          laterAfterDays,
        })
        if (!w) continue
        const st = stageOf({ paid: paid.has(leadId), touches: list, quietDays })
        out.push({
          telegram_id: leadId,
          name: person.first_name || null,
          link: person.username ? `https://t.me/${person.username}` : null,
          bot: person.bot_name || null,
          waiting: w.waiting,
          days: w.days,
          stage: st.stage,
          because: w.because,
        })
      }

      /*
       * Ours first, then oldest. The one thing on this screen that costs money
       * every day it is ignored is somebody who answered and got silence.
       */
      const rank: Record<string, number> = { ours: 0, due: 1, theirs: 2 }
      out.sort(
        (x, y) =>
          (rank[String(x.waiting)] ?? 9) - (rank[String(y.waiting)] ?? 9) ||
          Number(y.days) - Number(x.days)
      )

      return {
        total: out.length,
        ours: out.filter(x => x.waiting === 'ours').length,
        due: out.filter(x => x.waiting === 'due').length,
        theirs: out.filter(x => x.waiting === 'theirs').length,
        waiting: out.slice(0, 50),
        what_to_do:
          out.length === 0
            ? 'Никто не ждёт ответа. Это хорошая новость, а не пустой экран.'
            : 'Начни с ours: человек ответил, а мы молчим — это дороже всего. ' +
              'Отправку владелец подтверждает сам, и после неё запиши crm_touch.',
      }
    },
  },

]
