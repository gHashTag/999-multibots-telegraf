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
  SELLER_RETRY_ON_LIMIT,
  SELLER_RETRY_PAUSE_MS,
  TURNS_DEFAULT,
  TURNS_MAX,
  DISCOVERY_SELLER_TURNS,
  buyerRequestBody,
  claimsDoneWork,
  claimsFamiliarity,
  claimsLivedExperience,
  deniedToolsFor,
  isDiscoveryTurn,
  mediaOf,
  producedWork,
  promisesFile,
  reportOf,
  retryAllowed,
  runDuet,
  sellerBrief,
  sellerGenderSlip,
  stateAfter,
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
