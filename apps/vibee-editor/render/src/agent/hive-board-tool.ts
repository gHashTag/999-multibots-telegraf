/**
 * ONE BOARD, TWO LANES: THE WORK, AND THE PEOPLE.
 *
 * Owner, 2026-09-20: one board with two halves -- the shared one, which
 * everybody who is signed in sees, and "only my own", which nobody else does.
 *
 * WHY THE TWO LANES ARE NOT THE SAME KIND OF THING
 *
 * The tasks lane is the Queen's public board at t27.ai: issues of a code
 * repository. It names no person, carries no money and no telegram id, and her
 * API publishes it unauthenticated. It is the same board for everyone here.
 *
 * The clients lane is the CRM: 2380 people belonging to sixteen bot owners,
 * living in ONE shared `users` table where the separation exists only at read
 * time (`hive/roles.ts`). It is different for every caller, and for most
 * callers it is empty.
 *
 * Putting them in one answer is the whole point -- a person asks "what is
 * going on" once -- but they are built by two different rules, and the rule
 * for the second one is the one that can leak. So it is asked of the single
 * authority (`visibilityOf` / `botFilter` / `canSeeBot`) rather than written
 * again here: a second ownership source drifts from the first, and the drift
 * shows up as "I can see somebody else's".
 *
 * WHAT THE `client` ARGUMENT MAY DO
 *
 * Narrow, and only narrow. It is checked against the caller's visibility
 * BEFORE anything is read, so asking for a bot that is not yours is a refusal
 * and never a read that happens to return rows. A filter that can widen is not
 * a filter, it is an address bar into other people's data.
 *
 * WHY THE REFUSAL COMES BEFORE THE READ
 *
 * Same reason as `crm-owner-gate.test.ts`: if the gate sat after the query, a
 * database that is slow, broken or half-open decides what a stranger sees. A
 * refusal that only happens when the database is healthy is not a refusal.
 */

import {
  visibilityOf,
  botFilter,
  canSeeBot,
  type Visibility,
} from '../hive/roles'
import { botsOwnedBy } from './hive-tools'
import { audienceOf, whoPaid, daysAgo, type Person } from './crm-tools'
import { touchesByLead } from './crm-touches'
import { stageOf, waitingOn, type Stage } from './crm-stages'
import { queenBoard } from '../hive/queen-client'
import type { AgentTool, ToolContext } from './tools'

/**
 * The columns of the clients lane, under the names `crm-stages.ts` derives.
 *
 * The vocabulary is not invented here and must not be: a stage is computed
 * from facts every time it is asked for, and a column this file made up would
 * be a column nothing can ever put anybody into.
 *
 * The order is "what blocks first", not alphabetical and not the funnel's:
 * somebody whose answer is unanswered costs a deal today, a refusal costs
 * nothing and is shown last so that nobody writes to them out of habit.
 */
const STAGE_COLUMNS: Array<{ key: Stage; title: string }> = [
  { key: 'talking', title: 'в разговоре — ход за вами' },
  { key: 'written', title: 'написали, ответа нет' },
  { key: 'later', title: 'просили позже' },
  { key: 'new', title: 'новые, ни разу не касались' },
  { key: 'winback', title: 'платили и замолчали' },
  { key: 'client', title: 'клиенты — платят' },
  { key: 'refused', title: 'сказали нет' },
]

/**
 * The delays the rest of the CRM already uses for "whose turn is it"
 * (`crm-summary-tool.ts`). Taken from there rather than picked again: two
 * boards that disagree about when a silence starts mattering are two boards.
 */
const NO_ANSWER_AFTER_DAYS = 3
const LATER_AFTER_DAYS = 14

/** How many cards of a clients column travel in the answer. */
const CARDS_PER_COLUMN = 8

/** A card of the clients lane: one person, and why they are in that column. */
interface ClientCard {
  id: string
  name: string | null
  bot: string | null
  stage: Stage
  paid: boolean
  waiting_for_reply: boolean
  quiet_days: number | null
  last_touch_at: string | null
}

/**
 * A human name for the scope.
 *
 * An owner of one bot must never read their own hundred people as "the
 * platform": the number is the same shape either way, and the conclusion
 * drawn from it is not.
 */
function scopeLabel(v: Visibility, applied: string | null): string {
  if (v.role === 'keeper') {
    return applied
      ? `только бот ${applied} (вы смотритель улья и сузили обзор сами)`
      : 'вся ферма (вы смотритель улья)'
  }
  if (v.role === 'owner') {
    const bots = v.bots ?? []
    return applied
      ? `ваш бот ${applied} (из ваших: ${bots.join(', ')})`
      : `ваши боты: ${bots.join(', ')}`
  }
  return 'только вы: за вами не числится ботов, поэтому дорожка клиентов пуста'
}

/**
 * The bots this answer may be narrowed by, with the count each contributes
 * HERE.
 *
 * For an owner the list is their own bots, including one with nobody on it:
 * a zero about your own bot is a fact about your bot. For a keeper it is the
 * bots that actually appear in the read, because the farm has no other
 * enumeration to offer. For a bee it is empty -- naming somebody else's bot
 * is already telling them about somebody else.
 *
 * When a filter is applied the list holds exactly the applied bot: every
 * other count would be a zero meaning "not in this slice", and a zero that
 * means "not read" is the one lie this codebase keeps refusing to tell.
 */
function availableFilters(
  v: Visibility,
  cards: ClientCard[],
  applied: string | null
): Array<{ key: string; label: string; count: number }> {
  const perBot = new Map<string, number>()
  for (const c of cards) {
    if (!c.bot) continue
    perBot.set(c.bot, (perBot.get(c.bot) ?? 0) + 1)
  }
  if (applied) {
    return [
      { key: applied, label: `@${applied}`, count: perBot.get(applied) ?? 0 },
    ]
  }
  const keys =
    v.role === 'keeper' ? [...perBot.keys()].sort() : [...(v.bots ?? [])]
  return keys.map(k => ({
    key: k,
    label: `@${k}`,
    count: perBot.get(k) ?? 0,
  }))
}

/**
 * The people of the bots in `scope`, by the query path the CRM already uses.
 *
 * `audienceOf` and `whoPaid` apply the `bot_name` filter ON THE DATABASE SIDE,
 * which is why they are called instead of a fresh query: pulling the whole
 * platform and filtering afterwards is both needless traffic and one forgotten
 * line away from a leak.
 */
async function clientsLane(
  ctx: ToolContext,
  scope: string[] | null
): Promise<{ cards: ClientCard[]; counts: Map<Stage, number> }> {
  const owner = String(ctx.telegramId)
  const [people, paid, history] = await Promise.all([
    audienceOf(scope),
    whoPaid(scope),
    // Touches live in OUR postgres and are keyed by the owner who recorded
    // them, so they need no bot filter -- and never throw: a CRM that has not
    // been touched yet is an empty history, not a broken board.
    touchesByLead(ctx.pool as never, owner),
  ])

  /*
   * THE SAME SCOPE, CHECKED AGAIN ON THE WAY OUT.
   *
   * Not a second source of truth -- it is the very list that was sent to the
   * database -- and not distrust of PostgREST either. The filter is built by
   * pasting bot names into `bot_name=in.("a","b")` with the quotes stripped
   * out of each name, so a bot called `a"b` is asked for as `ab`, which is a
   * DIFFERENT bot's name and could be somebody else's. One `includes` closes
   * that, and closes every future variant of it: whatever comes back, only
   * the bots that were asked for leave this function.
   */
  const allowed = scope === null ? null : new Set(scope)
  const now = Date.now()
  const cards: ClientCard[] = people
    .filter(
      (p: Person) => allowed === null || allowed.has((p.bot_name || '').trim())
    )
    .map((p: Person) => {
      const id = String(p.telegram_id)
      const touches = history.get(id) ?? []
      const quietDays = daysAgo(p.updated_at)
      const hasPaid = paid.has(id)
      const { stage } = stageOf({ paid: hasPaid, touches, quietDays })
      const w = waitingOn({
        paid: hasPaid,
        touches,
        quietDays,
        noAnswerAfterDays: NO_ANSWER_AFTER_DAYS,
        laterAfterDays: LATER_AFTER_DAYS,
        now,
      })
      return {
        id,
        name: p.first_name || null,
        bot: p.bot_name || null,
        stage,
        paid: hasPaid,
        waiting_for_reply: w?.waiting === 'ours',
        quiet_days: quietDays,
        last_touch_at: touches[0]?.at ?? null,
      }
    })

  // Counted over EVERYBODY, while only a handful of cards travel. A column
  // that says 214 and shows eight is honest; a column that says eight because
  // eight is what fitted is a board that shrinks as the business grows.
  const counts = new Map<Stage, number>()
  for (const c of cards) counts.set(c.stage, (counts.get(c.stage) ?? 0) + 1)
  return { cards, counts }
}

/** Whoever is waiting for us first, then the longest silence. */
function byUrgency(a: ClientCard, b: ClientCard): number {
  if (a.waiting_for_reply !== b.waiting_for_reply) {
    return a.waiting_for_reply ? -1 : 1
  }
  return (b.quiet_days ?? -1) - (a.quiet_days ?? -1)
}

export const HIVE_BOARD_TOOLS: AgentTool[] = [
  {
    name: 'hive_board',
    description:
      'Доска проекта из двух дорожек: общая — задачи королевы (что в работе, ' +
      'что ждёт разбора), и личная — ваши клиенты по стадиям (кто ждёт ' +
      'ответа, кто молчит, кто уже платит). Общую видят все, кто вошёл; ' +
      'клиентов — только их владелец. Бесплатно, ничего не меняет. ' +
      'Бери, когда спрашивают «что у нас на доске», «что происходит», ' +
      '«кому я должен ответить».',
    parameters: {
      type: 'object',
      properties: {
        client: {
          type: 'string',
          description:
            'Сузить дорожку клиентов до людей ОДНОГО вашего бота (bot_name, ' +
            'как он записан в avatars). Только сужает: чужой бот — отказ.',
        },
      },
      additionalProperties: false,
    },
    async handler(a: any, ctx?: ToolContext) {
      /*
       * IDENTITY, THEN OWNERSHIP, THEN -- AND ONLY THEN -- READS.
       *
       * `ctx.telegramId` was proved by a signature or a key upstream. An id in
       * `a` states who the caller would LIKE to be, so there is deliberately
       * no argument here that could carry one.
       */
      const who = ctx ? String(ctx.telegramId ?? '').trim() : ''
      if (!who) {
        throw new Error(
          'Доска показывает данные людей и требует подтверждённой личности'
        )
      }

      const v = await visibilityOf(who, { botsOwnedBy })
      const visible = botFilter(v)

      /*
       * A FILTER NARROWS. THE REFUSAL IS HERE, BEFORE THE FIRST QUERY.
       *
       * `canSeeBot` is the same check every other read uses, and a keeper
       * passes it for any name -- so a keeper narrowing to a bot that does not
       * exist gets an empty lane, which is the truth, and never the farm.
       */
      const wanted = String(a?.client ?? '').trim()
      if (wanted && !canSeeBot(v, wanted)) {
        throw new Error(
          `Бот ${wanted} за вами не числится. Доска показывает только ваших ` +
            'людей, и сузить её можно лишь до своего же бота.'
        )
      }
      const scope: string[] | null = wanted ? [wanted] : visible

      /*
       * A bee reads NOTHING of other people -- not a card, not a column, not a
       * total. The clients lane is skipped rather than filtered to zero: with
       * an empty scope there is nothing to ask the database, and asking anyway
       * is how a query with a forgotten filter one day answers.
       */
      const canRead = scope === null || scope.length > 0
      const [board, lane] = await Promise.all([
        queenBoard(),
        canRead
          ? clientsLane(ctx!, scope)
          : Promise.resolve({
              cards: [] as ClientCard[],
              counts: new Map<Stage, number>(),
            }),
      ])

      const shown: ClientCard[] = []
      const columns: Array<{ key: Stage; title: string; count: number }> = []
      if (canRead) {
        for (const col of STAGE_COLUMNS) {
          columns.push({
            key: col.key,
            title: col.title,
            count: lane.counts.get(col.key) ?? 0,
          })
          shown.push(
            ...lane.cards
              .filter(c => c.stage === col.key)
              .sort(byUrgency)
              .slice(0, CARDS_PER_COLUMN)
          )
        }
      }

      return {
        scope: {
          role: v.role,
          label: scopeLabel(v, wanted || null),
          // The scope AFTER narrowing, so it describes this answer and not the
          // caller's rights. `null` only for a keeper who narrowed nothing.
          bots: scope,
        },
        clients: { columns, cards: shown },
        tasks: {
          repo: board.repo ?? null,
          reachable: board.reachable,
          columns: board.columns ?? [],
          cards: board.cards ?? [],
        },
        filter: {
          available: availableFilters(v, lane.cards, wanted || null),
          applied: wanted || null,
        },
        how_to_read:
          'Две дорожки живут по разным правилам. ЗАДАЧИ — общие: это доска ' +
          'королевы по репозиторию, её видит каждый вошедший, людей и денег ' +
          'там нет. КЛИЕНТЫ — только ваши: чужих людей не видно никому, даже ' +
          'числом. Пустая дорожка клиентов без колонок значит «вам не ' +
          'принадлежит ни один бот», а не «клиентов нет». ' +
          'Счёт в колонке — по всем, карточек показано несколько: сверху те, ' +
          'кто ждёт ответа от вас, дальше — самые долгие молчания. ' +
          'Стадия не выставляется руками, она выводится из фактов: платёж в ' +
          'леджере и записанные касания. Разговор, который никто не записал, ' +
          'так и останется в «новых». ' +
          'Если tasks.reachable = false — королева не ответила, и пустые ' +
          'колонки там значат «не видно», а не «пусто». ' +
          'Аргумент client только сужает: чужой бот — отказ, а не пустой ' +
          'список.',
      }
    },
  },
]
