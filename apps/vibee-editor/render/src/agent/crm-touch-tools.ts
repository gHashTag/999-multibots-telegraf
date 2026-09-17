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
import { stageOf, waitingOn, nudgesSince, type Stage } from './crm-stages'
import { leadCandidates } from './chat-memory'
import {
  recordTouch,
  touchesFor,
  touchesByLead,
  TOUCH_KINDS,
  type TouchKind,
} from './crm-touches'

/**
 * How old a silence may be and still count as today's queue.
 *
 * Thirty days is not a rule of the business, it is a rule of attention: a
 * list that reaches back a year is a list nobody opens twice. Everybody
 * older is counted and reported, never dropped in silence.
 */
const WITHIN_DAYS_DEFAULT = 30

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
  first_name?: string | null
  username?: string | null
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
export async function reachable(
  ctx: ToolContext | undefined,
  leadId: string
): Promise<
  | {
      ok: true
      botName: string | null
      name: string | null
      username: string | null
    }
  | { ok: false; why: string }
> {
  const scope = await visibleScope(ctx)
  const rows = await askSupabase<LeadRow>(
    `users?select=telegram_id,bot_name,first_name,username&telegram_id=eq.${encodeURIComponent(leadId)}&limit=1`
  )
  const found = rows[0]
  if (!found) return { ok: false, why: 'такого человека нет' }
  const botName = found.bot_name || null
  // `scope === null` means a keeper, who sees the whole platform.
  if (scope !== null && (!botName || !scope.includes(botName))) {
    return { ok: false, why: 'такого человека нет' }
  }
  return {
    ok: true,
    botName,
    // What the owner recognises on the card. Third-party text; the caller
    // cuts it to one line before it goes anywhere.
    name: found.first_name || null,
    username: found.username || null,
  }
}

/*
 * A SENTENCE THAT PROMISES A NUMBER, AND THE NUMBER ITSELF.
 *
 * These two defaults were written twice: once as a fallback in the handler,
 * once as a digit inside the parameter description the MODEL reads. Nothing
 * held them together -- change the fallback and the sentence keeps telling the
 * model the old value, quietly, in the one place the model trusts about how
 * the tool behaves.
 *
 * Now the sentence is built from the constant, so drifting apart is not a
 * thing that can happen rather than a thing a test catches after it has.
 */
const NO_ANSWER_AFTER_DAYS = 3
const LATER_AFTER_DAYS = 14

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
          description: 'written | replied | later | refused | bought | note',
        },
        note: {
          type: 'string',
          description:
            'своими словами: о чём договорились, что человек ответил',
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
      // Money first (spec crm-client-ownership.t27): a COMPLETED MONEY_INCOME
      // row for one of the owner's bots makes this person a client whatever
      // the last touch says. A dead Supabase costs the money column, not the
      // answer -- paid_known says which it was.
      let paid = false
      let paidKnown = true
      try {
        paid = (await visibleScope(ctx).then(whoPaid)).has(leadId)
      } catch {
        paidKnown = false
      }
      const st = stageOf({
        paid,
        touches: past as never,
        quietDays: null,
      })
      const w = waitingOn({
        paid,
        touches: past as never,
        quietDays: null,
        noAnswerAfterDays: 3,
        laterAfterDays: 14,
      })
      return {
        telegram_id: leadId,
        total: past.length,
        stage: st.stage,
        because: st.because,
        paid,
        paid_known: paidKnown,
        waiting: w?.waiting ?? null,
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
      /*
       * THE NEW FACTS ARE IN THE ANSWER, NOT IN THIS SENTENCE, AND THAT IS
       * DELIBERATE.
       *
       * Every row now carries `nudges`, and after two unanswered reminders
       * the person leaves this list -- enforced in waitingOn (maxNudges,
       * default 2), pinned by crm-nudge-cap.test.ts, explained to the model
       * in the playbook, which this kit does not count.
       *
       * Not written here because provider.test.ts holds the compact kit under
       * 6000 tokens for a 16k model, and MEASURED TODAY the kit stands at
       * 5998 of them. Two tokens of headroom: the next sentence anybody adds
       * to any tool description, including this one, does not fit. A budget
       * that tight is a finding, not a formality -- and the answer to it is
       * not a bigger number in the test.
       */
      'Стадия и причина считаются из фактов, руками ничего не проставляется. Ничего не отправляет.',
    parameters: {
      type: 'object',
      properties: {
        no_answer_after_days: {
          type: 'number',
          // promise-checked: the number in the sentence IS the fallback below
          description: `через сколько дней тишины считать, что ответа нет (по умолчанию ${NO_ANSWER_AFTER_DAYS})`,
        },
        later_after_days: {
          type: 'number',
          // promise-checked: the number in the sentence IS the fallback below
          description: `через сколько дней возвращать тех, кто просил позже (по умолчанию ${LATER_AFTER_DAYS})`,
        },
      },
    },
    async handler(a: Record<string, any>, ctx) {
      const scope = await visibleScope(ctx)
      if (!ctx?.pool) return { waiting: [], why: 'память недоступна' }

      const noAnswerAfterDays =
        Number(a?.no_answer_after_days) > 0
          ? Math.floor(Number(a.no_answer_after_days))
          : NO_ANSWER_AFTER_DAYS
      const laterAfterDays =
        Number(a?.later_after_days) > 0
          ? Math.floor(Number(a.later_after_days))
          : LATER_AFTER_DAYS

      const withinDays =
        Number(a?.within_days) > 0
          ? Math.floor(Number(a.within_days))
          : WITHIN_DAYS_DEFAULT

      const [people, paid, touches] = await Promise.all([
        audienceOf(scope),
        whoPaid(scope),
        touchesByLead(ctx.pool as never, String(ctx.telegramId)),
      ])

      /*
       * THE MESSAGES, NOT ONLY THE TOUCHES.
       *
       * MEASURED IN PRODUCTION 2026-09-16. This tool answered "2 people are
       * waiting" while `crm_summary`, for the same owner at the same moment,
       * said 316. Both numbers were computed honestly -- from different
       * facts. `crm_touches` had five rows in total; `crm_messages` had
       * 25 302 inbound. The tool whose entire job is "who is waiting for an
       * answer" was reading the empty one.
       *
       * Two answers to one question is worse than a wrong answer: the model
       * gets both and cannot tell which to believe.
       *
       * A union, not a replacement. Touches stay authoritative where they
       * exist -- they are explicit facts somebody recorded on purpose -- and
       * an owner with no connected Telegram account still gets exactly what
       * this tool gave before, because there are no messages to add.
       */
      let fromMessages = new Map<
        string,
        { lastIn: string | null; unanswered: boolean }
      >()
      try {
        const cands = await leadCandidates(
          ctx.pool as never,
          String(ctx.telegramId),
          { limit: 10_000, paid }
        )
        fromMessages = new Map(
          cands.map(c => [
            String(c.lead),
            {
              lastIn: c.lastInboundAt ? c.lastInboundAt.toISOString() : null,
              /*
               * `unanswered` is taken as the boolean it is, not rebuilt from
               * `daysSinceOut`. That field is a whole number of days, so a
               * reply sent an hour after their message rounds to the same
               * day and the reconstruction can put the two in the wrong
               * order -- reporting a conversation that was answered as one
               * that was ignored, which is the very mistake being fixed.
               */
              unanswered: c.unanswered,
            },
          ])
        )
      } catch {
        // No messages for this owner, or the table is not there yet. The
        // touch-only answer below is then the whole answer, as it was before.
      }

      /*
       * Everybody with a touch OR a message, not only the touched. The older
       * comment here said "there is no conversation with somebody nobody has
       * written to" -- true, and it quietly assumed that a conversation
       * leaves a touch behind. It does not: the model is asked to record one
       * and forgets, which is how this tool came to see 2 people out of 316.
       */
      const known = new Map(people.map(p => [String(p.telegram_id), p]))
      const everyone = new Set<string>([
        ...touches.keys(),
        ...fromMessages.keys(),
      ])
      const out: Array<Record<string, unknown>> = []
      let olderThanWindow = 0
      for (const leadId of everyone) {
        const person = known.get(leadId)
        // Outside the caller's visibility, or gone from `users` entirely.
        if (!person) continue
        const list = touches.get(leadId) ?? []
        const msg = fromMessages.get(leadId)
        const quietDays = daysSince(person.updated_at)
        const w = waitingOn({
          paid: paid.has(leadId),
          touches: list,
          quietDays,
          noAnswerAfterDays,
          laterAfterDays,
          lastInboundAt: msg?.lastIn ?? null,
          /*
           * "Answered" is expressed as an outbound at the same moment as
           * their message, which is exactly what `unanswered: false` means
           * and all this function needs to know: whose turn it is.
           */
          lastOutboundAt: msg && !msg.unanswered ? msg.lastIn : null,
        })
        if (!w) continue
        // NOT SILENTLY DROPPED. Somebody who wrote in March and never got an
        // answer is a real debt, but they are not today's queue; the count
        // goes back in the answer so the number can be asked about.
        if (w.days > withinDays) {
          olderThanWindow += 1
          continue
        }
        const st = stageOf({
          paid: paid.has(leadId),
          touches: list,
          quietDays,
          lastInboundAt: msg?.lastIn ?? null,
          lastOutboundAt: msg && !msg.unanswered ? msg.lastIn : null,
        })
        out.push({
          telegram_id: leadId,
          name: person.first_name || null,
          link: person.username ? `https://t.me/${person.username}` : null,
          bot: person.bot_name || null,
          waiting: w.waiting,
          days: w.days,
          stage: st.stage,
          because: w.because,
          nudges: nudgesSince({ touches: list, lastInboundAt: msg?.lastIn }),
          from: list.length > 0 ? 'touches' : 'messages',
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
        older_than_window: olderThanWindow,
        window_days: withinDays,
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
