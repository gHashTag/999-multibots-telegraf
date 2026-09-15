import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The plan goes out once per local day from the timer, whatever else is in
 * flight, and again after a restart only if today's marker is not already
 * in the transcript.
 */
const OWNER = '144022504'
const fetchSummary = vi.fn(async () => ({
  segments: { hot: 1, waiting: 2 },
  caps: { hot: 10, waiting: 20, day: 30 },
  seller_sends_recent: 0,
  last_ingest_at: '2026-09-09T03:00:00Z',
}))
vi.mock('@/services/crmSummary', () => ({
  fetchSummary: (...a: unknown[]) => fetchSummary(...(a as [])),
}))
const history: Array<{ role: string; content: string }> = []
const recorded: Array<{ role: string; content: string }[]> = []
/** How deep each look into the transcript asked to go. */
const asked: Array<number | undefined> = []
vi.mock('@/services/trinityAgent', () => ({
  fetchHistory: async (_o: string, limit?: number) => {
    asked.push(limit)
    /*
     * A READ THAT ASKS FOR FORTY TURNS FINDS WHAT IS IN FORTY TURNS.
     *
     * The marker is the only thing standing between a redeploy and a second
     * plan the same day, and the sweep writes two turns every half hour --
     * so by the afternoon the morning marker is no longer inside the model's
     * own window. This fake answers like the server: only what fits in the
     * depth asked for, newest last.
     */
    return limit ? history.slice(-limit) : history.slice(-40)
  },
  recordTurns: async (
    _o: string,
    turns: { role: string; content: string }[]
  ) => {
    recorded.push(turns)
    return 'recorded'
  },
  спроситьАгента: async () => ({ текст: '', инструменты: [] }), // cyrillic-ok: pre-existing identifiers
}))

const NOW = Date.parse('2026-09-09T06:30:00Z')
const TZ = 'Europe/Moscow'
function fakeBot() {
  const sent: Array<{ chat: string; text: string; extra: any }> = []
  return {
    sent,
    telegram: {
      sendMessage: async (chat: string, text: string, extra: any) => {
        sent.push({ chat, text, extra })
        return { message_id: 1 }
      },
    },
  }
}

beforeEach(async () => {
  const m = await import('@/services/crmProactive')
  m.resetPlanForTests()
  m.resetScopesForTests()
  history.length = 0
  recorded.length = 0
  asked.length = 0
  fetchSummary.mockClear()
})

describe('maybeSendDailyPlan', () => {
  it('sends inside the window, once, and writes the marker; not before the hour', async () => {
    const { maybeSendDailyPlan } = await import('@/services/crmProactive')
    const bot = fakeBot()
    expect(
      await maybeSendDailyPlan(bot as never, OWNER, { hour: 12, tz: TZ }, NOW)
    ).toBe('not-due')
    expect(
      await maybeSendDailyPlan(bot as never, OWNER, { hour: 9, tz: TZ }, NOW)
    ).toBe('sent')
    expect(bot.sent).toHaveLength(1)
    expect(bot.sent[0].text).toContain('🗓 План продавца · 9 сентября')
    expect(JSON.stringify(bot.sent[0].extra)).toContain('crm:scope:waiting')
    expect(
      await maybeSendDailyPlan(
        bot as never,
        OWNER,
        { hour: 9, tz: TZ },
        NOW + 60_000
      )
    ).toBe('not-due')
    await new Promise(r => setTimeout(r, 0))
    expect(recorded[0]?.[0]?.content).toContain(
      '[план продавца 2026-09-09] timer'
    )
  })

  it("after a restart, today's marker in the transcript suppresses a second plan; tomorrow sends again", async () => {
    const { maybeSendDailyPlan, resetPlanForTests } = await import(
      '@/services/crmProactive'
    )
    const bot = fakeBot()
    history.push({ role: 'user', content: '[план продавца 2026-09-09] timer' })
    resetPlanForTests()
    expect(
      await maybeSendDailyPlan(bot as never, OWNER, { hour: 9, tz: TZ }, NOW)
    ).toBe('already')
    expect(bot.sent).toHaveLength(0)
    const tomorrow = NOW + 24 * 3600_000
    expect(
      await maybeSendDailyPlan(
        bot as never,
        OWNER,
        { hour: 9, tz: TZ },
        tomorrow
      )
    ).toBe('sent')
  })

  it("finds this morning's marker under a day of sweeps, not just in the model's window", async () => {
    /*
     * MEASURED SHAPE, NOT AN INVENTED ONE. The proactive sweep records a pair
     * of turns every thirty minutes, so a day puts about ninety-six turns on
     * top of the morning plan. The marker was looked for in forty -- the
     * model's own window -- and after a restart in the afternoon the plan
     * went out a second time, on top of the one the owner had read.
     */
    const { maybeSendDailyPlan, resetPlanForTests } = await import(
      '@/services/crmProactive'
    )
    const { PLAN_MARKER_PREFIX } = await import('@/services/crmPlan')
    // The closing bracket belongs to the marker: the check is startsWith of
    // the prefix plus the day plus that bracket, and without it nothing
    // matches -- the older test above got away with it by prefix luck.
    history.push({
      role: 'user',
      content: `${PLAN_MARKER_PREFIX}2026-09-09] timer`,
    })
    for (let i = 0; i < 120; i++) {
      history.push({ role: 'user', content: '[проактивный обход продавца]' })
      history.push({ role: 'assistant', content: 'тихо' })
    }
    // The restart: process memory is gone, the transcript is all there is.
    resetPlanForTests()
    const bot = fakeBot()
    expect(
      await maybeSendDailyPlan(bot as never, OWNER, { hour: 9, tz: TZ }, NOW),
      'the plan went out a second time the same day'
    ).toBe('already')
    expect(bot.sent).toHaveLength(0)
    expect(
      asked.some(n => (n ?? 0) >= 240),
      'the marker was looked for in a window a day of sweeps pushes it out of'
    ).toBe(true)
  })

  it('sendPlanNow sends whatever the clock says and marks the day', async () => {
    const { sendPlanNow, maybeSendDailyPlan } = await import(
      '@/services/crmProactive'
    )
    const bot = fakeBot()
    const late = Date.parse('2026-09-09T20:00:00Z')
    const plan = await sendPlanNow(bot as never, OWNER, {
      why: 'command',
      now: late,
      tz: TZ,
    })
    expect(plan.text).toContain('План продавца')
    expect(bot.sent).toHaveLength(1)
    expect(
      await maybeSendDailyPlan(bot as never, OWNER, { hour: 9, tz: TZ }, late)
    ).toBe('not-due')
  })
})

describe('wired', () => {
  it('the timer tick asks for the plan first, and the entry reads CRM_PLAN, CRM_PLAN_HOUR, CRM_PLAN_TZ', async () => {
    const fs = await import('node:fs')
    const cp = fs.readFileSync('src/services/crmProactive.ts', 'utf8')
    const run = cp.slice(
      cp.indexOf('const run = async () => {'),
      cp.indexOf('const first = setTimeout(run')
    )
    expect(run.indexOf('maybeSendDailyPlan(')).toBeGreaterThan(-1)
    expect(run.indexOf('maybeSendDailyPlan(')).toBeLessThan(
      run.indexOf('scopes.get(String(opts.ownerId))')
    )
    const idx = fs.readFileSync('src/index.ts', 'utf8')
    expect(idx).toContain("process.env.CRM_PLAN ?? '1'")
    expect(idx).toContain('CRM_PLAN_HOUR')
    expect(idx).toContain('CRM_PLAN_TZ')
    const rc = fs.readFileSync('src/navigation/registerCommands.ts', 'utf8')
    expect(rc).toMatch(/bot\.command\('plan', requireAdmin\(\)/)
    expect(rc).toContain("verb === 'plan'")
  })
})
