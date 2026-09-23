/**
 * /vip ON A BOOTED BOT.
 *
 * The command shows the person's club state and a button; nothing reaches the
 * render until the press, only an admin may ask, only the asker may press,
 * and every shape the cashier answers with comes back as text the owner can
 * read. The render call is faked; the Telegraf plumbing is real.
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
/** An admin who did NOT type the command: may pass isAdmin, may not press. */
const OTHER_ADMIN = 424243
const STRANGER = 777
const MEMBER = '6716532024'
process.env.ADMIN_IDS = `${ADMIN},${OTHER_ADMIN}`

let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi
let setup: typeof import('@/commands/vipCommand')
let ClubUnavailableError: typeof import('@/services/clubCash').ClubUnavailableError

beforeAll(async () => {
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    return { message_id: 1, date: 0, chat: { id: ADMIN, type: 'private' } }
  }
  setup = await import('@/commands/vipCommand')
  ;({ ClubUnavailableError } = await import('@/services/clubCash'))
})
afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
})
beforeEach(() => {
  sink = []
  setup.resetVipPendingForTests()
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
      text: 'VIP',
    },
  },
})

const STATUS = {
  active: false,
  granted: null,
  until: null,
  daysLeft: 0,
  stars: 10000,
  periodDays: 30,
  tokensPerPeriod: 2571,
  guestEnded: null,
}

const okMonth = {
  ok: true as const,
  recorded: 'now' as const,
  telegram_id: MEMBER,
  start: '2026-09-23T00:00:00.000Z',
  until: '2026-10-23T00:00:00.000Z',
  tokens: 2571,
  credited: true,
}

function boot(recorder: ReturnType<typeof vi.fn>) {
  const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  ;(bot as any).botInfo = {
    id: 111,
    is_bot: true,
    username: 'vip',
    first_name: 'p',
  }
  const errors: string[] = []
  bot.catch((e: any) => {
    errors.push(String((e && e.message) || e))
  })
  const statusOf = vi.fn(async () => STATUS)
  setup.setupVipCommand(bot as any, recorder as any, statusOf as any)
  return { bot, errors }
}

const sent = () => sink.filter(s => s.method === 'sendMessage')
const edits = () => sink.filter(s => s.method === 'editMessageText')

/** The go-button callback data of the last card shown. */
function goAction(): string {
  const card = sent().at(-1)
  const data =
    card?.payload?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data
  expect(typeof data).toBe('string')
  expect(data as string).toMatch(/^vip:go:/)
  return data as string
}

describe('/vip', () => {
  it('refuses a stranger before anything is sent anywhere', async () => {
    const recorder = vi.fn(async () => okMonth)
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command('/vip ' + MEMBER, STRANGER) as any)
    expect(errors).toEqual([])
    expect(recorder).not.toHaveBeenCalled()
    expect(sent().at(-1)?.payload.text).toContain('нет доступа')
  })

  it('shows usage for a bare or malformed command', async () => {
    const recorder = vi.fn(async () => okMonth)
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command('/vip') as any)
    await bot.handleUpdate(command('/vip abc') as any)
    expect(errors).toEqual([])
    expect(recorder).not.toHaveBeenCalled()
    for (const s of sent())
      expect(s.payload.text).toContain('Как выдать VIP-месяц')
  })

  it('refuses a day it cannot read, naming the format', async () => {
    const recorder = vi.fn(async () => okMonth)
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command(`/vip ${MEMBER} 23.09.2026`) as any)
    expect(errors).toEqual([])
    expect(recorder).not.toHaveBeenCalled()
    expect(sent().at(-1)?.payload.text).toContain('ГГГГ-ММ-ДД')
  })

  it('shows the member state and a confirm button; the render is not asked yet', async () => {
    const recorder = vi.fn(async () => okMonth)
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command('/vip ' + MEMBER) as any)
    expect(errors).toEqual([])
    expect(recorder).not.toHaveBeenCalled()
    const text = sent().at(-1)?.payload.text as string
    expect(text).toContain(MEMBER)
    expect(text).toContain('2571')
    expect(text).toContain('Клуба сейчас нет')
    goAction()
  })

  it('writes the month on the press, in the presser’s name', async () => {
    const recorder = vi.fn(async () => okMonth)
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command('/vip ' + MEMBER) as any)
    await bot.handleUpdate(press(goAction()) as any)
    expect(errors).toEqual([])
    expect(recorder).toHaveBeenCalledTimes(1)
    expect(recorder).toHaveBeenCalledWith(String(ADMIN), MEMBER, {
      start: undefined,
      byHand: false,
    })
    const text = edits().at(-1)?.payload.text as string
    expect(text).toContain('Месяц клуба записан')
    expect(text).toContain('2026-10-23')
    expect(text).toContain('2571')
  })

  it('carries the start day and the «вручную» word to the tool arguments', async () => {
    const recorder = vi.fn(async () => okMonth)
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command(`/vip ${MEMBER} 2026-09-25 вручную`) as any)
    expect(sent().at(-1)?.payload.text).toContain('вручную')
    await bot.handleUpdate(press(goAction()) as any)
    expect(errors).toEqual([])
    expect(recorder).toHaveBeenCalledWith(String(ADMIN), MEMBER, {
      start: '2026-09-25',
      byHand: true,
    })
  })

  it('a second press of the same card is not a new command', async () => {
    const recorder = vi.fn(async () => okMonth)
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command('/vip ' + MEMBER) as any)
    const go = goAction()
    await bot.handleUpdate(press(go) as any)
    await bot.handleUpdate(press(go) as any)
    expect(errors).toEqual([])
    expect(recorder).toHaveBeenCalledTimes(1)
    expect(edits().at(-1)?.payload.text).toContain('устарело')
  })

  it('an admin who did not type the command cannot press it', async () => {
    const recorder = vi.fn(async () => okMonth)
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command('/vip ' + MEMBER, ADMIN) as any)
    await bot.handleUpdate(press(goAction(), OTHER_ADMIN) as any)
    expect(errors).toEqual([])
    expect(recorder).not.toHaveBeenCalled()
    expect(sent().at(-1)?.payload.text).toContain('Нажать может только тот')
  })

  it('an overlap comes back with the day the next month may start', async () => {
    const recorder = vi.fn(async () => ({
      ok: false as const,
      error: 'оплаченный месяц ещё идёт',
      next_start: '2026-10-24',
    }))
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command('/vip ' + MEMBER) as any)
    await bot.handleUpdate(press(goAction()) as any)
    expect(errors).toEqual([])
    const text = edits().at(-1)?.payload.text as string
    expect(text).toContain('оплаченный месяц ещё идёт')
    expect(text).toContain('2026-10-24')
  })

  it('hand-given tokens come back as a question with the «вручную» hint', async () => {
    const recorder = vi.fn(async () => ({
      ok: false as const,
      error: 'токены этого месяца, возможно, уже выданы вручную',
      tokens_given_by_hand: [
        {
          ref: 'cash-club-2026-09-22-6716532024',
          tokens: 2571,
          at: '2026-09-22T10:00:00Z',
        },
      ],
    }))
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command('/vip ' + MEMBER) as any)
    await bot.handleUpdate(press(goAction()) as any)
    expect(errors).toEqual([])
    const text = edits().at(-1)?.payload.text as string
    expect(text).toContain('cash-club-2026-09-22-6716532024')
    expect(text).toContain('вручную')
  })

  it('a dead cashier is said plainly, not as a stack trace', async () => {
    const recorder = vi.fn(async () => {
      throw new ClubUnavailableError('/mcp: 502, not JSON')
    })
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command('/vip ' + MEMBER) as any)
    await bot.handleUpdate(press(goAction()) as any)
    expect(errors).toEqual([])
    expect(edits().at(-1)?.payload.text).toContain('Кассир клуба недоступен')
    expect(edits().at(-1)?.payload.text).toContain('/mcp: 502')
  })

  it('cancel answers and edits the card away', async () => {
    const recorder = vi.fn(async () => okMonth)
    const { bot, errors } = boot(recorder)
    await bot.handleUpdate(command('/vip ' + MEMBER) as any)
    await bot.handleUpdate(press('vip:cancel') as any)
    expect(errors).toEqual([])
    expect(recorder).not.toHaveBeenCalled()
    expect(edits().at(-1)?.payload.text).toContain('Отменено')
  })
})
