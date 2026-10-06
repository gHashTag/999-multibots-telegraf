import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Every reading tool closes its connection -- on success and on failure -- and
 * a client with a session of their own reads their own account.
 *
 * Measured 2026-09-08: the five readers opened a TelegramClient and never
 * closed it. `client()` builds a NEW client per call (the price of per-caller
 * sessions), so each tg_dialogs left a socket behind. A busy CRM hour meant
 * hundreds of open MTProto connections on the render service.
 *
 * The network is faked at the module boundary: `client()` imports 'telegram'
 * dynamically, and vi.mock reaches dynamic imports too. What is real is
 * everything from the handler down to the hang-up.
 */
const counts = { connect: 0, disconnect: 0 }
let telegramFails = false
let authorized = true
/** What the login probe (updates.GetState) throws, when it throws at all. */
let probeFails: Error | null = null
let clientOpts: Record<string, unknown> = {}

/** Shaped like a gramjs RPCError: the bare code lives in errorMessage. */
function rpcError(code: number, text: string): Error {
  const e = new Error(`${code}: ${text} (caused by updates.GetState)`)
  return Object.assign(e, { code, errorMessage: text })
}

vi.mock('telegram', () => {
  class GetState {}
  class TelegramClient {
    constructor(...args: unknown[]) {
      clientOpts = (args[3] as Record<string, unknown>) ?? {}
    }
    async connect() {
      counts.connect++
    }
    async disconnect() {
      counts.disconnect++
    }
    async getDialogs() {
      if (telegramFails) throw new Error('FLOOD_WAIT_30')
      return []
    }
    async getMessages() {
      if (telegramFails) throw new Error('FLOOD_WAIT_30')
      return []
    }
    async invoke(req: unknown) {
      if (req instanceof GetState) {
        if (!authorized) throw rpcError(401, 'AUTH_KEY_UNREGISTERED')
        if (probeFails) throw probeFails
        return {}
      }
      if (telegramFails) throw new Error('FLOOD_WAIT_30')
      return { users: [] }
    }
  }
  class GetContacts {
    constructor(_a: unknown) {}
  }
  return {
    TelegramClient,
    Api: { contacts: { GetContacts }, updates: { GetState } },
  }
})
vi.mock('telegram/sessions', () => ({
  StringSession: class {
    constructor(_s: string) {}
  },
}))

import { TELEGRAM_TOOLS } from './src/agent/telegram-tools'

const READING = [
  'tg_dialogs',
  'tg_unanswered',
  'tg_history',
  'tg_search',
  'tg_contacts',
]
const OWNER = '144022504'
const CLIENT = '987654321'

/** A tg_sessions table with exactly one row: the client's own. */
const asked: unknown[][] = []
const table = {
  query: async (_sql: string, params?: unknown[]) => {
    asked.push(params ?? [])
    return params?.[0] === CLIENT
      ? { rows: [{ session: 'client-own' }] }
      : { rows: [] }
  },
}
const args = { chat: '777000', limit: 5, query: 'x' }

describe('читающие инструменты закрывают соединение', () => {
  const prev = {
    s: process.env.TELEGRAM_SESSION_STRING,
    i: process.env.TELEGRAM_API_ID,
    h: process.env.TELEGRAM_API_HASH,
  }
  beforeEach(() => {
    process.env.TELEGRAM_API_ID = '1'
    process.env.TELEGRAM_API_HASH = 'h'
    process.env.TELEGRAM_SESSION_STRING = 'owner-env'
    counts.connect = 0
    counts.disconnect = 0
    asked.length = 0
    telegramFails = false
    authorized = true
    probeFails = null
    clientOpts = {}
  })
  afterEach(() => {
    process.env.TELEGRAM_SESSION_STRING = prev.s
    process.env.TELEGRAM_API_ID = prev.i
    process.env.TELEGRAM_API_HASH = prev.h
  })

  for (const name of READING) {
    const tool = () => TELEGRAM_TOOLS.find(t => t.name === name)!

    it(`${name}: клиент со своей сессией читает и вешает трубку`, async () => {
      await expect(
        tool().handler(args, { telegramId: CLIENT, pool: table } as never)
      ).resolves.toBeTruthy()
      expect(counts.connect).toBe(1)
      expect(counts.disconnect, 'соединение осталось открытым').toBe(1)
      // The row was looked up by the client's id, never the owner's.
      expect(asked.flat()).toContain(CLIENT)
      expect(asked.flat()).not.toContain(OWNER)
    })

    it(`${name}: ошибка Telegram доходит до вызывающего, а сокет всё равно закрыт`, async () => {
      // The real failure survives the hang-up: a broken disconnect must not
      // replace FLOOD_WAIT with something about sockets, and a clean one must
      // not swallow it.
      telegramFails = true
      await expect(
        tool().handler(args, { telegramId: CLIENT, pool: table } as never)
      ).rejects.toThrow('FLOOD_WAIT_30')
      expect(counts.disconnect, 'после ошибки соединение не закрыли').toBe(1)
    })
  }

  it('истёкшая сессия клиента: его отправляют в приложение, а не к CLI владельца', async () => {
    // Two audiences, two fixes. Only the env string is the owner's; a row in
    // tg_sessions belongs to someone who can reconnect in the app in a minute
    // and cannot run anything at the owner's terminal.
    authorized = false
    const tool = TELEGRAM_TOOLS.find(t => t.name === 'tg_dialogs')!
    const msg = await tool
      .handler(args, { telegramId: CLIENT, pool: table } as never)
      .then(
        () => '',
        (e: Error) => e.message
      )
    expect(msg).toContain('в приложении')
    expect(msg).not.toContain('telegram-session-login')
    expect(counts.disconnect, 'мёртвую сессию не закрыли').toBe(1)
  })

  it('истёкшая сессия владельца: инструкция про разовый вход в CLI', async () => {
    authorized = false
    const tool = TELEGRAM_TOOLS.find(t => t.name === 'tg_dialogs')!
    const msg = await tool
      .handler(args, { telegramId: OWNER, pool: table } as never)
      .then(
        () => '',
        (e: Error) => e.message
      )
    expect(msg).toContain('telegram-session-login')
  })

  it('a network blip on the login probe is not an expired session', async () => {
    // checkAuthorization() answered false on ANY error, so a timeout sent
    // the owner to log in again for nothing. Now only a dead-login code does.
    probeFails = new Error('TIMEOUT')
    const tool = TELEGRAM_TOOLS.find(t => t.name === 'tg_dialogs')!
    const msg = await tool
      .handler(args, { telegramId: OWNER, pool: table } as never)
      .then(
        () => '',
        (e: Error) => e.message
      )
    expect(msg).toContain('временно')
    expect(msg).toContain('TIMEOUT')
    expect(msg).not.toContain('истекла')
    expect(msg).not.toContain('telegram-session-login')
    expect(counts.disconnect, 'the failed probe left the socket open').toBe(1)
  })

  for (const code of [
    'SESSION_REVOKED',
    'AUTH_KEY_DUPLICATED',
    'USER_DEACTIVATED_BAN',
  ]) {
    it(`${code} on the probe keeps the expired-session answer`, async () => {
      probeFails = rpcError(401, code)
      const tool = TELEGRAM_TOOLS.find(t => t.name === 'tg_dialogs')!
      const msg = await tool
        .handler(args, { telegramId: CLIENT, pool: table } as never)
        .then(
          () => '',
          (e: Error) => e.message
        )
      expect(msg).toContain('истекла или отозвана')
      expect(counts.disconnect).toBe(1)
    })
  }

  it('gramjs may not sleep through a long flood wait inside a press', async () => {
    const tool = TELEGRAM_TOOLS.find(t => t.name === 'tg_dialogs')!
    await tool.handler(args, { telegramId: CLIENT, pool: table } as never)
    expect(clientOpts.floodSleepThreshold).toBe(5)
  })

  it('десять вызовов — десять закрытий, ни одного лишнего сокета', async () => {
    const tool = TELEGRAM_TOOLS.find(t => t.name === 'tg_dialogs')!
    for (let i = 0; i < 10; i++) {
      await tool.handler(args, { telegramId: CLIENT, pool: table } as never)
    }
    expect(counts.connect).toBe(10)
    expect(counts.disconnect).toBe(10)
  })

  it('чужой без своей строки не открывает НИЧЕГО: строка владельца ему не достаётся', async () => {
    // Stronger than the error text: with the network faked, a fallback to the
    // env string would show up as a connect. There must be none.
    const tool = TELEGRAM_TOOLS.find(t => t.name === 'tg_dialogs')!
    await expect(
      tool.handler(args, { telegramId: '555000111', pool: table } as never)
    ).rejects.toThrow('не подключён')
    expect(counts.connect, 'для чужого открыли соединение').toBe(0)
  })
})
