import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as SPEC from './crm-duet.gen'
import {
  CRM_DUET_TOOLS,
  DUET_DENY_REASONS,
  DUET_NEVER,
  LEELA_CANON,
  NO_LIVED_EXPERIENCE_RULE,
  NO_PUBLISH_RULE,
  PAID_TOOLS,
  PLAN_MEANING_RULE,
  REEL_TOOL,
  SELLER_RETRY_ON_LIMIT,
  SELLER_RETRY_PAUSE_MS,
  TURNS_DEFAULT,
  TURNS_MAX,
  DISCOVERY_SELLER_TURNS,
  buyerRequestBody,
  callIsPaid,
  claimsDoneWork,
  claimsFamiliarity,
  claimsLivedExperience,
  deniedToolsFor,
  gateFor,
  isDiscoveryTurn,
  linkReelToPlan,
  mediaOf,
  producedWork,
  promisesFile,
  reportOf,
  retryAllowed,
  runDuet,
  sellerBrief,
  sellerGenderSlip,
  stateAfter,
  storyPlanOf,
  summaryOf,
  viewOf,
  type DuetDeps,
  type DuetRun,
  type ToolResultEvent,
} from '../agent/crm-duet-tool'
import { violatesLeelaVoice } from '../agent/leela-canon'
import type { ChatMessage } from '../agent/chat'
import type { ToolContext } from '../agent/tools'

/**
 * THE DUET IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/crm-duet.t27 is the spec of record. Each
 * `test` of the spec runs here against the HOST: the duet loop and its
 * checks (crm-duet-tool.ts), the voice check (leela-canon.ts) and the bot's
 * owner takeover (another package: its file is read).
 *
 * v2 came from binding v1: its tests were braceless and its roles were two
 * real people's ids. Binding found two drifts and settled both on the spec's
 * side: the negation window reached three words back, and the brief's soft
 * cap had been two per run, not three.
 *
 * v3: the duet's reel is the story reel (crm_story_reel). Wiring it found it
 * in no set of the duet, a promise to send it "kept" by resending her
 * portrait, and her plan read only for the old template's cards.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/crm-duet
 */
const OWNER = '900000001'
const BUYER = '900000060'
const STRANGER = '900000042'
const ROOT = join(__dirname, '..', '..', '..', '..', '..')
const HOST = join(__dirname, '..', 'agent', 'crm-duet-tool.ts')
const ctx = { telegramId: OWNER, pool: {} } as unknown as ToolContext

function freshRun(over: Partial<DuetRun> = {}): DuetRun {
  return {
    id: 'duet-spec',
    buyer: BUYER,
    owner: OWNER,
    turns: 1,
    dry_run: false,
    state: 'running',
    started_at: new Date(0).toISOString(),
    transcript: [],
    coverage: {},
    paid_calls: 0,
    media_sent: 0,
    violations: [],
    voice_flags: [],
    ...over,
  }
}

type Sent = { from: string; to: string; text?: string; url?: string }

/** The seller agent, the buyer model and both sessions, as doubles. */
function deps(
  sellerScript: Array<Array<Record<string, unknown>>>,
  buyerScript: string[]
) {
  const sent: Sent[] = []
  const histories: ChatMessage[][] = []
  const slept: number[] = []
  const denies: Array<ReadonlySet<string> | undefined> = []
  let s = 0
  let b = 0
  const d: DuetDeps = {
    agent: (history, _ctx, opts) => {
      histories.push(history.map(m => ({ ...m })))
      denies.push(opts?.denyTools)
      const events = sellerScript[s++] ?? []
      return (async function* () {
        for (const e of events) yield e as never
      })()
    },
    buyerModel: async () => buyerScript[b++] ?? '',
    sendText: async (from, to, text) => {
      sent.push({ from: String(from.telegramId), to, text })
    },
    sendMedia: async (from, to, url) => {
      sent.push({ from: String(from.telegramId), to, url })
    },
    now: () => 1000,
    sleep: async ms => {
      slept.push(ms)
    },
  }
  return { d, sent, histories, slept, denies }
}

const text = (t: string) => ({ тип: 'текст', текст: t }) // cyrillic-ok: agent event keys
const result = (name: string, value: unknown) => ({
  тип: 'результат', // cyrillic-ok
  имя: name, // cyrillic-ok
  значение: value, // cyrillic-ok
  мс: 5, // cyrillic-ok
})
const failure = (t: string) => ({ тип: 'ошибка', текст: t }) // cyrillic-ok
const announce = (name: string, args: unknown) => ({
  тип: 'инструмент', // cyrillic-ok: agent event keys
  имя: name, // cyrillic-ok
  аргументы: JSON.stringify(args), // cyrillic-ok
})
/** A seller turn that starts her story reel, as crm_story_reel answers it. */
const storyStart = (job: number, args: Record<string, unknown>) => [
  announce(REEL_TOOL, { lead: BUYER, start: true, ...args }),
  result(REEL_TOOL, { started: true, topic: 'x', job, note: 'в фоне' }),
]

type Card = {
  id: number
  telegram_id: string
  title: string
  note: string | null
  status: string
  template_id: string | null
}
/**
 * content_plan_items as Postgres would answer the SQL the host sends: rows
 * are filtered only by the conditions the SQL states, so a dropped condition
 * shows here as it would there.
 */
function cardsPool(cards: Card[]) {
  const queries: string[] = []
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      queries.push(sql)
      if (/^\s*SELECT/i.test(sql)) {
        let out = cards
        if (/telegram_id = \$1/.test(sql))
          out = out.filter(r => r.telegram_id === params[0])
        if (/template_id = \$2/.test(sql))
          out = out.filter(r => r.template_id === params[1])
        if (/template_id IS NOT NULL/.test(sql))
          out = out.filter(r => r.template_id !== null)
        if (/status IN \('idea', 'doing'\)/.test(sql))
          out = out.filter(r => ['idea', 'doing'].includes(r.status))
        // Copies, as a driver returns them: a later UPDATE does not reach back.
        return { rows: out.map(r => ({ ...r })).sort((a, b) => a.id - b.id) }
      }
      if (/^\s*UPDATE content_plan_items/i.test(sql)) {
        const hit = cards.filter(
          r =>
            r.id === params[0] &&
            r.telegram_id === params[1] &&
            r.status === params[3] &&
            r.note === (params[4] ?? null)
        )
        for (const r of hit) {
          r.status = 'doing'
          r.note = String(params[2])
        }
        return { rows: hit.map(r => ({ id: r.id })) }
      }
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`)
    },
  }
  return { pool, queries }
}
const card = (
  id: number,
  title: string,
  template_id: string | null,
  telegram_id = BUYER
): Card => ({ id, telegram_id, title, note: null, status: 'idea', template_id })
const tool = (name: string) => CRM_DUET_TOOLS.find(t => t.name === name)!

/** A base where only `ids` have a connected Telegram session. */
function sessionsPool(ids: string[]) {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      if (/SELECT session FROM tg_sessions/.test(sql)) {
        return {
          rows: ids.includes(String(params[0])) ? [{ session: 'x' }] : [],
        }
      }
      return { rows: [] }
    },
  }
}

/** The spec's claim_is_honest, as runDuet decides it for one turn. */
function claimIsHonest(line: string, results: ToolResultEvent[]): boolean {
  const media = results.map(r => mediaOf(r.value)).filter(Boolean)
  return !claimsDoneWork(line) || producedWork(results) || media.length > 0
}

describe("the spec's tests hold against the host", () => {
  it('the generated module is the spec of record', () => {
    expect(SPEC.ID).toBe('crm-duet')
  })

  it('the seller opens and the business bot stays silent for the run', async () => {
    expect(SPEC.SELLER_SPEAKS_FIRST).toBe(true)
    const { d, sent } = deps(
      [[text('Здравствуйте! Где сейчас живёт ваша игра?')], [text('Понял.')]],
      ['В боте и в канале.', 'Спасибо.']
    )
    const run = await runDuet(freshRun({ turns: 2 }), ctx, d)
    // speaker_at(i).from_owner == (i % 2 == 0)
    expect(run.transcript.map(t => t.from)).toEqual([
      'seller',
      'buyer',
      'seller',
      'buyer',
    ])
    // The first message of the run is the owner's own: it arms the takeover.
    expect(sent[0]).toMatchObject({ from: OWNER, to: BUYER })
    // business_bot_silent(owner_session, min): the takeover lasts exactly
    // BUSINESS_BOT_TAKEOVER_MIN and is armed by the owner's own message.
    const bot = readFileSync(
      join(ROOT, 'src', 'services', 'businessBotService.ts'),
      'utf8'
    )
    expect(bot).toContain(
      `export const OWNER_TAKEOVER_MS = ${SPEC.BUSINESS_BOT_TAKEOVER_MIN} * 60 * 1000`
    )
    expect(bot).toMatch(
      /ownerTakeoverUntil\.set\(chatKey, Date\.now\(\) \+ OWNER_TAKEOVER_MS\)/
    )
  })

  it("the run is the owner's, needs a connected buyer who is not the owner, and returns no session", async () => {
    expect(SPEC.TOOL_CALLER).toBe('owner')
    expect(SPEC.SELLER).toBe('platform-owner')
    expect(SPEC.BUYER).toBe('connected-seller')
    // The owner gate reads OWNER_TELEGRAM_ID when the module loads.
    vi.resetModules()
    const saved = process.env.OWNER_TELEGRAM_ID
    process.env.OWNER_TELEGRAM_ID = OWNER
    try {
      const mod = await import('../agent/crm-duet-tool')
      const start = mod.CRM_DUET_TOOLS.find(t => t.name === SPEC.TOOL_START)!
      expect(mod.CRM_DUET_TOOLS.map(t => t.name)).toContain(SPEC.TOOL_STATUS)
      const call = (who: string, buyer: string, sessions: string[]) =>
        start.handler({ buyer, dry_run: true }, {
          telegramId: who,
          pool: sessionsPool(sessions),
        } as unknown as ToolContext)
      // TOOL_CALLER: nobody but the owner starts a run.
      await expect(call(STRANGER, BUYER, [BUYER])).rejects.toThrow('владельцу')
      // BUYER_MAY_BE_OWNER = false.
      await expect(call(OWNER, OWNER, [OWNER])).rejects.toThrow('сам владелец')
      // BUYER_MUST_BE_SELLER: a buyer without a session row is refused.
      await expect(call(OWNER, STRANGER, [])).rejects.toThrow('не подключён')
    } finally {
      if (saved === undefined) delete process.env.OWNER_TELEGRAM_ID
      else process.env.OWNER_TELEGRAM_ID = saved
      vi.resetModules()
    }
    // RETURNS_SESSION = false: what a run shows has no session in it.
    const { d } = deps([[text('Здравствуйте!')]], ['Добрый день.'])
    const run = await runDuet(freshRun(), ctx, d)
    const keys = (o: object) => JSON.stringify(Object.keys(o))
    expect(keys(viewOf(run, 1000))).not.toMatch(/session/i)
    expect(keys(summaryOf(run, 1000))).not.toMatch(/session/i)
  })

  it('the paid cap is soft and says so', async () => {
    expect(SPEC.PAID_CAP_IS_HARD).toBe(false)
    expect(PAID_TOOLS.size).toBe(SPEC.PAID_TOOLS)
    expect([...PAID_TOOLS].sort()).toEqual([
      'audio_generate',
      'crm_story_reel',
      'image_edit',
      'image_generate',
      'reel_render',
      'video_generate',
    ])
    // The cap lives in the brief: one per reply, one portrait and one reel.
    expect(SPEC.PAID_PER_REPLY_SOFT).toBe(1)
    expect(SPEC.PAID_PER_RUN_SOFT).toBe(2)
    const brief = sellerBrief(BUYER)
    expect(brief).toContain('один портрет и один ролик за диалог')
    expect(brief).toContain('не больше одной за реплику')
    // Soft: a reply past the cap is not refused, it is counted and reported.
    const turn = DISCOVERY_SELLER_TURNS // the first turn with paid tools
    const seller: Array<Array<Record<string, unknown>>> = []
    for (let i = 0; i < turn; i++) seller.push([text('Какой план вам ближе?')])
    seller.push([
      result('image_edit', { done: true, url: 'https://x/a.png' }),
      result('image_edit', { done: true, url: 'https://x/b.png' }),
      result('image_edit', { done: true, url: 'https://x/c.png' }),
      text('Собрал три портрета в стиле игры.'),
    ])
    const { d } = deps(seller, ['План 6.', 'Шестой.', 'Посмотрю.'])
    const run = await runDuet(
      freshRun({ turns: turn + 1, dry_run: true }),
      ctx,
      d
    )
    expect(run.state).toBe('done')
    expect(run.paid_calls).toBe(3)
    expect(run.paid_calls).toBeGreaterThan(SPEC.PAID_PER_RUN_SOFT)
    expect(reportOf(run)).toContain('платных генераций: 3')
  })

  it("the duet's reel is the story reel, paid only when it starts", async () => {
    expect(REEL_TOOL).toBe(SPEC.REEL_TOOL)
    expect(SPEC.REEL_TOOL).toBe('crm_story_reel')
    // OLD_REEL_IN_BRIEF = false: the brief names the story reel, not the template.
    const brief = sellerBrief(BUYER)
    expect(SPEC.OLD_REEL_IN_BRIEF).toBe(false)
    expect(brief).not.toContain('LeelaPlanReel')
    expect(brief).toContain(`${SPEC.REEL_TOOL} {lead: ${BUYER}} без start`)
    expect(brief).toContain(`{lead: ${BUYER}, start: true, topic:`)
    // call_is_paid(paid_tool, story_reel, start)
    const call = (name: string, args?: Record<string, unknown>) =>
      callIsPaid({ name, value: {}, ms: 1, ...(args ? { args } : {}) })
    expect(call(REEL_TOOL, { lead: BUYER, start: true })).toBe(true)
    expect(call(REEL_TOOL, { lead: BUYER })).toBe(false)
    expect(call('reel_render')).toBe(true)
    expect(call('leela_plan')).toBe(false)
    // The run counts the start, not the read.
    const seller: Array<Array<Record<string, unknown>>> = []
    for (let i = 0; i < DISCOVERY_SELLER_TURNS; i++)
      seller.push([text('Какой план вам ближе?')])
    seller.push([
      announce(REEL_TOOL, { lead: BUYER }),
      result(REEL_TOOL, { ready: true, lead: BUYER, price_tokens: 270 }),
      ...storyStart(41, {}),
      text('Соберу рилс-историю по вашему плану и сначала посмотрю её сам.'),
    ])
    const { d } = deps(seller, ['План 6.', 'Шестой.', 'Жду.'])
    const run = await runDuet(
      freshRun({ turns: DISCOVERY_SELLER_TURNS + 1 }),
      ctx,
      d
    )
    expect(run.paid_calls).toBe(1)
    expect(run.coverage[REEL_TOOL]).toEqual({ calls: 2, ok: 2, fail: 0 })
    // STORY_START_COUNTS_AS_WORK: "the finished reel comes after my check"
    // is honest after a start and a false claim without one.
    const LINE = 'Готовый рилс придёт после моей проверки.'
    const started = {
      name: REEL_TOOL,
      value: { started: true, job: 41 },
      ms: 1,
      args: { start: true },
    }
    expect(SPEC.STORY_START_COUNTS_AS_WORK).toBe(true)
    expect(claimIsHonest(LINE, [started])).toBe(true)
    expect(claimIsHonest(LINE, [])).toBe(false)
  })

  it('the story reel waits for discovery and never runs dry', async () => {
    // story_offered(seller_turn, dry_run)
    const offered = (t: number, dry: boolean) =>
      !deniedToolsFor(t, dry).has(REEL_TOOL)
    expect(offered(0, false)).toBe(false)
    expect(offered(1, false)).toBe(false)
    expect(offered(2, false)).toBe(true)
    expect(offered(2, true)).toBe(false)
    expect(SPEC.STORY_IN_DRY_RUN).toBe(false)
    // The refusal says why, in words the model can act on.
    expect(gateFor(2, true).denyReasons?.get(REEL_TOOL)).toContain(
      'пробный прогон'
    )
    // The loop hands the agent that gate on every seller turn.
    const script = [
      [text('Где живёт игра?')],
      [text('Кто играет?')],
      [text('Какой план взять темой?')],
    ]
    const dry = deps(script, ['В боте.', 'Друзья.', 'План 6.'])
    await runDuet(freshRun({ turns: 3, dry_run: true }), ctx, dry.d)
    expect(dry.denies.map(s => s?.has(REEL_TOOL))).toEqual([true, true, true])
    const live = deps(script, ['В боте.', 'Друзья.', 'План 6.'])
    await runDuet(freshRun({ turns: 3 }), ctx, live.d)
    expect(live.denies.map(s => s?.has(REEL_TOOL))).toEqual([true, true, false])
  })

  it("the story reel reaches her by the owner's card, and a promise is not a resend", async () => {
    expect(SPEC.STORY_REEL_FORWARDED).toBe(false)
    const PORTRAIT = 'https://x/portrait.png'
    const PROMISE = 'Пришлю видео, как только сам его посмотрю.'
    const turns = DISCOVERY_SELLER_TURNS + 3
    const seller: Array<Array<Record<string, unknown>>> = []
    for (let i = 0; i < DISCOVERY_SELLER_TURNS; i++)
      seller.push([text('Какой план вам ближе?')])
    seller.push([
      result('image_edit', { done: true, url: PORTRAIT }),
      text('Это ваш портрет.'),
    ])
    const storyTurn = seller.length
    seller.push([...storyStart(42, { topic: 'план 6' }), text(PROMISE)])
    seller.push([text('Что поправить в портрете, пока рилс собирается?')])
    const buyers = ['План 6.', 'Шестой.', 'Красиво. А видео?', 'Жду.', 'Ок.']
    const { d, sent, histories } = deps(seller, buyers)
    const ctxs: ToolContext[] = []
    const agent = d.agent
    d.agent = (h, c, o) => {
      ctxs.push(c)
      return agent(h, c, o)
    }
    const run = await runDuet(freshRun({ turns }), ctx, d)
    expect(run.state).toBe('done')
    // resend_for_promise(0, story_started=true, has_last=true) == false: the
    // portrait went once; the story reel is not the duet's to send.
    expect(sent.filter(s => s.url)).toEqual([
      { from: OWNER, to: BUYER, url: PORTRAIT },
    ])
    expect(run.transcript[storyTurn * 2].resent).toBeUndefined()
    expect(run.violations).toEqual([])
    // STORY_CARD_TO: the duet, not the model, says where the card goes.
    expect(SPEC.STORY_CARD_TO).toBe('dm')
    expect(ctxs.every(c => c.storyTo === SPEC.STORY_CARD_TO)).toBe(true)
    const story = readFileSync(
      join(__dirname, '..', 'agent', 'crm-story-tool.ts'),
      'utf8'
    )
    expect(story).toContain('String(ctx.storyTo ?? args.to ??')
    // STORY_NOTE_NEXT_TURN: the seller reads, in front of her next reply,
    // that the reel is being made -- not ready, not in her chat.
    expect(SPEC.STORY_NOTE_NEXT_TURN).toBe(true)
    const note = String(histories[storyTurn + 1].at(-1)?.content ?? '')
    expect(note).toContain('[дуэт] Рилс-история прошлого хода делается')
    expect(note).toContain('Не говори, что она готова')
    // resend_for_promise(0, false, true) == true: without a story reel the
    // same promise is kept with the last file, and reported.
    const old = deps(
      [...seller.slice(0, storyTurn), [text(PROMISE)], seller[storyTurn + 1]],
      buyers
    )
    const replay = await runDuet(freshRun({ turns }), ctx, old.d)
    expect(replay.transcript[storyTurn * 2].resent).toEqual([PORTRAIT])
  })

  it('her reel card is found by the plan, not by the template', async () => {
    expect(SPEC.PLAN_LINK_ANY_REEL_TEMPLATE).toBe(true)
    expect(SPEC.PLAN_LINK_OWN_CARDS).toBe(false)
    // card_takes_reel(names_plan, has_template)
    const cards = [
      card(1, 'Мой план 6, своими словами', null), // hers: (true, false)
      card(2, '12 → 8: змея Зависти — план 12', 'LeelaPlanReel'), // (false, true)
      card(3, 'Вход с шестёрки — план 6', 'StoryReel'), // (true, true)
    ]
    const { pool } = cardsPool(cards)
    const link = await linkReelToPlan(pool as never, {
      buyer: BUYER,
      plan: 6,
      url: '',
      runId: 'duet-spec',
      job: 43,
    })
    expect(link).toMatchObject({ result: 'moved', item_id: 3, job: 43 })
    expect(cards.map(c => c.status)).toEqual(['idea', 'idea', 'doing'])
    expect(cards[2].note).toContain('задача 43')
    // story_plan(topic_given, plan_in_topic, looked_up_single)
    expect(storyPlanOf('план 6 — Заблуждение', [])).toBe(6)
    expect(storyPlanOf('Заблуждение', [12])).toBe(12)
    expect(storyPlanOf('План 6: Заблуждение', [12])).toBe(6)
    expect(storyPlanOf('', [12])).toBeNull()
    expect(storyPlanOf('Заблуждение', [])).toBeNull()
    // STORY_WITHOUT_TOPIC_TAKES_CARD: no topic, the duet links nothing.
    expect(SPEC.STORY_WITHOUT_TOPIC_TAKES_CARD).toBe(true)
    const seller: Array<Array<Record<string, unknown>>> = []
    for (let i = 0; i < DISCOVERY_SELLER_TURNS; i++)
      seller.push([text('Какой план вам ближе?')])
    seller.push([...storyStart(44, {}), text('Соберу рилс-историю.')])
    const plan = cardsPool([card(3, 'Вход с шестёрки — план 6', 'StoryReel')])
    const { d } = deps(seller, ['План 6.', 'Шестой.', 'Жду.'])
    d.clientProfile = async () => ({ has_profile: false })
    const run = await runDuet(
      freshRun({ turns: DISCOVERY_SELLER_TURNS + 1 }),
      { ...ctx, pool: plan.pool } as unknown as ToolContext,
      d
    )
    expect(run.transcript.at(-2)?.plan_item).toMatchObject({
      result: 'by_template',
      job: 44,
    })
    expect(plan.queries).toEqual([])
  })

  it('turns are bounded and the buyer side never calls tools', () => {
    expect(TURNS_DEFAULT).toBe(SPEC.TURNS_DEFAULT)
    expect(TURNS_MAX).toBe(SPEC.TURNS_MAX)
    expect(TURNS_DEFAULT).toBeLessThanOrEqual(TURNS_MAX)
    expect(TURNS_MAX).toBe(8)
    // BUYER_TURN_IS_PLAIN_COMPLETION: the buyer's request has no tools.
    const body = buyerRequestBody({ id: 'zai', model: 'glm' }, [
      { role: 'user', content: 'Здравствуйте' },
    ])
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('tool_choice')
    expect(body.stream).toBe(false)
    // RUNS_IN_BACKGROUND: the tool starts the loop and returns at once.
    const src = readFileSync(HOST, 'utf8')
    expect(src).toMatch(/void runDuet\(run, ctx!, deps\)/)
  })

  it("a run that broke off is failed and keeps the turn's error", async () => {
    expect(SPEC.ABORTED_RUN_STATE).toBe('failed')
    expect(stateAfter(3, 4, true)).toBe('failed')
    expect(stateAfter(3, 4, false)).toBe('failed')
    expect(stateAfter(6, 4, false)).toBe('failed') // turns * 2, not turns
    expect(stateAfter(8, 4, false)).toBe('done')
    // ABORTED_RUN_KEEPS_ERROR, RUN_ERROR_SHOWN_ON_DASHBOARD.
    const DEAD = 'zai: ключ недействителен'
    const { d } = deps([[text('Здравствуйте!')], [failure(DEAD)]], ['Да.'])
    const run = await runDuet(freshRun({ turns: 4 }), ctx, d)
    expect(run.state).toBe('failed')
    expect(run.transcript).toHaveLength(3)
    expect(run.error).toBe(`turn 2: ${DEAD}`)
    expect(summaryOf(run, 1000).error).toBe(run.error)
  })

  it('a claim of finished work needs a tool or a file in the same turn', async () => {
    const CLAIM = 'Я уже собрал для вас пробный ролик.'
    const reel = { name: 'reel_render', value: { done: true, url: 'https://x/r.mp4' }, ms: 1 } // prettier-ignore
    const oldFile = { name: 'my_renders', value: { done: true, url: 'https://x/o.mp4' }, ms: 1 } // prettier-ignore
    // claim_is_honest(claims, produced, media)
    expect(claimIsHonest(CLAIM, [])).toBe(false)
    expect(claimIsHonest(CLAIM, [reel])).toBe(true)
    expect(claimIsHonest(CLAIM, [oldFile])).toBe(true)
    expect(claimIsHonest('Какой план вам ближе?', [])).toBe(true)
    // CLAIM_CHECK_CORRECTIONS = 1 and the miss is a violation.
    const { d, histories } = deps(
      [[text(CLAIM)], [text('Могу собрать пример. Какой план вам ближе?')]],
      ['Шестой.']
    )
    const run = await runDuet(freshRun(), ctx, d)
    expect(histories).toHaveLength(1 + SPEC.CLAIM_CHECK_CORRECTIONS)
    expect(run.violations).toEqual([
      'turn 0: заявлена сделанная работа без инструмента — переписано',
    ])
  })

  it('a seller turn that hit a limit is retried once, without paid calls', async () => {
    expect(SELLER_RETRY_ON_LIMIT).toBe(SPEC.SELLER_RETRY_ON_LIMIT)
    expect(SELLER_RETRY_PAUSE_MS).toBe(SPEC.SELLER_RETRY_PAUSE_MS)
    const LIMIT = 'zai: превышен лимит запросов'
    const free = [{ name: 'crm_client_profile', value: {}, ms: 1 }]
    const paid = [{ name: 'image_edit', value: { done: true }, ms: 1 }]
    expect(retryAllowed(0, LIMIT, free)).toBe(true)
    expect(retryAllowed(1, LIMIT, free)).toBe(false)
    expect(retryAllowed(0, 'zai: ключ недействителен', free)).toBe(false)
    expect(retryAllowed(0, LIMIT, paid)).toBe(false)
    // RETRY_NOTED_IN_TRANSCRIPT: the line keeps the first error.
    const { d, slept } = deps([[failure(LIMIT)], [failure(LIMIT)]], [])
    const run = await runDuet(freshRun(), ctx, d)
    expect(slept).toEqual([SPEC.SELLER_RETRY_PAUSE_MS])
    expect(run.transcript[0].retried).toBe(LIMIT)
    expect(run.state).toBe('failed')
  })

  it('the first two seller turns are discovery: no paid tools, no familiarity', async () => {
    expect(DISCOVERY_SELLER_TURNS).toBe(SPEC.DISCOVERY_SELLER_TURNS)
    // paid_tool_offered(t) == t >= DISCOVERY_SELLER_TURNS
    for (const t of [0, 1, 2, 3]) {
      const offered = [...PAID_TOOLS].every(p => !deniedToolsFor(t).has(p))
      expect(offered).toBe(t >= SPEC.DISCOVERY_SELLER_TURNS)
      expect(isDiscoveryTurn(t)).toBe(!offered)
    }
    // DISCOVERY_HIDES_PAID_TOOLS: the loop passes the gate to the agent.
    const { d, denies } = deps(
      [
        [text('Где живёт игра?')],
        [text('Кто играет?')],
        [text('Покажу пример.')],
      ],
      ['В боте.', 'Друзья.', 'Давайте.']
    )
    await runDuet(freshRun({ turns: 3, dry_run: true }), ctx, d)
    expect(denies[0]?.has('reel_render')).toBe(true)
    expect(denies[1]?.has('reel_render')).toBe(true)
    expect(denies[2]?.has('reel_render')).toBe(false)
    // No familiarity with a person who has not spoken; the writer is male.
    expect(claimsFamiliarity('Как вы просили, вот пример.')).toBe(true)
    expect(claimsFamiliarity('Какой план вам ближе?')).toBe(false)
    expect(SPEC.SELLER_GENDER).toBe('m')
    expect(sellerBrief(BUYER)).toContain('в мужском роде')
    expect(sellerGenderSlip('Я задавала этот вопрос сама.')).toBe(true)
    expect(sellerGenderSlip('Я задавал этот вопрос сам.')).toBe(false)
  })

  it('a negated claim word is not a claim; pressure is never exempt', () => {
    // claim_hit_counts(distance): 0 = no negation, 1..WINDOW exempt, beyond counts.
    expect(violatesLeelaVoice('Это предсказание.')).toEqual(['предсказ'])
    expect(violatesLeelaVoice('Здесь без предсказаний.')).toEqual([])
    expect(violatesLeelaVoice('Я не буду предсказывать.')).toEqual([])
    expect(SPEC.NEGATION_WINDOW_WORDS).toBe(2)
    expect(violatesLeelaVoice('Здесь без всяких точных предсказаний.')).toEqual(
      ['предсказ']
    )
    // PRESSURE_NEGATION_EXEMPT = false: "not today" still presses.
    expect(violatesLeelaVoice('Не сегодня.')).toEqual(['сегодня'])
    // HOOK_NE_SLUCHAJNO_FORBIDDEN_IN_BRIEF.
    expect(sellerBrief(BUYER)).toContain(
      '«Не случайно.» для плана 6 не используй'
    )
  })

  it('what was seen live is separated from what is not claimed', () => {
    const src = readFileSync(HOST, 'utf8')
    expect(src).toContain(SPEC.DUET_LIVE_RUN)
    expect(SPEC.DISCOVERY_GATE_LIVE_RUN).toMatch(/^duet-/)
    expect(SPEC.CLAIM_CHECK_SEEN_LIVE).toBe(false)
    expect(SPEC.RETRY_SEEN_LIVE).toBe(false)
    // DRY_RUN_DELIVERY_CLAIM_FIXED = false: the live line of duet-mu2qj57q
    // still passes both checks. The day one of them catches it, this fails
    // and the spec's constant is flipped with the fix.
    expect(SPEC.DRY_RUN_DELIVERY_CLAIM_SEEN).toBe(true)
    expect(SPEC.DRY_RUN_DELIVERY_CLAIM_FIXED).toBe(false)
    const LIVE = 'Видео уже в чате следующим сообщением.'
    expect(promisesFile(LIVE) || claimsDoneWork(LIVE)).toBe(
      SPEC.DRY_RUN_DELIVERY_CLAIM_FIXED
    )
  })

  it('content is for the real game and nothing live is claimed', async () => {
    const canon = LEELA_CANON.join('\n')
    expect(canon).toContain(`поле из ${SPEC.LEELA_PLANES} планов`)
    expect(canon).toContain(`Правила по умолчанию — ${SPEC.LEELA_RULESET}`)
    expect(canon).toContain(`@${SPEC.BUYER_BOT}`)
    expect(canon).toContain(SPEC.BUYER_APP)
    expect(sellerBrief(BUYER)).toContain('Лила Чакра')
    expect(SPEC.BUYER_GAME).toBe('Leela Chakra')
    // DRY_RUN_SENDS = false: agents talk, Telegram receives nothing.
    const { d, sent } = deps(
      [
        [
          result('image_edit', { done: true, url: 'https://x/p.png' }),
          text('Собрал ваш портрет.'),
        ],
      ],
      ['Вижу.']
    )
    const run = await runDuet(freshRun({ dry_run: true }), ctx, d)
    expect(run.transcript).toHaveLength(2)
    expect(sent).toEqual([])
  })

  it('honesty constants from the live run', () => {
    const brief = sellerBrief(BUYER)
    // PLAN_MEANING_FROM_CANON, NO_LIVED_EXPERIENCE_CLAIM, FEED_PUBLISH_SAYS_SAVED
    expect(brief).toContain(PLAN_MEANING_RULE)
    expect(brief).toContain(NO_LIVED_EXPERIENCE_RULE)
    expect(brief).toContain(NO_PUBLISH_RULE)
    expect(claimsLivedExperience('Я сам играл и бросал кубик.')).toBe(true)
    expect(claimsLivedExperience('Игрок бросает кубик и читает план.')).toBe(
      false
    )
    // PERSONA_CONSENT_IS_NOT_CONSENT, AGENT_PUBLISH_IS_HIDDEN: publishing is
    // refused on every duet turn, with a reason the model can act on.
    expect(DUET_NEVER.has('feed_publish')).toBe(true)
    for (const t of [0, 1, 2, 7]) {
      expect(deniedToolsFor(t).has('feed_publish')).toBe(true)
    }
    expect(DUET_DENY_REASONS.get('feed_publish')).toContain('не одобрение')
  })
})
