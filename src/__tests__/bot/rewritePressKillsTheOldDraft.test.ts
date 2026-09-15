import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Telegraf, Telegram, session } from 'telegraf'

/**
 * A REWRITE THAT LEAVES THE OLD WORDS SENDABLE IS WORSE THAN NO REWRITE.
 *
 * The press has to do three things in one go: cancel the draft the person just
 * refused, keep the sweep from walking on to the next human being, and start a
 * new turn for the same one. Get the order wrong and there are two sendable
 * drafts for one person -- with the first card still scrolled up in the chat,
 * its live secret in its buttons.
 *
 * Reasoning says the handler does this. Reasoning is not a check: this drives a
 * real Telegraf with the real registration, and looks at what left the process.
 */

// secret-guard-ok: invented for this test, in the shape the generator produces
const SECRET = '0'.repeat(24) + 'deadbeef'
const ID = '0f3a91cc42de'
const OWNER = 144022504
const LEAD = '900000001'

const realCallApi = (Telegram.prototype as any).callApi

function press(data: string, from = OWNER, chatType = 'private') {
  return {
    update_id: 1,
    callback_query: {
      id: 'cb1',
      from: { id: from, is_bot: false, first_name: 'o' },
      chat_instance: 'ci',
      data,
      message: {
        message_id: 5,
        date: 0,
        chat: { id: from, type: chatType },
      },
    },
  }
}

describe('the rewrite press', () => {
  let sink: Array<{ method: string; payload: any }> = []
  let calls: Array<{ url: string; body: string }> = []

  beforeEach(() => {
    sink = []
    calls = []
    vi.resetModules()
    // The gate is `ADMIN_IDS_ARRAY`, parsed once at import. Set it before the
    // module graph is built, or the owner is a stranger to their own bot.
    process.env.ADMIN_IDS = String(OWNER)
    process.env.RENDER_API_KEY = 'test-key'
    ;(Telegram.prototype as any).callApi = async (
      method: string,
      payload: any
    ) => {
      sink.push({ method, payload })
      return method === 'sendMessage' ? { message_id: 6 } : true
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        calls.push({ url: String(url), body: String(init?.body ?? '') })
        return { ok: true, status: 200, json: async () => ({ ok: true }) }
      })
    )
  })

  afterEach(() => {
    ;(Telegram.prototype as any).callApi = realCallApi
    vi.unstubAllGlobals()
  })

  const botWithRealHandlers = async () => {
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
    const { registerProposalButtons } = await import(
      '@/navigation/registerCommands'
    )
    registerProposalButtons(bot as never)
    return { bot, errors }
  }

  const remember = async () => {
    const m = await import('@/services/telegramProposals')
    m.forgetCardLeadsForTests()
    m.rememberCard({
      id: ID,
      target: LEAD,
      what: 'Здравствуйте! Стоимость — 5000 рублей, и вот что входит.',
    })
    return m
  }

  const said = () =>
    sink
      .filter(s => s.method === 'sendMessage')
      .map(s => String(s.payload?.text ?? ''))
      .join(' | ')

  it('cancels the refused draft before it writes anything new', async () => {
    await remember()
    const { bot, errors } = await botWithRealHandlers()
    await bot.handleUpdate(press(`tgp:re:short:${ID}:${SECRET}`) as never)

    expect(errors).toEqual([])
    const cancel = calls.find(c => c.url.includes('/api/tg/proposal/cancel'))
    expect(cancel, 'the old draft was left sendable').toBeTruthy()
    expect(JSON.parse(cancel!.body)).toEqual({ id: ID, secret: SECRET })
    // The only route it may touch is the cancel one. Confirming would send the
    // very words the person just refused.
    expect(
      calls.filter(c => c.url.includes('/proposal/confirm')),
      'a rewrite press sent the draft'
    ).toHaveLength(0)
  })

  it('answers the press, and takes the buttons away', async () => {
    await remember()
    const { bot } = await botWithRealHandlers()
    await bot.handleUpdate(press(`tgp:re:short:${ID}:${SECRET}`) as never)
    expect(
      sink.filter(s => s.method === 'answerCallbackQuery'),
      'the press was left spinning'
    ).toHaveLength(1)
    expect(
      sink.some(s => s.method === 'editMessageReplyMarkup'),
      'the card kept its buttons after the press'
    ).toBe(true)
  })

  it('says what happened to the old words even when it cannot write new ones', async () => {
    /*
     * `preparedForOwner` is null until the seller section registers itself, so
     * this is the path a bot without that section takes. The draft is already
     * cancelled by then: the person has to be told that, or they will go back
     * to a card whose buttons are gone and assume it is still waiting.
     */
    await remember()
    const { bot } = await botWithRealHandlers()
    await bot.handleUpdate(press(`tgp:re:price:${ID}:${SECRET}`) as never)
    expect(said()).toContain('отменён')
  })

  it('a second tap does not claim the card went cold', async () => {
    // The remembered draft is handed out once. Before the de-duplication was
    // moved ahead of the work, the second tap consumed nothing and reported a
    // cold card -- about a rewrite that was running.
    await remember()
    const { bot } = await botWithRealHandlers()
    const p = press(`tgp:re:short:${ID}:${SECRET}`)
    await bot.handleUpdate(p as never)
    sink = []
    await bot.handleUpdate(p as never)
    expect(said()).not.toContain('остыла')
  })

  it('and a cold card is told the truth, not given a guessed recipient', async () => {
    const m = await import('@/services/telegramProposals')
    m.forgetCardLeadsForTests()
    const { bot } = await botWithRealHandlers()
    await bot.handleUpdate(press(`tgp:re:short:${ID}:${SECRET}`) as never)
    expect(said()).toContain('остыла')
    expect(
      calls.find(c => c.url.includes('/api/tg/proposal/cancel')),
      'the draft survived a press that could not use it'
    ).toBeTruthy()
  })

  it('opens and closes the style list without deciding anything', async () => {
    await remember()
    const { bot } = await botWithRealHandlers()
    for (const data of [`tgp:rw:${ID}:${SECRET}`, `tgp:rb:${ID}:${SECRET}`]) {
      sink = []
      calls = []
      await bot.handleUpdate(press(data) as never)
      expect(
        sink.some(s => s.method === 'editMessageReplyMarkup'),
        `${data.slice(0, 7)} redrew nothing`
      ).toBe(true)
      expect(calls, `${data.slice(0, 7)} called the server`).toHaveLength(0)
      expect(said(), `${data.slice(0, 7)} said something`).toBe('')
    }
    // Neither press consumed the draft: the rewrite after them still has it.
    const m = await import('@/services/telegramProposals')
    expect(m.peekCardLead(ID)).toBe(LEAD)
  })

  it('opening the list keeps send and cancel, and adds a way back', async () => {
    await remember()
    const { bot } = await botWithRealHandlers()
    await bot.handleUpdate(press(`tgp:rw:${ID}:${SECRET}`) as never)
    const edit = sink.find(s => s.method === 'editMessageReplyMarkup')
    const rows: string[][] = (
      edit?.payload?.reply_markup?.inline_keyboard ?? []
    ).map((r: any[]) => r.map(b => String(b.callback_data ?? b.url ?? '')))
    expect(rows[0]).toEqual([
      `tgp:ok:${ID}:${SECRET}`,
      `tgp:no:${ID}:${SECRET}`,
    ])
    expect(rows.flat().filter(d => d.startsWith('tgp:re:')).length).toBe(6)
    expect(rows.flat()).toContain(`tgp:rb:${ID}:${SECRET}`)
  })

  it('belongs to the owner: a stranger sending the same string gets nothing', async () => {
    /*
     * The card carries these buttons only for an admin, but callback data is a
     * string anybody can send back -- and this one starts a turn over the
     * owner's own correspondence.
     */
    await remember()
    const { bot } = await botWithRealHandlers()
    await bot.handleUpdate(
      press(`tgp:re:short:${ID}:${SECRET}`, 777000111) as never
    )
    expect(calls, 'a stranger cancelled the owner drafts').toHaveLength(0)
    expect(said()).toBe('')
    const m = await import('@/services/telegramProposals')
    expect(m.peekCardLead(ID), 'a stranger consumed the draft').toBe(LEAD)
  })

  it('and not to a group chat, where the audience is not the owner', async () => {
    await remember()
    const { bot } = await botWithRealHandlers()
    await bot.handleUpdate(
      press(`tgp:rw:${ID}:${SECRET}`, OWNER, 'supergroup') as never
    )
    expect(sink.some(s => s.method === 'editMessageReplyMarkup')).toBe(false)
  })
})
