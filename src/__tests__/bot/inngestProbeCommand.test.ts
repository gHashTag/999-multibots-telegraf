/**
 * /inngest_probe ON A BOOTED BOT.
 *
 * The command shows the plan and a button; nothing runs until the button is
 * pressed, only an admin can press it, only one suite runs at a time, and
 * the report replaces the progress line. The suite itself is faked; the
 * Telegraf plumbing is real.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest'
import { Telegraf, Telegram } from 'telegraf'

const ADMIN = 424242
const STRANGER = 777
process.env.ADMIN_IDS = String(ADMIN)

vi.mock('@/inngest_app/status/functionsStatus', () => ({
  fetchFunctionsStatusSafe: vi.fn(async () => ({
    ok: false,
    error: { error: 'unreachable in test', gqlUrl: 'http://x/v0/gql' },
  })),
  renderRunsSummaryText: vi.fn(() => 'summary'),
}))

let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi
let setup: typeof import('@/commands/inngestProbeCommand')

beforeAll(async () => {
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    return { message_id: 1, date: 0, chat: { id: ADMIN, type: 'private' } }
  }
  setup = await import('@/commands/inngestProbeCommand')
})
afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
})
beforeEach(() => {
  sink = []
  setup.resetProbeSuiteLockForTests()
})

const command = (text: string, from = ADMIN) => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: {
    message_id: 8,
    date: Math.floor(Date.now() / 1000),
    chat: { id: from, type: 'private' },
    from: { id: from, is_bot: false, first_name: 'P' },
    text,
    entities: [
      { type: 'bot_command', offset: 0, length: text.split(' ')[0].length },
    ],
  },
})
const press = (data: string, from = ADMIN) => ({
  update_id: Math.floor(Math.random() * 1e9),
  callback_query: {
    id: 'q1',
    from: { id: from, is_bot: false, first_name: 'P' },
    chat_instance: 'c1',
    data,
    message: {
      message_id: 7,
      date: Math.floor(Date.now() / 1000),
      chat: { id: from, type: 'private' },
      text: 'Запустить?',
    },
  },
})

const report = (ok: boolean) => ({
  version: 1,
  appId: 'telegram-bot-client',
  startedAt: '2026-09-10T00:00:00.000Z',
  endedAt: '2026-09-10T00:00:30.000Z',
  gqlUrl: 'http://inngest.internal:8288/v0/gql',
  results: [
    {
      id: 'a-guard',
      slug: 'telegram-bot-client-a-guard',
      expect: 'FAILED-at-guard' as const,
      guard: 'validate-input',
      guardKind: 'step' as const,
      payload: { e2e_test: true },
      verdict: (ok ? 'match' : 'mismatch') as 'match' | 'mismatch',
      runId: 'run-1',
      status: ok ? 'FAILED' : 'COMPLETED',
      failedStep: ok ? 'validate-input' : undefined,
    },
  ],
  counts: {
    match: ok ? 1 : 0,
    mismatch: ok ? 0 : 1,
    timeout: 0,
    'invoke-error': 0,
    skipped: 0,
  },
  ok,
})

function boot(runner: import('@/commands/inngestProbeCommand').ProbeRunner) {
  const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  ;(bot as any).botInfo = {
    id: 111,
    is_bot: true,
    username: 'probe',
    first_name: 'p',
  }
  const errors: string[] = []
  bot.catch((e: any) => errors.push(String((e && e.message) || e)))
  setup.setupInngestProbeCommand(bot as any, runner)
  return { bot, errors }
}
const sent = () => sink.filter(s => s.method === 'sendMessage')
const edits = () => sink.filter(s => s.method === 'editMessageText')

describe('/inngest_probe', () => {
  it('shows the plan and a confirm button; nothing runs yet', async () => {
    const runner = vi.fn(async () => report(true))
    const { bot, errors } = boot(runner)
    await bot.handleUpdate(command('/inngest_probe') as any)
    expect(errors).toEqual([])
    expect(runner).not.toHaveBeenCalled()
    const texts = sent().map(s => s.payload.text as string)
    expect(texts[0]).toContain('Безопасный прогон Inngest-функций')
    /*
     * A LITERAL COUNT, ON PURPOSE -- and it had rotted.
     *
     * It said 28 while the manifest served 29: crm-proactive-sweep arrived in
     * 02a74d11c and nobody looked. This test was not run between then and now,
     * because GitHub Actions executes no job on this repository, so the only
     * thing standing between a new served function and nobody noticing was a
     * number that had already stopped being true.
     *
     * The number stays LITERAL rather than being read back out of the manifest.
     * A count derived from the thing it measures agrees with itself for ever and
     * would have said nothing here either. Serving a new function SHOULD cost
     * one person one minute: either it belongs in the safe-mode probe -- and
     * then someone has answered whether it can charge, write to a user, or call
     * a paid provider during a probe -- or it belongs in `skip`, deliberately.
     *
     * All three numbers are asserted together so the shape cannot drift while
     * the first number is kept current.
     *
     * 29 -> 31 on 2026-09-19, and the minute this test is designed to cost was
     * duly spent on both newcomers. `ton-pending-watch` and
     * `robokassa-unclaimed-watch` ask whether somebody paid and was never
     * credited. In a probe they are safe for the plainest possible reason:
     * both return through `skippedInSafeMode` before they read anything, so a
     * probe run touches no database, no chain, no provider -- and neither
     * function can charge, credit or message a person even when it DOES run.
     * They write one journal line and nothing else.
     *
     * The number was found stale by a push gate on a different branch, not by
     * me: `related-tests` did not consider this file related to two new files
     * under inngest_app/functions/money, so it had been red on main since
     * those landed.
     */
    expect(texts[0]).toContain(
      'К запуску: 31, пропуск: 0, всего в манифесте: 31'
    )
    const last = sent().at(-1)!
    const buttons = (last.payload.reply_markup.inline_keyboard as any[])
      .flat()
      .map((b: any) => b.callback_data)
    expect(buttons).toEqual([setup.PROBE_GO_ACTION, setup.PROBE_CANCEL_ACTION])
  })

  it('a stranger gets the admin refusal and no plan', async () => {
    const runner = vi.fn(async () => report(true))
    const { bot } = boot(runner)
    await bot.handleUpdate(command('/inngest_probe', STRANGER) as any)
    expect(sent()).toHaveLength(1)
    expect(sent()[0].payload.text).toContain('нет доступа')
    await bot.handleUpdate(press(setup.PROBE_GO_ACTION, STRANGER) as any)
    expect(runner).not.toHaveBeenCalled()
    expect(sent().at(-1)!.payload.text).toContain('Только для администраторов')
  })

  it('the button runs the suite once and the report replaces the progress line', async () => {
    const runner = vi.fn(
      async (onProgress: (d: number, n: number) => Promise<void>) => {
        await onProgress(1, 1)
        return report(true)
      }
    )
    const { bot, errors } = boot(runner)
    await bot.handleUpdate(press(setup.PROBE_GO_ACTION) as any)
    expect(errors).toEqual([])
    expect(runner).toHaveBeenCalledTimes(1)
    const texts = edits().map(e => e.payload.text as string)
    expect(texts[0]).toBe('Прогон идёт… 0/0')
    expect(texts.at(-1)).toContain('✅ Прогон совпал с манифестом: 1/1')
    expect(texts.at(-1)).toContain('a-guard — FAILED@validate-input')
    expect(setup.probeSuiteIsRunning()).toBe(false)
  })

  it('a mismatch is reported as such, with what was expected and what came', async () => {
    const { bot } = boot(async () => report(false))
    await bot.handleUpdate(press(setup.PROBE_GO_ACTION) as any)
    const last = edits().at(-1)!.payload.text as string
    expect(last).toContain('❌ Прогон разошёлся с манифестом')
    expect(last).toContain('ждали FAILED@validate-input, получили COMPLETED')
  })

  it('only one suite at a time; the lock is released when the suite crashes', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const runner = vi.fn(async () => {
      await gate
      throw new Error('gql down')
    })
    const { bot } = boot(runner)
    const first = bot.handleUpdate(press(setup.PROBE_GO_ACTION) as any)
    await new Promise(r => setTimeout(r, 5))
    expect(setup.probeSuiteIsRunning()).toBe(true)
    await bot.handleUpdate(press(setup.PROBE_GO_ACTION) as any)
    await bot.handleUpdate(command('/inngest_probe') as any)
    expect(runner).toHaveBeenCalledTimes(1)
    expect(edits().some(e => String(e.payload.text).includes('уже идёт'))).toBe(
      true
    )
    expect(sent().some(s => String(s.payload.text).includes('уже идёт'))).toBe(
      true
    )
    release()
    await first
    expect(setup.probeSuiteIsRunning()).toBe(false)
    expect(edits().at(-1)!.payload.text).toContain(
      'Прогон не завершился: gql down'
    )
  })

  it('/inngest_probe status is read-only and says when Inngest is unreachable', async () => {
    const runner = vi.fn(async () => report(true))
    const { bot } = boot(runner)
    await bot.handleUpdate(command('/inngest_probe status') as any)
    expect(runner).not.toHaveBeenCalled()
    expect(sent()[0].payload.text).toContain(
      'Inngest недоступен: unreachable in test'
    )
  })

  it('cancel just closes the prompt', async () => {
    const { bot } = boot(vi.fn(async () => report(true)))
    await bot.handleUpdate(press(setup.PROBE_CANCEL_ACTION) as any)
    expect(edits().at(-1)!.payload.text).toBe('Отменено.')
  })

  it('chunkText splits long reports on line boundaries under the Telegram limit', () => {
    const lines = Array.from(
      { length: 300 },
      (_, i) => `line ${i} ${'x'.repeat(40)}`
    )
    const parts = setup.chunkText(lines.join('\n'))
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(4000)
    expect(parts.join('\n')).toBe(lines.join('\n'))
  })
})
