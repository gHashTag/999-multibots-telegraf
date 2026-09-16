/**
 * The language a business update resolves to, driven through the real chain.
 *
 * Production, 2026-09-16, two lines four and eight seconds either side of a
 * business DM from chat 435572800:
 *   09:30:22 [WARN]: [LanguageMiddleware] No telegram ID, using fallback {"fallbackLanguage":"en"}
 *   09:30:26 [WARN]: [Business] agent unreachable, falling back {"chatId":"435572800"}
 *   09:30:34 [WARN]: [LanguageMiddleware] No telegram ID, using fallback {"fallbackLanguage":"en"}
 *
 * Two causes, both fixed at the one choke point the middleware is:
 *
 * 1. telegraf 4.16.3 resolves NO sender for a business update. getUserFromAnySource
 *    (node_modules/telegraf/lib/context.js:1183) walks callback_query, ctx.msg,
 *    inline_query, shipping_query, pre_checkout_query, chosen_inline_result,
 *    chat_member, my_chat_member, chat_join_request, message_reaction,
 *    poll_answer and chat_boost, and getMessageFromAnySource (context.js:1177)
 *    builds ctx.msg from only message / edited_message / callback_query.message
 *    / channel_post / edited_channel_post. No business kind appears anywhere in
 *    that chain, so ctx.from AND ctx.chat are both undefined. The middleware
 *    read only ctx.from, so it had no id and no language code at all.
 *
 * 2. With no code, `isRussianLanguageCode(undefined)` is false, so the branch
 *    resolved to English unconditionally -- choosing the wrong answer by
 *    default for a Russian-speaking audience. The repo had already ruled on
 *    this: video-completion-language-not-hardcoded.test.ts says the language
 *    "defaults to Russian when the language is unknown".
 *
 * Driven, not textual: every case builds a real Telegram update object and
 * pushes it through a real Telegraf bot running the real sessionMiddleware and
 * the real languageMiddleware, then reads the value the next middleware in the
 * chain would actually see.
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
import { Telegraf } from 'telegraf'
import TransportStream from 'winston-transport'

const getUserLanguageFromDB = vi.fn(
  async (_id: string) => null as 'ru' | 'en' | null
)
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: (id: string) => getUserLanguageFromDB(id),
}))

const CUSTOMER = 435572800
const OWNER = 144022504
const CONN = 'conn-owner-1'

const businessMessage = (over: Record<string, any> = {}) => ({
  message_id: 7,
  date: 1,
  business_connection_id: CONN,
  chat: { id: CUSTOMER, first_name: 'Customer', type: 'private' },
  from: { id: CUSTOMER, is_bot: false, first_name: 'Customer' },
  text: 'Сколько стоит?',
  ...over,
})

const businessConnection = () => ({
  id: CONN,
  user: { id: OWNER, is_bot: false, first_name: 'Owner' },
  user_chat_id: OWNER,
  date: 1,
  is_enabled: true,
  rights: { can_reply: true },
})

const plainMessage = (languageCode?: string) => ({
  message_id: 9,
  date: 1,
  chat: { id: 9, type: 'private' },
  from: {
    id: 9,
    is_bot: false,
    first_name: 'Plain',
    language_code: languageCode,
  },
  text: 'hi',
})

const savedRedis = process.env.REDIS_URL
let sessionMiddleware: any
let languageMiddleware: any
let setUserLanguage: any

beforeAll(async () => {
  delete process.env.REDIS_URL
  ;({ sessionMiddleware } = await import('@/core/session/sessionStore'))
  ;({ languageMiddleware } = await import('@/middlewares/languageMiddleware'))
  ;({ setUserLanguage } = await import('@/helpers/language'))
}, 60_000)

afterAll(() => {
  if (savedRedis !== undefined) process.env.REDIS_URL = savedRedis
})

beforeEach(() => {
  getUserLanguageFromDB.mockReset()
  getUserLanguageFromDB.mockResolvedValue(null)
})

/**
 * The production ordering: session, then language, then everything
 * registerCommands adds (src/bot.ts:147 and :236, src/index.ts:267 vs :463).
 * The probe stands where the first of those handlers stands, so it reads
 * exactly the state a real handler would.
 */
async function resolveThrough(update: Record<string, any>) {
  const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  let seen: { language?: string; ran: boolean } = { ran: false }
  bot.use(sessionMiddleware())
  bot.use(languageMiddleware)
  bot.use(async (ctx: any) => {
    seen = { language: ctx.state?.userLanguage, ran: true }
  })
  ;(bot as any).botInfo = {
    id: 111,
    is_bot: true,
    username: 'neuro_blogger_bot',
    first_name: 'B',
  }
  await bot.handleUpdate(update as any)
  return seen
}

describe('business updates resolve a sender and a language', () => {
  it('a business DM with no language_code resolves the customer id and answers Russian, not English', async () => {
    // The production line. Before the fix telegraf gave no ctx.from, so the
    // database was never consulted at all and the answer was 'en'.
    getUserLanguageFromDB.mockResolvedValue('ru')

    const seen = await resolveThrough({
      update_id: 1,
      business_message: businessMessage(),
    })

    expect(getUserLanguageFromDB).toHaveBeenCalledWith(String(CUSTOMER))
    expect(seen.ran).toBe(true)
    expect(seen.language).toBe('ru')
  }, 30_000)

  it("control: a business customer whose stored language is 'en' still resolves English", async () => {
    // Proves the fix resolves the sender rather than hardcoding Russian: the
    // database remains the authority once it can actually be reached.
    getUserLanguageFromDB.mockResolvedValue('en')

    const seen = await resolveThrough({
      update_id: 2,
      business_message: businessMessage(),
    })

    expect(getUserLanguageFromDB).toHaveBeenCalledWith(String(CUSTOMER))
    expect(seen.language).toBe('en')
  }, 30_000)

  it('a business DM carrying no `from` falls back to the private chat id, which is the customer', async () => {
    // business_message.from is optional in the Bot API shape this repo already
    // models (services/businessBotService.ts). A business DM is a private chat,
    // so chat.id IS the user id -- but it carries no language_code, which is
    // exactly the missing signal that used to mean English.
    getUserLanguageFromDB.mockResolvedValue(null)

    const seen = await resolveThrough({
      update_id: 3,
      business_message: businessMessage({ from: undefined }),
    })

    expect(getUserLanguageFromDB).toHaveBeenCalledWith(String(CUSTOMER))
    expect(seen.language).toBe('ru')
  }, 30_000)

  it('an edited business message resolves its own sender', async () => {
    getUserLanguageFromDB.mockResolvedValue('ru')

    const seen = await resolveThrough({
      update_id: 4,
      edited_business_message: businessMessage({ message_id: 8 }),
    })

    expect(getUserLanguageFromDB).toHaveBeenCalledWith(String(CUSTOMER))
    expect(seen.language).toBe('ru')
  }, 30_000)

  it('a business_connection resolves the OWNER who linked the bot, not a customer', async () => {
    // handleBusinessMessage compares `msg.from?.id === conn.userId` precisely
    // to tell the owner apart from a customer, so this update names the owner
    // and nobody else.
    getUserLanguageFromDB.mockResolvedValue('ru')

    const seen = await resolveThrough({
      update_id: 5,
      business_connection: businessConnection(),
    })

    expect(getUserLanguageFromDB).toHaveBeenCalledWith(String(OWNER))
    expect(getUserLanguageFromDB).not.toHaveBeenCalledWith(String(CUSTOMER))
    expect(seen.language).toBe('ru')
  }, 30_000)
})

describe('the ordinary paths are unchanged', () => {
  it('control: a plain message is still resolved exactly as before', async () => {
    getUserLanguageFromDB.mockResolvedValue('ru')

    const seen = await resolveThrough({
      update_id: 6,
      message: plainMessage('ru'),
    })

    expect(getUserLanguageFromDB).toHaveBeenCalledWith('9')
    expect(seen.language).toBe('ru')
  }, 30_000)

  it('control: a PRESENT non-Russian language code still resolves English', async () => {
    // The half of the rule that did NOT move. A signal that exists and says
    // English is a real answer; only a MISSING signal changed meaning.
    getUserLanguageFromDB.mockResolvedValue(null)

    const seen = await resolveThrough({
      update_id: 7,
      message: plainMessage('en-US'),
    })

    expect(seen.language).toBe('en')
  }, 30_000)

  it('control: a regional Russian tag still resolves Russian', async () => {
    getUserLanguageFromDB.mockResolvedValue(null)

    const seen = await resolveThrough({
      update_id: 8,
      message: plainMessage('ru-KZ'),
    })

    expect(seen.language).toBe('ru')
  }, 30_000)
})

/**
 * House rule 2. Resolving the sender makes two log branches fire less often.
 * Neither is being suppressed -- they stop firing because they stopped being
 * true -- but the things that must still be loud are pinned here anyway.
 */
class CaptureTransport extends TransportStream {
  public records: Array<{ level: string; message: string }> = []
  log(info: any, next: () => void) {
    this.records.push({
      level: info.level,
      message: String(info.message || ''),
    })
    next()
  }
}

describe('what must still be loud is still loud', () => {
  it('an update that identifies NOBODY still logs at error level', async () => {
    // setUserLanguage now resolves a business sender, so its "No telegram ID"
    // error no longer fires for an update whose sender telegraf simply could
    // not see. An update that genuinely names nobody is still our machinery
    // failing to do what it was asked, and must still reach the owner.
    //
    // Asserted at the TRANSPORT boundary on the real winston logger, with the
    // same predicate the Telegram transport uses (utils/logger.ts: `if
    // (info.level === 'error' && !isOwnLog)`, and the transport itself is
    // constructed with `{ level: 'error' }`). A record at level 'error' here is
    // a record that would be pushed to the owner's group.
    const { logger } = await import('@/utils/logger')
    const capture = new CaptureTransport({ level: 'silly' })
    logger.add(capture)
    try {
      const anonymous = {
        update: { poll: { id: 'p1' } },
        from: undefined,
      } as any
      const result = await setUserLanguage(anonymous, 'ru')

      expect(result).toBe(false)
      const errors = capture.records.filter(r => r.level === 'error')
      expect(
        errors.some(r =>
          r.message.includes('[setUserLanguage] No telegram ID')
        ),
        'a phone must still ring when nobody can be identified'
      ).toBe(true)
    } finally {
      logger.remove(capture)
    }
  }, 30_000)

  it('negative half: a business update produces NO error-level record', async () => {
    // The same call on an update whose sender telegraf could not resolve but
    // this repo now can. It must succeed quietly rather than page anybody --
    // a customer writing a business DM is not our machinery failing.
    const { logger } = await import('@/utils/logger')
    const capture = new CaptureTransport({ level: 'silly' })
    logger.add(capture)
    try {
      const ctx = { update: { business_message: businessMessage() } } as any
      await setUserLanguage(ctx, 'ru')

      const errors = capture.records.filter(
        r =>
          r.level === 'error' &&
          r.message.includes('[setUserLanguage] No telegram ID')
      )
      expect(errors).toEqual([])
    } finally {
      logger.remove(capture)
    }
  }, 30_000)

  it('a genuinely anonymous update still WARNS about the fallback, and defaults to Russian', async () => {
    // The production WARN is not deleted. It stops firing for business updates
    // because it stopped being true there; for an update that really carries no
    // sender it still fires -- and now resolves Russian rather than English.
    const { logger } = await import('@/utils/logger')
    const capture = new CaptureTransport({ level: 'silly' })
    logger.add(capture)
    try {
      const seen = await resolveThrough({
        update_id: 9,
        poll: { id: 'p1', question: 'q', options: [], is_closed: false },
      })

      expect(getUserLanguageFromDB).not.toHaveBeenCalled()
      expect(seen.language).toBe('ru')
      const warns = capture.records.filter(
        r =>
          r.level === 'warn' &&
          r.message.includes('[LanguageMiddleware] No telegram ID')
      )
      expect(warns.length).toBeGreaterThan(0)
    } finally {
      logger.remove(capture)
    }
  }, 30_000)
})
