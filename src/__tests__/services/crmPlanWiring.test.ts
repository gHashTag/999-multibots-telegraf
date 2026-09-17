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
  /*
   * The plan asks the journal how many cards were prepared. It is a SECOND
   * call and the plan survives without it -- which is exactly what this
   * double asserts by refusing: a mock that answers would hide whether the
   * caller really tolerates a failure.
   */
  fetchCardFlow: async () => {
    throw new Error('journal unavailable in this test')
  },
}))
const history: Array<{ role: string; content: string }> = []
const recorded: Array<{ role: string; content: string }[]> = []
vi.mock('@/services/trinityAgent', () => ({
  fetchHistory: async () => history,
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
  it('the tick asks for the plan first, and the entry reads CRM_PLAN, CRM_PLAN_HOUR, CRM_PLAN_TZ', async () => {
    const fs = await import('node:fs')
    const cp = fs.readFileSync('src/services/crmProactive.ts', 'utf8')
    // One tick for both clocks (timer and the Inngest cron): runProactiveTick.
    const run = cp.slice(
      cp.indexOf('export async function runProactiveTick('),
      cp.indexOf('let carrier:')
    )
    expect(run.indexOf('maybeSendDailyPlan(')).toBeGreaterThan(-1)
    expect(run.indexOf('maybeSendDailyPlan(')).toBeLessThan(
      run.indexOf('scopes.get(owner)')
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
