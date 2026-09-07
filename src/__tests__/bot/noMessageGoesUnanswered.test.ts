import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { Telegraf, Telegram, session } from 'telegraf'
import { replyWitness, silenceNet } from '@/navigation/middleware/noSilence'

/**
 * A MESSAGE THAT NOBODY ANSWERS.
 *
 * Owner, 06.09.2026: several of his messages got no reply at all. The case
 * where the model refuses is guarded by `botNeverGoesSilent.test.ts`. This is
 * the other one: a message that never reaches the agent, because every
 * `return next()` in the agent middleware hands it to a chain that has nothing
 * left in it -- the agent middleware is the last handler registered that
 * answers text.
 *
 * These are behavioural, not structural: the pair is fed real updates through
 * a real Telegraf instance with the network stubbed. That matters here,
 * because the property is about ORDER and about what other handlers did, and
 * neither of those is visible in the text of a file.
 */

const chatOf = (type: 'private' | 'group') => ({ id: 424242, type })

const update = (
  extra: Record<string, unknown>,
  type: 'private' | 'group' = 'private'
) => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: chatOf(type),
    from: { id: 424242, is_bot: false, first_name: 'P', language_code: 'ru' },
    ...extra,
  },
})

/**
 * Telegraf builds its OWN `Telegram` for each update -- `ctx.telegram` is not
 * `bot.telegram` -- so stubbing the instance leaves `ctx.reply` talking to the
 * real api.telegram.org and failing with 401. The stub has to sit on the
 * prototype. This cost an hour when a probe's 401s were first blamed on the
 * code under test rather than on the harness around it.
 */
let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi

beforeAll(() => {
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    return { message_id: 1, date: 0, chat: chatOf('private') }
  }
})
afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
})

/** A bot carrying the pair, plus whatever handler the test wants in between. */
const botWith = (middle?: (ctx: any, next: any) => any) => {
  sink = []
  const sent = sink
  const errors: string[] = []
  const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  ;(bot as any).botInfo = {
    id: 111,
    is_bot: true,
    username: 'probe_bot',
    first_name: 'probe',
  }
  bot.catch((e: any) => {
    errors.push(String((e && e.message) || e))
  })
  bot.use(replyWitness)
  bot.use(session())
  /*
   * The net goes in BEFORE the handlers, exactly as registerCommands does it:
   * it awaits the rest of the chain and decides afterwards. Registered behind
   * a handler that answers and does not call next(), it would never run at all
   * -- which is the case where a press was handled but never answered.
   */
  bot.use(silenceNet as any)
  if (middle) bot.use(middle as any)
  return { bot, sent, errors }
}

describe('the harness can tell an answer from silence', () => {
  it('registers a direct send, so a count of zero means something', async () => {
    const { bot, sent } = botWith()
    await bot.telegram.sendMessage(1, 'control')
    expect(sent.map(s => s.method)).toContain('sendMessage')
  })

  it('a handler that answers produces exactly one send', async () => {
    const { bot, sent, errors } = botWith(async (ctx: any) => {
      await ctx.reply('handled')
    })
    await bot.handleUpdate(update({ text: 'anything' }) as any)
    const messages = sent.filter(s => s.method === 'sendMessage')
    expect(errors).toEqual([])
    expect(messages).toHaveLength(1)
    expect(messages[0].payload.text).toBe('handled')
  })
})

describe('no message is met with silence', () => {
  let harness: ReturnType<typeof botWith>
  beforeEach(() => {
    harness = botWith()
  })

  it('answers text that every handler declined', async () => {
    await harness.bot.handleUpdate(
      update({ text: '🔥 круто получилось' }) as any
    )
    const messages = harness.sent.filter(s => s.method === 'sendMessage')
    expect(messages).toHaveLength(1)
    expect(String(messages[0].payload.text)).not.toHaveLength(0)
  })

  it('answers a message shape with no text at all', async () => {
    await harness.bot.handleUpdate(
      update({
        contact: { phone_number: '+70000000000', first_name: 'X' },
      }) as any
    )
    expect(harness.sent.filter(s => s.method === 'sendMessage')).toHaveLength(1)
  })

  it('puts buttons under the answer, so there is something to press', async () => {
    await harness.bot.handleUpdate(
      update({ location: { latitude: 1, longitude: 1 } }) as any
    )
    const messages = harness.sent.filter(s => s.method === 'sendMessage')
    expect(messages).toHaveLength(1)
    const markup = messages[0].payload.reply_markup
    expect(markup?.inline_keyboard?.flat().length ?? 0).toBeGreaterThan(0)
  })
})

describe('the net does not talk over anybody', () => {
  it('stays quiet when a handler already replied and stopped', async () => {
    const { bot, sent } = botWith(async (ctx: any) => {
      await ctx.reply('handled')
    })
    await bot.handleUpdate(update({ text: 'anything' }) as any)
    expect(sent.filter(s => s.method === 'sendMessage')).toHaveLength(1)
  })

  /**
   * The dangerous case, and the reason the witness exists at all. A handler
   * that answers and STILL calls `next()` would otherwise reach the net, and
   * the person would get the puzzled sentence right after a real answer.
   */
  it('stays quiet when a handler replied and then called next()', async () => {
    const { bot, sent } = botWith(async (ctx: any, next: any) => {
      await ctx.reply('handled')
      return next()
    })
    await bot.handleUpdate(update({ text: 'anything' }) as any)
    const messages = sent.filter(s => s.method === 'sendMessage')
    expect(messages).toHaveLength(1)
    expect(messages[0].payload.text).toBe('handled')
  })

  it('sees an answer sent as a photo, not only as text', async () => {
    const { bot, sent } = botWith(async (ctx: any, next: any) => {
      await ctx.replyWithPhoto('file-id')
      return next()
    })
    await bot.handleUpdate(update({ text: 'anything' }) as any)
    expect(sent.filter(s => s.method === 'sendMessage')).toHaveLength(0)
  })

  it('stays quiet in a group, where it sees everybody else"s messages too', async () => {
    const { bot, sent } = botWith()
    await bot.handleUpdate(
      update({ text: 'разговор двух других людей' }, 'group') as any
    )
    expect(sent.filter(s => s.method === 'sendMessage')).toHaveLength(0)
  })

  it('stays quiet for a successful payment, answered by a later handler', async () => {
    const { bot, sent } = botWith()
    await bot.handleUpdate(
      update({
        successful_payment: {
          currency: 'XTR',
          total_amount: 100,
          invoice_payload: 'p',
          telegram_payment_charge_id: 'a',
          provider_payment_charge_id: 'b',
        },
      }) as any
    )
    expect(sent.filter(s => s.method === 'sendMessage')).toHaveLength(0)
  })

  /**
   * THE REGRESSION THIS POSITION FIXES.
   *
   * The net used to decide BEFORE calling next(), and `setupStatsCommand` is
   * registered after registerCommands in both bootstraps. So `/admin_sub`
   * reached the net before its real handler, and an admin got the puzzled
   * sentence first and the actual answer second.
   */
  it('lets a handler registered AFTER it answer first, and then says nothing', async () => {
    const { bot, sent } = botWith()
    bot.use(async (ctx: any) => {
      await ctx.reply('the real answer, from a later handler')
    })
    await bot.handleUpdate(update({ text: '/admin_sub' }) as any)
    const messages = sent.filter(s => s.method === 'sendMessage')
    expect(messages).toHaveLength(1)
    expect(messages[0].payload.text).toBe(
      'the real answer, from a later handler'
    )
  })

  /** A handler that throws must still leave the person with something. */
  it('still answers when a downstream handler throws', async () => {
    const { bot, sent } = botWith()
    bot.use(async () => {
      throw new Error('downstream exploded')
    })
    await bot.handleUpdate(update({ text: 'anything' }) as any)
    expect(sent.filter(s => s.method === 'sendMessage')).toHaveLength(1)
  })

  it('passes the update on, so handlers registered after it still run', async () => {
    const { bot, sent } = botWith()
    let reachedAfter = false
    bot.use(async (_ctx: any, next: any) => {
      reachedAfter = true
      return next()
    })
    await bot.handleUpdate(update({ text: 'anything' }) as any)
    expect(reachedAfter).toBe(true)
    expect(sent.filter(s => s.method === 'sendMessage')).toHaveLength(1)
  })
})

describe('the pair is wired at the two ends of the chain', () => {
  const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'navigation', 'registerCommands.ts'),
    'utf8'
  )
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(
    /^\s*\/\/.*$/gm,
    ''
  )

  it('registers the witness before anything else can reply', () => {
    const witness = CODE.indexOf('bot.use(replyWitness)')
    const stage = CODE.indexOf('bot.use(stage.middleware())')
    const nav = CODE.indexOf('registerGlobalNavigationMiddleware(bot)')
    expect(witness).toBeGreaterThan(-1)
    expect(stage).toBeGreaterThan(-1)
    expect(nav).toBeGreaterThan(-1)
    expect(witness).toBeLessThan(stage)
    expect(witness).toBeLessThan(nav)
  })

  /**
   * REGISTERED FIRST, DECIDING LAST — and both halves matter.
   *
   * The nets await the rest of the chain and only then ask whether anybody
   * answered. That is why they go in EARLY: a handler that answers and does not
   * call next() terminates the chain, so a net standing behind it never runs at
   * all. The previous version was registered last and lost exactly that case.
   */
  it('registers both nets before anything that could answer', () => {
    const start = CODE.indexOf(
      'export function registerCommands({ bot }: { bot: Telegraf<MyContext> }) {'
    )
    expect(start).toBeGreaterThan(-1)
    const rest = CODE.slice(start)
    const end = rest.search(/\n\}\n/)
    expect(end).toBeGreaterThan(0)
    const BODY = rest.slice(0, end)

    const witness = BODY.indexOf('bot.use(replyWitness)')
    const message = BODY.indexOf('bot.use(silenceNet)')
    const pressNet = BODY.indexOf('bot.use(deadPressNet)')
    expect(witness).toBeGreaterThan(-1)
    expect(message).toBeGreaterThan(witness)
    expect(pressNet).toBeGreaterThan(message)

    // Everything else in this function comes after the three of them.
    const others = [
      ...BODY.matchAll(
        /bot\.(use|on|hears|command|action)\(|\w+\(\s*bot\s*[,)]/g
      ),
    ]
      .map(m => m.index ?? -1)
      .filter(i => i !== witness && i !== message && i !== pressNet)
    expect(others.length).toBeGreaterThan(4)
    expect(others.filter(i => i < pressNet)).toEqual([])
  })

  /**
   * The decision must sit AFTER the await. A net that decides first is a
   * different, weaker thing wearing the same name, and nothing else here would
   * notice: the easy cases keep passing.
   */
  it('each net awaits the chain before it decides', () => {
    // Comments stripped: the prose in this very file explains the `finally`,
    // and a search over the raw text finds the explanation before the code.
    const SRC = fs
      .readFileSync(
        path.join(
          __dirname,
          '..',
          '..',
          'navigation',
          'middleware',
          'noSilence.ts'
        ),
        'utf8'
      )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const name of ['silenceNet', 'deadPressNet']) {
      const at = SRC.indexOf(`export const ${name} =`)
      expect(at, `${name} must exist`).toBeGreaterThan(-1)
      const body = SRC.slice(at, at + 1200)
      const awaitNext = body.indexOf('await next()')
      expect(awaitNext, `${name} must await the chain`).toBeGreaterThan(-1)
      expect(
        body.indexOf('finally'),
        `${name} must decide in a finally`
      ).toBeGreaterThan(awaitNext)
    }
  })
})
