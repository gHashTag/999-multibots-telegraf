import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Telegraf, Telegram, session } from 'telegraf'
import { replyWitness, deadPressNet } from '@/navigation/middleware/noSilence'

/**
 * A PRESS THAT REACHES NOTHING.
 *
 * The message net ended silence after somebody writes. This is the same
 * property one interaction later: a callback button whose id no handler catches
 * produces no error and no message -- just a clock on the button that spins for
 * about thirty seconds and stops. To the person that is indistinguishable from a
 * dead bot.
 *
 * A census of this repository counted 211 rendered callback ids against 45
 * caught by `bot.action`, 103 by a scene handler, and the rest by hand. Chasing
 * each orphan is a separate job; this catches the ones nobody has found yet and
 * the ones that will break later.
 *
 * Telegraf builds its OWN Telegram per update, so `ctx.telegram` is not
 * `bot.telegram` and the stub has to sit on the prototype.
 */
let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi

beforeAll(() => {
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    return { message_id: 1, date: 0, chat: { id: 424242, type: 'private' } }
  }
})
afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
})

const press = (data: string, type: 'private' | 'group' = 'private') => ({
  update_id: Math.floor(Math.random() * 1e9),
  callback_query: {
    id: 'q1',
    from: { id: 424242, is_bot: false, first_name: 'P', language_code: 'ru' },
    chat_instance: 'c1',
    data,
    message: {
      message_id: 7,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 424242, type },
      text: 'the message the button was attached to',
    },
  },
})

const botWith = (middle?: (ctx: any, next: any) => any) => {
  sink = []
  const sent = sink
  const errors: string[] = []
  const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  ;(bot as any).botInfo = {
    id: 111,
    is_bot: true,
    username: 'probe',
    first_name: 'p',
  }
  bot.catch((e: any) => errors.push(String((e && e.message) || e)))
  bot.use(replyWitness)
  bot.use(session())
  /*
   * The net goes in BEFORE the handlers, exactly as registerCommands does it:
   * it awaits the rest of the chain and decides afterwards. Registered behind
   * a handler that answers and does not call next(), it would never run at all
   * -- which is the case where a press was handled but never answered.
   */
  bot.use(deadPressNet as any)
  if (middle) bot.use(middle as any)
  return { bot, sent, errors }
}

const answers = (sent: Array<{ method: string }>) =>
  sent.filter(s => s.method === 'answerCallbackQuery')
const messages = (sent: Array<{ method: string }>) =>
  sent.filter(s => s.method === 'sendMessage')

describe('the harness can tell a handled press from a lost one', () => {
  it('a handler that answers the press produces exactly one answer', async () => {
    const { bot, sent, errors } = botWith(async (ctx: any) => {
      await ctx.answerCbQuery('done')
    })
    await bot.handleUpdate(press('act:topup') as any)
    expect(errors).toEqual([])
    expect(answers(sent)).toHaveLength(1)
    expect(answers(sent)[0]).toBeTruthy()
  })
})

describe('no press is met with a spinner that never stops', () => {
  it('answers a press nobody caught, so the clock stops', async () => {
    const { bot, sent } = botWith()
    await bot.handleUpdate(press('long_dead_button') as any)
    expect(answers(sent)).toHaveLength(1)
  })

  it('says the button is out of date, and offers live ones', async () => {
    const { bot, sent } = botWith()
    await bot.handleUpdate(press('long_dead_button') as any)
    const said = messages(sent)
    expect(said).toHaveLength(1)
    expect(JSON.stringify(said[0].payload.reply_markup)).toContain('act:topup')
  })

  /**
   * The quieter half, and the one that fires most often: somebody DID handle
   * the press but never answered it, so the button stayed stuck under a
   * perfectly good reply.
   */
  it('clears the clock silently when a handler replied but forgot to answer', async () => {
    const { bot, sent } = botWith(async (ctx: any) => {
      await ctx.reply('handled, but the query was never answered')
    })
    await bot.handleUpdate(press('act:topup') as any)
    expect(answers(sent)).toHaveLength(1)
    // No second message: the person already got a real reply.
    expect(messages(sent)).toHaveLength(1)
    expect(messages(sent)[0].payload.text).toContain('handled')
  })
})

describe('the press net does not talk over anybody', () => {
  it('stays silent when the press was properly answered', async () => {
    const { bot, sent } = botWith(async (ctx: any) => {
      await ctx.answerCbQuery()
      await ctx.reply('a real answer')
    })
    await bot.handleUpdate(press('act:balance') as any)
    expect(answers(sent)).toHaveLength(1)
    expect(messages(sent)).toHaveLength(1)
    expect(messages(sent)[0].payload.text).toBe('a real answer')
  })

  it('lets a handler registered AFTER it answer first', async () => {
    const { bot, sent } = botWith()
    bot.use(async (ctx: any) => {
      await ctx.answerCbQuery('late but correct')
      await ctx.reply('the real answer')
    })
    await bot.handleUpdate(press('act:can') as any)
    expect(answers(sent)).toHaveLength(1)
    expect(messages(sent)).toHaveLength(1)
    expect(messages(sent)[0].payload.text).toBe('the real answer')
  })

  it('clears the clock in a group but does not post there', async () => {
    const { bot, sent } = botWith()
    await bot.handleUpdate(press('long_dead_button', 'group') as any)
    expect(answers(sent)).toHaveLength(1)
    expect(messages(sent)).toHaveLength(0)
  })

  it('ignores a plain message, which is the other net"s job', async () => {
    const { bot, sent } = botWith()
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 424242, type: 'private' },
        from: { id: 424242, is_bot: false, first_name: 'P' },
        text: 'hello',
      },
    } as any)
    expect(answers(sent)).toHaveLength(0)
    expect(messages(sent)).toHaveLength(0)
  })
})
