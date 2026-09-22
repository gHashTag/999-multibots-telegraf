/**
 * WHEN A CLIENT ASKS THE ASSISTANT TO STOP, IT STOPS -- DURABLY, VISIBLY.
 *
 * Measured 2026-09-22: the owner's closest clients were worn out by the
 * assistant answering as him in his Business DMs, and one of them asked for it
 * to be switched off. Nothing heard that, and the only silence the code knew
 * was the owner's own 30-minute takeover in process memory.
 *
 * Pinned here, through the real business path (handleBusinessMessage and the
 * middleware's press handler), against a double of `assistant_opt_outs` that
 * reads the SQL it is given (optOutDouble.ts):
 *
 *  - the stop is not answered by the agent; the client gets ONE line in their
 *    language through the same connection, the owner ONE notice with the
 *    client's name and the two buttons;
 *  - afterwards nothing the client writes is answered, but the owner still
 *    hears of it;
 *  - a second "stop" sends nothing new;
 *  - it survives a restart (fresh modules, empty memory, same database);
 *  - a reply already being written stops before its next chunk;
 *  - only the owner's press turns it back on -- not a stranger's press;
 *  - a silent owner's client gets no line, and the owner is told so;
 *  - a database that does not answer still stops the assistant in this
 *    process, and the owner is told it was not stored.
 *
 * Ids are invented (9000000xx); the names are placeholders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { optOutDouble } from './optOutDouble'

const OWNER = 900000071
const CUSTOMER = 900000072
const CONN = 'conn-client-stop'
const BOT = 'client_stop_test_bot'

process.env.ADMIN_IDS = String(OWNER)

interface Ask {
  text: string
  answer: (t: string) => void
}
const asks: Ask[] = []
/** When set, the agent waits for the test to answer (a turn in flight). */
let holdTheAgent = false

vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(async () => 'fallback reply'),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))
vi.mock('@/services/trinityAgent', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  /* cyrillic-ok */ спроситьАгента: (_chatId: string, text: string) =>
    new Promise(resolve => {
      const ask: Ask = {
        text,
        answer: t => resolve({ текст: t }), // cyrillic-ok: pre-existing field
      }
      asks.push(ask)
      if (!holdTheAgent) ask.answer('agent reply to: ' + text)
    }),
  recordTurns: vi.fn(async () => undefined),
  fetchHistory: vi.fn(async () => []),
}))
vi.mock('@/services/modelSwitch', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mirrorDm: vi.fn(async () => ({ ok: true })),
  ingestChats: vi.fn(async () => ({})),
}))

const connection = () => ({
  id: CONN,
  user: { id: OWNER, first_name: 'Owner' },
  user_chat_id: OWNER,
  date: 1,
  is_enabled: true,
  rights: { can_reply: true },
})

let nextId = 100
const fromCustomer = (text: string) => ({
  message_id: nextId++,
  date: Math.floor(Date.now() / 1000),
  chat: {
    id: CUSTOMER,
    first_name: 'Placeholder',
    last_name: 'Client',
    username: 'placeholder_client',
    type: 'private',
  },
  from: { id: CUSTOMER, first_name: 'Placeholder' },
  text,
  business_connection_id: CONN,
})

const toCustomer = (bot: any) =>
  bot.telegram.sendMessage.mock.calls.filter(
    (c: any[]) => c[2] && c[2].business_connection_id === CONN
  )
const toOwner = (bot: any) =>
  bot.telegram.sendMessage.mock.calls.filter(
    (c: any[]) => c[0] === OWNER && !(c[2] && c[2].business_connection_id)
  )
const stopNotices = (bot: any) =>
  toOwner(bot).filter((c: any[]) =>
    String(c[1]).includes('попросил(а) выключить автоответы')
  )

function fakeBot() {
  return {
    botInfo: { username: BOT },
    telegram: {
      sendMessage: vi.fn(async () => ({ message_id: 1 })),
      sendChatAction: vi.fn(async () => true),
      callApi: vi.fn(async () => connection()),
    },
  }
}

/** A process: fresh modules, empty memory, the given database. */
async function boot(db: ReturnType<typeof optOutDouble> | null) {
  vi.resetModules()
  const store = await import('@/services/assistantOptOut')
  store.setOptOutDbForTests(db as never)
  store.forgetOptOutMemoryForTests()
  const svc = await import('@/services/businessBotService')
  svc.handleBusinessConnection(connection() as any)
  const menu = await import('@/navigation/handlers/clientStopActions')
  const clientStop = await import('@/services/clientStop')
  return { svc, store, menu, clientStop }
}

/** Say something as the customer and wait for everything it set off. */
async function say(
  p: Awaited<ReturnType<typeof boot>>,
  bot: any,
  text: string
): Promise<void> {
  await p.svc.handleBusinessMessage(fromCustomer(text) as any, bot, BOT)
  await p.svc.clientStopsSettled()
}

/** The owner's press on a button of the notice. */
function press(data: string, from = OWNER) {
  return {
    chat: { type: 'private', id: from },
    from: { id: from },
    callbackQuery: { data },
    answerCbQuery: vi.fn(async () => true),
    editMessageReplyMarkup: vi.fn(async () => true),
    reply: vi.fn(async () => ({ message_id: 2 })),
  }
}

beforeEach(() => {
  asks.length = 0
  holdTheAgent = false
  delete process.env.CLIENT_STOP_SILENT_OWNERS
  delete process.env.TOKENS_DATABASE_URL
  delete process.env.RENDER_DATABASE_URL
})

describe('the client says stop', () => {
  it('control: an ordinary message is answered by the agent', async () => {
    const p = await boot(optOutDouble())
    const bot = fakeBot()
    await say(p, bot, 'How much is a portrait?')
    expect(asks).toHaveLength(1)
    expect(toCustomer(bot)).toHaveLength(1)
  })

  it('is not answered by the agent, gets one line, and the owner one notice', async () => {
    const db = optOutDouble()
    const p = await boot(db)
    const bot = fakeBot()

    await say(p, bot, 'Выключите бота, пожалуйста')

    expect(asks, 'the agent was asked to answer "stop the bot"').toHaveLength(0)
    const acks = toCustomer(bot)
    expect(acks).toHaveLength(1)
    expect(acks[0][0]).toBe(CUSTOMER)
    expect(acks[0][1]).toBe(p.clientStop.STOP_ACK.ru)
    expect(
      acks[0][2].reply_markup,
      'the ack carries no buttons'
    ).toBeUndefined()

    const notices = stopNotices(bot)
    expect(notices).toHaveLength(1)
    const [, text, extra] = notices[0]
    expect(text).toContain('Placeholder Client (@placeholder_client)')
    expect(text).toContain(p.clientStop.STOP_ACK.ru)
    const buttons = JSON.stringify(extra.reply_markup.inline_keyboard)
    expect(buttons).toContain(`cso:keep:${CUSTOMER}`)
    expect(buttons).toContain(`cso:on:${CUSTOMER}`)

    const row = db.rows.get(`${OWNER}:${CUSTOMER}`)!
    expect(row.active).toBe(true)
    expect(row.owner_told_at).not.toBeNull()
    expect(row.client_told_at).not.toBeNull()
  })

  it('answers an English stop in English', async () => {
    const p = await boot(optOutDouble())
    const bot = fakeBot()
    await say(p, bot, 'no more automatic replies please')
    expect(toCustomer(bot).map((c: any[]) => c[1])).toEqual([
      p.clientStop.STOP_ACK.en,
    ])
  })

  it('then answers nothing the client writes, while the owner still hears of it', async () => {
    const p = await boot(optOutDouble())
    const bot = fakeBot()
    await say(p, bot, 'хватит, пусть пишет сам')
    const before = toCustomer(bot).length

    await say(p, bot, 'How much is a portrait?')

    expect(asks).toHaveLength(0)
    expect(toCustomer(bot)).toHaveLength(before)
    const lead = toOwner(bot).find((c: any[]) =>
      String(c[1]).includes('Этот клиент попросил выключить автоответы')
    )
    expect(lead, 'the owner lost sight of the message').toBeTruthy()
    expect(JSON.stringify(lead[2].reply_markup)).toContain(`cso:on:${CUSTOMER}`)
  })

  it('a second stop sends nothing new to either side', async () => {
    const p = await boot(optOutDouble())
    const bot = fakeBot()
    await say(p, bot, 'stop the bot')
    await say(p, bot, 'STOP')
    await say(p, bot, 'I said stop the bot')

    expect(toCustomer(bot)).toHaveLength(1)
    expect(stopNotices(bot)).toHaveLength(1)
  })

  it('survives a restart: new process, empty memory, same database', async () => {
    const db = optOutDouble()
    const first = await boot(db)
    await say(first, fakeBot(), 'отключите автоответчик')

    const second = await boot(db)
    expect(
      second.store.stoppedHere(OWNER, CUSTOMER),
      'memory was not empty'
    ).toBe(false)
    const bot = fakeBot()
    await say(second, bot, 'How much is a portrait?')

    expect(asks).toHaveLength(0)
    expect(toCustomer(bot)).toHaveLength(0)
  })

  it('control for the restart: a new database has nothing to remember', async () => {
    const first = await boot(optOutDouble())
    await say(first, fakeBot(), 'отключите автоответчик')

    const second = await boot(optOutDouble())
    const bot = fakeBot()
    await say(second, bot, 'How much is a portrait?')
    expect(toCustomer(bot)).toHaveLength(1)
  })

  it('stops a reply that was being written before its next chunk', async () => {
    const p = await boot(optOutDouble())
    const bot = fakeBot()
    holdTheAgent = true

    const turn = p.svc.handleBusinessMessage(
      fromCustomer('Tell me about portraits') as any,
      bot as any,
      BOT
    )
    // Wait for the turn to reach the agent, then the client says stop.
    for (let i = 0; i < 100 && !asks.length; i++)
      await new Promise(r => setTimeout(r, 5))
    expect(asks).toHaveLength(1)
    await say(p, bot, 'выключите бота')
    asks[0].answer('A long answer about portraits that must not arrive.')
    await turn

    const texts = toCustomer(bot).map((c: any[]) => String(c[1]))
    expect(texts).toEqual([p.clientStop.STOP_ACK.ru])
  })
})

describe('only the client s own words switch it off', () => {
  it('a forwarded "stop the bot" is somebody else s words: answered as usual', async () => {
    const db = optOutDouble()
    const p = await boot(db)
    const bot = fakeBot()
    await p.svc.handleBusinessMessage(
      {
        ...fromCustomer('stop the bot'),
        forward_origin: { type: 'hidden_user', sender_user_name: 'Someone' },
      } as any,
      bot as any,
      BOT
    )
    await p.svc.clientStopsSettled()

    expect(db.rows.size, 'a forward switched the assistant off').toBe(0)
    expect(stopNotices(bot)).toHaveLength(0)
    expect(asks).toHaveLength(1)
  })

  it('a message whose sender is not the chat s person switches nothing off', async () => {
    const db = optOutDouble()
    const p = await boot(db)
    const bot = fakeBot()
    await p.svc.handleBusinessMessage(
      {
        ...fromCustomer('stop the bot'),
        from: { id: 900000078, first_name: 'Other' },
      } as any,
      bot as any,
      BOT
    )
    await p.svc.clientStopsSettled()

    expect(db.rows.size).toBe(0)
    expect(stopNotices(bot)).toHaveLength(0)
  })

  it('pure helper: only a private, unforwarded message from the chat s person', async () => {
    const p = await boot(optOutDouble())
    const own = fromCustomer('stop the bot') as any
    expect(p.svc.clientsOwnWords(own)).toBe(true)
    expect(p.svc.clientsOwnWords({ ...own, forward_origin: {} })).toBe(false)
    expect(
      p.svc.clientsOwnWords({ ...own, chat: { ...own.chat, type: 'group' } })
    ).toBe(false)
  })
})

describe('only the owner turns it back on', () => {
  it('the owner s press gives the chat back to the assistant', async () => {
    const db = optOutDouble()
    const p = await boot(db)
    const bot = fakeBot()
    await say(p, bot, 'stop the bot')

    const ctx = press(`cso:on:${CUSTOMER}`)
    await p.menu.handleClientStopPress(ctx)

    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(String(ctx.reply.mock.calls[0][0])).toContain('снова отвечает')
    expect(db.rows.get(`${OWNER}:${CUSTOMER}`)!.active).toBe(false)
    await say(p, bot, 'How much is a portrait?')
    expect(asks).toHaveLength(1)
  })

  it('a press by somebody else changes nothing', async () => {
    const db = optOutDouble()
    const p = await boot(db)
    const bot = fakeBot()
    await say(p, bot, 'stop the bot')

    await p.menu.handleClientStopPress(press(`cso:on:${CUSTOMER}`, 900000079))

    expect(db.rows.get(`${OWNER}:${CUSTOMER}`)!.active).toBe(true)
    await say(p, bot, 'How much is a portrait?')
    expect(asks).toHaveLength(0)
  })

  it('"keep it off" writes nothing and leaves the way back', async () => {
    const db = optOutDouble()
    const p = await boot(db)
    await say(p, fakeBot(), 'stop the bot')

    const ctx = press(`cso:keep:${CUSTOMER}`)
    await p.menu.handleClientStopPress(ctx)

    expect(db.rows.get(`${OWNER}:${CUSTOMER}`)!.active).toBe(true)
    const kept = JSON.stringify(ctx.editMessageReplyMarkup.mock.calls[0][0])
    expect(kept).toContain(`cso:on:${CUSTOMER}`)
    expect(kept).not.toContain('cso:keep')
  })

  it('a stop after a resume is a new episode, announced again', async () => {
    const p = await boot(optOutDouble())
    const bot = fakeBot()
    await say(p, bot, 'stop the bot')
    await p.menu.handleClientStopPress(press(`cso:on:${CUSTOMER}`))
    await say(p, bot, 'stop the bot')

    expect(stopNotices(bot)).toHaveLength(2)
  })
})

describe('the owner s settings and a database that does not answer', () => {
  it('a silent owner s client gets no line, and the owner is told so', async () => {
    process.env.CLIENT_STOP_SILENT_OWNERS = String(OWNER)
    const p = await boot(optOutDouble())
    const bot = fakeBot()
    await say(p, bot, 'stop the bot')

    expect(toCustomer(bot)).toHaveLength(0)
    expect(String(stopNotices(bot)[0][1])).toContain('тихий режим')
  })

  it('a database that is down still stops the assistant in this process', async () => {
    const db = optOutDouble()
    db.state.down = true
    const p = await boot(db)
    const bot = fakeBot()
    await say(p, bot, 'stop the bot')
    await say(p, bot, 'How much is a portrait?')

    expect(asks).toHaveLength(0)
    const notice = stopNotices(bot)
    expect(notice).toHaveLength(1)
    expect(String(notice[0][1])).toContain('В базу не записалось')
  })

  it('a stop the database missed is written once it answers again', async () => {
    const db = optOutDouble()
    db.state.down = true
    const p = await boot(db)
    await say(p, fakeBot(), 'stop the bot')
    db.state.down = false

    const reach = await p.store.assistantAllowed(OWNER, CUSTOMER, {
      whenUnknown: 'allow',
    })
    expect(reach.allowed).toBe(false)
    expect(db.rows.get(`${OWNER}:${CUSTOMER}`)?.active).toBe(true)
  })
})
