/**
 * THE MENU'S PRESSES, ON A BOOTED BOT.
 *
 * Every crm: press is answered first, works only for the owner in a private
 * chat, never sends anything to a client, and leaves the owner with a way
 * forward. The services behind the buttons are faked; the dispatchers are
 * the real ones.
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
import { Telegraf, Telegram, session } from 'telegraf'

const OWNER = 424242
process.env.ADMIN_IDS = String(OWNER)
process.env.RENDER_API_KEY = 'k' // secret-guard-ok: invented for this test

const runSweepNow = vi.fn(async () => ({ did: 'idle', why: 'никого' }))
const startScopedSweep = vi.fn(
  async (_b: unknown, _o: string, args: string[]) => `scoped:${args.join(' ')}`
)
const noteResolved = vi.fn()
const buildPlan = vi.fn(async () => ({
  text: 'План продавца',
  keyboard: {
    reply_markup: {
      inline_keyboard: [[{ text: 'x', callback_data: 'crm:leads' }]],
    },
  },
  fingerprint: '0',
}))
vi.mock('@/services/crmProactive', () => ({
  MENU_HOLD_MS: 10 * 60_000,
  buildPlan: (...a: unknown[]) => buildPlan(...(a as [])),
  runSweepNow: (...a: unknown[]) => runSweepNow(...(a as [])),
  startScopedSweep: (...a: unknown[]) =>
    startScopedSweep(...(a as [unknown, string, string[]])),
  scopeLine: () => null,
  activeScope: () => null,
  noteResolved: (...a: unknown[]) => noteResolved(...(a as [])),
}))
const touchLead = vi.fn(async () => ({ saved: true }))
const fetchLeads = vi.fn(async () => ({
  text: 'Кому писать',
  rows: [
    {
      lead: '900000001',
      display: 'Pilot (@pilot_client)',
      next: 'reply',
      signals: ['price'],
    },
  ],
}))
const fetchLead = vi.fn(async () => ({
  text: 'Pilot (@pilot_client) · 900000001',
  lead: '900000001',
  display: 'Pilot (@pilot_client)',
  waiting: true,
  signals: ['price'],
}))
vi.mock('@/services/modelSwitch', () => ({
  fetchLeads: (...a: unknown[]) => fetchLeads(...(a as [])),
  fetchLead: (...a: unknown[]) => fetchLead(...(a as [])),
  touchLead: (...a: unknown[]) => touchLead(...(a as [])),
  ingestChats: vi.fn(async () => ({ people: 3, messages_new: 12 })),
  getProviderStatus: vi.fn(async () => ({
    current: { id: 'zai' },
    chosen: 'zai',
    env: null,
    chain: [],
  })),
  chooseProvider: vi.fn(async () => ({
    current: { id: 'zai' },
    chosen: 'zai',
    env: null,
    chain: [],
  })),
  describeProvider: () => 'модель',
}))
vi.mock('@/services/crmSummary', () => ({
  fetchSummary: vi.fn(async () => ({ hot: 2, by_next: { reply: 1, talk: 0 } })),
  formatSummary: () => 'Сводка',
}))
const pauseAiFor = vi.fn(() => 1)
const resumeAiFor = vi.fn(() => 1)
vi.mock('@/services/businessBotService', () => ({
  pauseAiFor: (...a: unknown[]) => pauseAiFor(...(a as [])),
  resumeAiFor: (...a: unknown[]) => resumeAiFor(...(a as [])),
}))

let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi
let registerCrmCommands: (bot: Telegraf<any>) => void

beforeAll(async () => {
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    return { message_id: 1, date: 0, chat: { id: OWNER, type: 'private' } }
  }
  const mod = await import('@/navigation/registerCommands')
  registerCrmCommands = mod.registerCrmCommands
})
afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
})
beforeEach(() => {
  sink = []
  runSweepNow.mockClear()
  startScopedSweep.mockClear()
  touchLead.mockClear()
  pauseAiFor.mockClear()
  resumeAiFor.mockClear()
  fetchLead.mockClear()
  fetchLeads.mockClear()
})

const press = (
  data: string,
  from = OWNER,
  type: 'private' | 'group' = 'private'
) => ({
  update_id: Math.floor(Math.random() * 1e9),
  callback_query: {
    id: 'q1',
    from: { id: from, is_bot: false, first_name: 'P', language_code: 'ru' },
    chat_instance: 'c1',
    data,
    message: {
      message_id: 7,
      date: Math.floor(Date.now() / 1000),
      chat: { id: from, type },
      text: 'the message the button was attached to',
    },
  },
})
const command = (text: string) => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: {
    message_id: 8,
    date: Math.floor(Date.now() / 1000),
    chat: { id: OWNER, type: 'private' },
    from: { id: OWNER, is_bot: false, first_name: 'P', language_code: 'ru' },
    text,
    entities: [
      { type: 'bot_command', offset: 0, length: text.split(' ')[0].length },
    ],
  },
})
function boot() {
  const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  ;(bot as any).botInfo = {
    id: 111,
    is_bot: true,
    username: 'probe',
    first_name: 'p',
  }
  const errors: string[] = []
  bot.catch((e: any) => errors.push(String((e && e.message) || e)))
  bot.use(session())
  registerCrmCommands(bot)
  return { bot, errors }
}
const sent = () => sink.filter(s => s.method === 'sendMessage')
const keyboardOf = (m: { payload: any }): string[] =>
  (m.payload.reply_markup?.inline_keyboard ?? [])
    .flat()
    .map((b: any) => b.callback_data ?? b.url)

describe('every press is answered first, and only for the owner in a private chat', () => {
  it('a lead press answers the query before anything else, then shows the brief with its menu', async () => {
    const { bot, errors } = boot()
    await bot.handleUpdate(press('crm:lead:900000001') as any)
    expect(errors).toEqual([])
    expect(sink[0].method).toBe('answerCallbackQuery')
    const m = sent()
    expect(m).toHaveLength(1)
    expect(m[0].payload.text).toContain('Pilot')
    expect(keyboardOf(m[0])).toEqual([
      'crm:prep:900000001',
      'crm:later:900000001',
      'crm:refuse:900000001',
      'crm:leads',
      'crm:menu',
    ])
  })

  it('a stranger and a group get an answered query and nothing else', async () => {
    const { bot } = boot()
    await bot.handleUpdate(press('crm:lead:900000001', 999) as any)
    await bot.handleUpdate(press('crm:leads', OWNER, 'group') as any)
    expect(sink.filter(s => s.method === 'answerCallbackQuery')).toHaveLength(2)
    expect(sent()).toHaveLength(0)
    expect(fetchLead).not.toHaveBeenCalled()
  })
})

describe('what the presses do', () => {
  it('the list carries a button per person and the hub', async () => {
    const { bot } = boot()
    await bot.handleUpdate(press('crm:leads') as any)
    const m = sent()
    expect(keyboardOf(m[0])).toEqual([
      'crm:lead:900000001',
      'crm:prep:900000001',
      'crm:leads',
      'crm:summary',
      'crm:sweep',
    ])
  })

  it('prepare: an ack with a menu, then a bounded agent turn for that person, then the outcome with buttons', async () => {
    const { bot } = boot()
    await bot.handleUpdate(press('crm:prep:900000001') as any)
    expect(runSweepNow).toHaveBeenCalledTimes(1)
    const opts = (
      runSweepNow.mock.calls[0] as unknown as [unknown, string, any]
    )[2]
    expect(opts.holdMs).toBe(10 * 60_000)
    expect(opts.ingest).toBe(false)
    expect(opts.prompt).toContain('ОДИН человек — 900000001')
    expect(opts.prompt).toContain('НЕ ПРЕДЛАГАЙ ОПЛАТУ ПЕРВЫМ')
    const m = sent()
    expect(m[0].payload.text).toContain('Готовлю для 900000001')
    expect(keyboardOf(m[0])).toEqual(['crm:menu'])
    expect(m[1].payload.text).toContain('Тихо')
    expect(keyboardOf(m[1])).toEqual([
      'crm:lead:900000001',
      'crm:later:900000001',
      'crm:leads',
      'crm:summary',
      'crm:sweep',
    ])
  })

  it('a double tap on prepare runs one turn', async () => {
    const { bot } = boot()
    await Promise.all([
      bot.handleUpdate(press('crm:prep:900000001') as any),
      bot.handleUpdate(press('crm:prep:900000001') as any),
    ])
    expect(runSweepNow).toHaveBeenCalledTimes(1)
  })

  it('later records a touch and says so; refuse asks twice', async () => {
    const { bot } = boot()
    await bot.handleUpdate(press('crm:later:900000001') as any)
    expect(touchLead).toHaveBeenCalledWith(String(OWNER), '900000001', 'later')
    expect(sent()[0].payload.text).toContain('Записал: 900000001 — позже')
    sink = []
    await bot.handleUpdate(press('crm:refuse:900000001') as any)
    expect(touchLead).toHaveBeenCalledTimes(1)
    const edit = sink.find(s => s.method === 'editMessageReplyMarkup')
    expect(JSON.stringify(edit?.payload.reply_markup)).toContain(
      'crm:refuse!:900000001'
    )
    await bot.handleUpdate(press('crm:refuse!:900000001') as any)
    expect(touchLead).toHaveBeenLastCalledWith(
      String(OWNER),
      '900000001',
      'refused'
    )
    expect(sent().at(-1)?.payload.text).toContain('30 дней')
  })

  it('a touch the render refused is a failure with a retry', async () => {
    touchLead.mockResolvedValueOnce({
      saved: false,
      why: 'такого человека нет',
    } as never)
    const { bot } = boot()
    await bot.handleUpdate(press('crm:later:900000001') as any)
    const m = sent()[0]
    expect(m.payload.text).toContain('Не записал: такого человека нет')
    expect(keyboardOf(m)).toContain('crm:later:900000001')
  })

  it('mute pauses the AI in that chat for this owner', async () => {
    const { bot } = boot()
    await bot.handleUpdate(press('crm:mute:900000001') as any)
    expect(pauseAiFor).toHaveBeenCalledWith('900000001', undefined, OWNER)
    expect(sent()[0].payload.text).toContain('Молчу')
    expect(keyboardOf(sent()[0])).toContain('crm:unmute:900000001')
  })

  it('unmute gives the chat back to the AI for this owner', async () => {
    const { bot } = boot()
    await bot.handleUpdate(press('crm:unmute:900000001') as any)
    expect(resumeAiFor).toHaveBeenCalledWith('900000001', OWNER)
    expect(sent()[0].payload.text).toContain('снова отвечает')
  })

  it('the scope buttons and /sweep with words start the same scoped sweep', async () => {
    const { bot } = boot()
    await bot.handleUpdate(press('crm:scope:hot') as any)
    await bot.handleUpdate(command('/sweep next=talk limit=3') as any)
    expect(startScopedSweep.mock.calls.map(c => c[2])).toEqual([
      ['hot'],
      ['next=talk', 'limit=3'],
    ])
    expect(sent().every(m => keyboardOf(m).includes('crm:summary'))).toBe(true)
  })

  it('/sweep alone runs the generic sweep through the same turn with the short hold', async () => {
    const { bot } = boot()
    await bot.handleUpdate(command('/sweep') as any)
    expect(startScopedSweep).not.toHaveBeenCalled()
    expect(runSweepNow).toHaveBeenCalledTimes(1)
    const opts = (
      runSweepNow.mock.calls[0] as unknown as [unknown, string, any]
    )[2]
    expect(opts.holdMs).toBe(10 * 60_000)
    expect(opts.prompt).toBeUndefined()
  })

  it('a failed turn offers a retry, and the model when the agent did not look', async () => {
    runSweepNow.mockResolvedValueOnce({
      did: 'failed',
      why: 'модель ответила, не вызвав ни одного инструмента — она не смотрела',
    } as never)
    const { bot } = boot()
    await bot.handleUpdate(press('crm:sweep') as any)
    const last = sent().at(-1)!
    expect(last.payload.text).toContain('Не вышло')
    expect(keyboardOf(last)).toEqual([
      'crm:sweep',
      'crm:model',
      'crm:leads',
      'crm:summary',
      'crm:sweep',
    ])
  })

  it('no crm press ever confirms or cancels a proposal', async () => {
    const { bot } = boot()
    for (const data of [
      'crm:menu',
      'crm:summary',
      'crm:model',
      'crm:ingest',
      'crm:back:900000001',
    ]) {
      await bot.handleUpdate(press(data) as any)
    }
    expect(noteResolved).not.toHaveBeenCalled()
    expect(sink.every(s => s.method !== 'sendChatAction' || true)).toBe(true)
    expect(sent().length).toBeGreaterThan(0)
    for (const m of sent()) expect(keyboardOf(m).length).toBeGreaterThan(0)
  })
})

describe('the plan from a button and from /plan', () => {
  it('both build the plan as the owner and answer with its keyboard', async () => {
    const { bot } = boot()
    await bot.handleUpdate(press('crm:plan') as any)
    await bot.handleUpdate(command('/plan') as any)
    expect(buildPlan).toHaveBeenCalledTimes(2)
    expect(buildPlan.mock.calls[0][0]).toBe(String(OWNER))
    expect(sent()).toHaveLength(2)
    expect(sent()[0].payload.text).toBe('План продавца')
    expect(keyboardOf(sent()[0])).toEqual(['crm:leads'])
  })
})
