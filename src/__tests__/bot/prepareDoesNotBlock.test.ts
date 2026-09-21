/**
 * "PREPARE" DOES NOT STOP THE BOT FOR THREE MINUTES.
 *
 * The CRM's prepare / sweep ran the agent turn inside the button handler and
 * awaited it -- up to three minutes -- and Telegraf fetches the next batch of
 * updates only after every handler of the current one has settled. So the
 * owner pressed "Prepare" and the bot went deaf: the owner's own next press
 * (Send / Cancel on a card already on screen) and every client of that bot
 * waited behind it. The turn now runs in the owner's lane (`crm:<owner>`).
 *
 * The correspondence import ("crm:ingest") awaited the render for up to
 * 170 s on the loop in the same way, and runs in the same lane now.
 *
 * A job in that lane that the process cannot finish before it stops is
 * announced to the owner with a button to run it again (laneNotices.ts):
 * the press was confirmed to Telegram long ago and will not come back.
 *
 * The dispatchers are the real ones; the sweep, the import and the proposal
 * service are faked, the sweep and the import with promises this test
 * resolves by hand.
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

const OWNER = 900000071
process.env.ADMIN_IDS = String(OWNER)
process.env.RENDER_API_KEY = 'k' // secret-guard-ok: invented for this test

const sweeps: Array<{
  lead: string
  faceOf?: string
  done: (r: unknown) => void
}> = []
const runSweepNow = vi.fn(
  (_bot: unknown, _owner: string, opts: { prompt?: string; faceOf?: string }) =>
    new Promise(resolve => {
      const lead = /\d{9}/.exec(String(opts?.prompt ?? ''))?.[0] ?? ''
      sweeps.push({ lead, faceOf: opts?.faceOf, done: resolve })
    })
)
vi.mock('@/services/crmProactive', () => ({
  MENU_HOLD_MS: 10 * 60_000,
  runSweepNow: (...a: unknown[]) =>
    runSweepNow(...(a as [unknown, string, { prompt?: string }])),
  scopeLine: () => null,
  activeScope: () => null,
  noteResolved: vi.fn(),
}))
const cancelProposal = vi.fn(async () => ({ ok: true }))
vi.mock('@/services/telegramProposals', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  cancelProposal: (...a: unknown[]) => cancelProposal(...(a as [])),
  takeCardLead: () => null,
}))
const ingests: Array<(r: unknown) => void> = []
const ingestChats = vi.fn(
  () => new Promise(resolve => ingests.push(resolve as (r: unknown) => void))
)
vi.mock('@/services/modelSwitch', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ingestChats: (...a: unknown[]) => ingestChats(...(a as [])),
}))
vi.mock('@/services/hiveNote', () => ({
  notePressToHive: vi.fn(async () => undefined),
}))

let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi
let registerCrmCommands: (bot: Telegraf<any>) => void
let registerProposalButtons: (bot: Telegraf<any>) => void
let agentLanes: typeof import('@/services/agentLanes').agentLanes
let laneNotices: typeof import('@/services/laneNotices')

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
  registerProposalButtons = mod.registerProposalButtons
  ;({ agentLanes } = await import('@/services/agentLanes'))
  laneNotices = await import('@/services/laneNotices')
}, 60_000)
afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
})
beforeEach(() => {
  sink = []
  sweeps.length = 0
  runSweepNow.mockClear()
  cancelProposal.mockClear()
  ingestChats.mockClear()
  ingests.length = 0
})

const press = (data: string) => ({
  update_id: Math.floor(Math.random() * 1e9),
  callback_query: {
    id: 'q1',
    from: { id: OWNER, is_bot: false, first_name: 'P', language_code: 'ru' },
    chat_instance: 'c1',
    data,
    message: {
      message_id: 7,
      date: Math.floor(Date.now() / 1000),
      chat: { id: OWNER, type: 'private' },
      text: 'the message the button was attached to',
    },
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
  registerProposalButtons(bot)
  registerCrmCommands(bot)
  return { bot, errors }
}
async function settlesWithin(p: Promise<unknown>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    p,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`still pending after ${ms} ms`)),
        ms
      )
    }),
  ])
  clearTimeout(timer)
}
const texts = () =>
  sink.filter(s => s.method === 'sendMessage').map(s => String(s.payload.text))

describe('prepare runs in the owner lane, not in the handler', () => {
  it('the press returns at once, a Cancel press is handled while the sweep runs, and the outcome follows', async () => {
    const { bot, errors } = boot()

    await settlesWithin(
      bot.handleUpdate(press('crm:prep:900000081') as any),
      2000
    )
    await vi.waitFor(() => expect(sweeps).toHaveLength(1), { timeout: 5000 })
    expect(texts()[0]).toContain('Готовлю для 900000081')

    // The owner cancels a card that is already on screen: heard at once.
    await settlesWithin(
      bot.handleUpdate(press('tgp:no:abc123abc123:secret') as any),
      2000
    )
    expect(cancelProposal).toHaveBeenCalledTimes(1)
    expect(texts().some(t => t.includes('Отменено'))).toBe(true)
    expect(texts().some(t => t.includes('Тихо'))).toBe(false)

    sweeps[0].done({ did: 'idle', why: 'никого' })
    expect((await agentLanes.drain(5000)).unfinished).toEqual([])
    expect(texts().at(-1)).toContain('Тихо: никого')
    expect(errors).toEqual([])
  })

  it('two prepares from one owner run one after the other, never at once', async () => {
    const { bot } = boot()
    await bot.handleUpdate(press('crm:prep:900000082') as any)
    await bot.handleUpdate(press('crm:prep:900000083') as any)
    await vi.waitFor(() => expect(sweeps).toHaveLength(1), { timeout: 5000 })
    await new Promise(r => setTimeout(r, 200))
    expect(sweeps).toHaveLength(1)
    expect(sweeps[0].lead).toBe('900000082')
    // The card is for this person: a picture in it is drawn from THEIR face.
    expect(sweeps[0].faceOf).toBe('900000082')

    sweeps[0].done({ did: 'idle', why: 'one' })
    await vi.waitFor(() => expect(sweeps).toHaveLength(2), { timeout: 5000 })
    expect(sweeps[1].lead).toBe('900000083')
    sweeps[1].done({ did: 'idle', why: 'two' })
    expect((await agentLanes.drain(5000)).unfinished).toEqual([])
  })

  it('a sweep that throws still tells the owner, with a retry', async () => {
    const { bot, errors } = boot()
    runSweepNow.mockImplementationOnce(async () => {
      throw new Error('render down')
    })
    await bot.handleUpdate(press('crm:sweep') as any)
    expect((await agentLanes.drain(5000)).unfinished).toEqual([])
    const last = sink.filter(s => s.method === 'sendMessage').at(-1)!
    expect(String(last.payload.text)).toContain('Не вышло: render down')
    const buttons = (last.payload.reply_markup?.inline_keyboard ?? [])
      .flat()
      .map((b: any) => b.callback_data)
    expect(buttons).toContain('crm:sweep')
    expect(errors).toEqual([])
  })

  it('the import runs in the lane too: the press returns at once and a Cancel is heard while it runs', async () => {
    const { bot, errors } = boot()

    await settlesWithin(bot.handleUpdate(press('crm:ingest') as any), 2000)
    await vi.waitFor(() => expect(ingestChats).toHaveBeenCalledTimes(1), {
      timeout: 5000,
    })
    expect(texts()[0]).toContain('Загружаю переписку')

    await settlesWithin(
      bot.handleUpdate(press('tgp:no:abc123abc123:secret') as any),
      2000
    )
    expect(cancelProposal).toHaveBeenCalledTimes(1)
    expect(texts().some(t => t.includes('Готово'))).toBe(false)

    ingests[0]({ people: 3, messages_new: 7 })
    expect((await agentLanes.drain(5000)).unfinished).toEqual([])
    expect(texts().at(-1)).toContain('Готово: 3 людей, 7 новых сообщений')
    expect(errors).toEqual([])
  })

  it('a prepare cut off by shutdown tells the owner, with the button to run it again', async () => {
    const { bot } = boot()
    await bot.handleUpdate(press('crm:prep:900000084') as any)
    await vi.waitFor(() => expect(sweeps).toHaveLength(1), { timeout: 5000 })

    const { unfinished } = await agentLanes.drain(200)
    expect(unfinished).toEqual([`crm:${OWNER}`])
    sink = []
    expect(await laneNotices.sendShutdownNotices(unfinished)).toBe(1)
    const told = sink.filter(s => s.method === 'sendMessage')
    expect(told).toHaveLength(1)
    expect(told[0].payload.chat_id).toBe(OWNER)
    expect(String(told[0].payload.text)).toContain('перезапускался') // cyrillic-ok: matches UI text
    const buttons = (told[0].payload.reply_markup?.inline_keyboard ?? [])
      .flat()
      .map((b: any) => b.callback_data)
    expect(buttons).toContain('crm:prep:900000084')

    // Finished after all: the notice is let go.
    sweeps[0].done({ did: 'idle', why: 'никого' })
    expect((await agentLanes.drain(5000)).unfinished).toEqual([])
    expect(laneNotices.heldNoticeCount()).toBe(0)
  })
})
