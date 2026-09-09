/**
 * THE DEEP LINK THAT PREPARES AND NEVER SENDS.
 *
 * The owner's console on the website cannot write to anybody: it holds no
 * secret and every outward action in this farm waits for a press on a card in
 * Telegram. Its one action is a link, `t.me/<bot>?start=crm-prep-<id>`, and
 * these are the three things that must stay true about it:
 *
 *   1. Only a payload of exactly that shape matches. A bare number is a
 *      referral code and must keep going to the referral branch.
 *   2. Only an admin gets the preparation. For anybody else /start behaves
 *      exactly as it always did, and says nothing about what the payload meant.
 *   3. Preparing does not send. The sweep is asked for a card; the card's own
 *      button is the only thing that reaches a person.
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
const STRANGER = 585858
const LEAD = '900000001'
process.env.ADMIN_IDS = String(OWNER)
process.env.RENDER_API_KEY = 'k' // secret-guard-ok: invented for this test

const runSweepNow = vi.fn(async () => ({ did: 'idle', why: 'никого' }))
vi.mock('@/services/crmProactive', () => ({
  MENU_HOLD_MS: 10 * 60_000,
  runSweepNow: (...a: unknown[]) => runSweepNow(...(a as [])),
  startScopedSweep: vi.fn(async () => 'scoped'),
  buildPlan: vi.fn(async () => null),
  scopeLine: () => null,
  activeScope: () => null,
  noteResolved: vi.fn(),
}))
vi.mock('@/services/modelSwitch', () => ({
  fetchLeads: vi.fn(async () => ({ text: '', rows: [] })),
  fetchLead: vi.fn(async () => ({
    text: '',
    lead: LEAD,
    display: null,
    waiting: false,
    signals: [],
  })),
  touchLead: vi.fn(async () => ({ saved: true })),
  ingestChats: vi.fn(async () => ({ people: 0, messages_new: 0 })),
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
  fetchSummary: vi.fn(async () => ({})),
  formatSummary: () => 'Сводка',
}))
vi.mock('@/services/businessBotService', () => ({
  pauseAiFor: vi.fn(() => 1),
  createBusinessMiddleware: vi.fn(),
}))

let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi
let mod: typeof import('@/navigation/registerCommands')

beforeAll(async () => {
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    return { message_id: 1, date: 0, chat: { id: OWNER, type: 'private' } }
  }
  mod = await import('@/navigation/registerCommands')
})
afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
})
beforeEach(() => {
  sink = []
  runSweepNow.mockClear()
})

describe('the payload guard', () => {
  it('matches only crm-prep-<numeric id>', () => {
    expect(mod.crmPrepLead(`crm-prep-${LEAD}`)).toBe(LEAD)
    expect(mod.crmPrepLead('crm-prep-12345')).toBe('12345')
  })

  it('refuses everything else, so a referral code still reaches its own branch', () => {
    for (const bad of [
      undefined,
      '',
      '900000001',
      'crm-prep-',
      'crm-prep-abc',
      'crm-prep-1234',
      'crm-prep-9000000019000000',
      'crm-prep-900000001 extra',
      'xcrm-prep-900000001',
      'CRM-PREP-900000001',
    ]) {
      expect(mod.crmPrepLead(bad as string | undefined)).toBeNull()
    }
  })
})

/**
 * The wiring, on a booted bot with the real handlers.
 *
 * `registerCommands` registers the CRM commands itself, which is what fills the
 * slot the /start branch reads -- so one call boots both halves, exactly as the
 * production entry point does.
 */
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
  mod.registerCommands({ bot } as any)
  return { bot, errors }
}

const start = (
  payload: string,
  from = OWNER,
  type: 'private' | 'supergroup' = 'private'
) => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: {
    message_id: 8,
    date: Math.floor(Date.now() / 1000),
    chat: { id: from, type },
    from: { id: from, is_bot: false, first_name: 'P', language_code: 'ru' },
    text: `/start ${payload}`,
    entities: [{ type: 'bot_command' as const, offset: 0, length: 6 }],
  },
})

describe('the deep link, end to end', () => {
  it('prepares for the owner, asks the sweep for a card, and sends nothing to the lead', async () => {
    const { bot } = boot()
    await bot.handleUpdate(start(`crm-prep-${LEAD}`) as any)

    expect(runSweepNow).toHaveBeenCalledTimes(1)
    const opts = runSweepNow.mock.calls[0]?.[2] as {
      prompt?: string
      label?: string
    }
    expect(String(opts?.prompt ?? '')).toContain(LEAD)
    expect(String(opts?.label ?? '')).toContain(LEAD)
    // The prompt the agent gets must forbid sending on its own; the card's
    // button is the only thing that reaches a person.
    expect(String(opts?.prompt ?? '')).toContain('НИЧЕГО НЕ ОТПРАВЛЯЙ САМ')

    // Every message went to the owner's own chat; no client was written to.
    for (const call of sink.filter(s => s.method === 'sendMessage')) {
      expect(String(call.payload.chat_id)).toBe(String(OWNER))
    }
  })

  it('does nothing for a stranger, and never says what the payload meant', async () => {
    const { bot } = boot()
    await bot.handleUpdate(start(`crm-prep-${LEAD}`, STRANGER) as any)

    expect(runSweepNow).not.toHaveBeenCalled()
    const said = sink
      .filter(s => s.method === 'sendMessage')
      .map(s => String(s.payload.text ?? ''))
      .join('\n')
    expect(said).not.toContain(LEAD)
    expect(said).not.toContain('crm-prep')
  })

  it('ignores the payload in a group, where /start answers with its group reply', async () => {
    const { bot } = boot()
    await bot.handleUpdate(
      start(`crm-prep-${LEAD}`, -100123, 'supergroup') as any
    )
    expect(runSweepNow).not.toHaveBeenCalled()
  })

  it('leaves a bare number to the referral branch', async () => {
    const { bot } = boot()
    await bot.handleUpdate(start(LEAD) as any)
    expect(runSweepNow).not.toHaveBeenCalled()
  })
})
