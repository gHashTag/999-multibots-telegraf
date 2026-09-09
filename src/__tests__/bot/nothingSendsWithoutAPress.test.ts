import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { Telegraf, Telegram, session } from 'telegraf'
import { replyWitness, deadPressNet } from '@/navigation/middleware/noSilence'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

/**
 * NOTHING REACHES ANOTHER PERSON WITHOUT A PRESS.
 *
 * `tg_send` files a proposal instead of sending. That half was always right.
 * The half that did not exist was anything able to accept one: measured
 * 2026-09-07, `grep -rn proposal` across the player and the bot found NOT ONE
 * reader, so the tool could not reach anybody at all.
 *
 * Now it can, and every check in this file describes a way that could go wrong
 * with somebody else's correspondence.
 */

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'navigation', 'registerCommands.ts'),
  'utf8'
)

/**
 * The source of ONE handler, ending at the next top-level registration.
 *
 * Slicing to the end of the file is the shortcut that makes a structural check
 * meaningless: everything below matches, so the assertion holds no matter
 * where the line actually is.
 */
function handlerBody(marker: string): string {
  const start = SOURCE.indexOf(`bot.action(/^${marker}:([^:]+):(.+)$/`)
  expect(start, `handler ${marker} is gone`).toBeGreaterThan(-1)
  const rest = SOURCE.slice(start + 1)
  const end = rest.indexOf('\n  bot.')
  return end > -1 ? rest.slice(0, end) : rest
}

describe('the card appears only when a draft actually came back', () => {
  /*
   * The gate used to be a list of tool names in the bot (`toolsMayHaveProposed`)
   * checked against a draft fetched over HTTP. Both are gone: the draft now
   * arrives on the answer itself, and the server queues only what it can carry
   * out, so the presence of `ответ.proposal` IS the gate.
   *
   * Those two helpers were kept for a while with tests still green -- on code
   * nothing called. A passing test over a dead export on a path that sends
   * messages to other people is worse than no test: it reads as cover.
   */
  it('no draft in the answer means no card', () => {
    const call = SOURCE.indexOf("ctx.chat?.type === 'private' && draft")
    expect(call, 'the card no longer depends on a draft').toBeGreaterThan(-1)
    const decl = SOURCE.slice(0, call).lastIndexOf('const draft =')
    expect(decl, 'draft is not taken from the answer').toBeGreaterThan(-1)
    expect(SOURCE.slice(decl, call)).toContain('ответ.proposal')
  })

  it('the bot no longer fetches the draft over HTTP', async () => {
    /*
     * That route hands out no secret -- deliberately, since anything holding
     * the shared server key can call it -- so a card built from it would carry
     * a button that cannot confirm. Leaving the fetch in place would be a live
     * way to build exactly that card.
     */
    const mod = await import('@/services/telegramProposals')
    expect(Object.keys(mod)).not.toContain('pendingProposal')
    expect(Object.keys(mod)).not.toContain('toolsMayHaveProposed')
    expect(SOURCE).not.toContain('pendingProposal')
    expect(SOURCE).not.toContain('toolsMayHaveProposed')
  })
})

describe('the card shows what will actually be sent', () => {
  it('the recipient and the whole text, not a summary', async () => {
    /*
     * "Send the message to Ivan?" asks somebody to approve words they have not
     * read. The words are the thing being approved.
     */
    const { proposalCard } = await import('@/services/telegramProposals')
    const card = proposalCard(
      {
        id: 'p1',
        action: 'send',
        target: '@someone',
        what: 'Здравствуйте! Готов обсудить в четверг.',
        secret: 's',
      },
      true
    )
    expect(card.text).toContain('@someone')
    expect(card.text).toContain('Здравствуйте! Готов обсудить в четверг.')
  })

  it('a cut is stated rather than hidden', async () => {
    // Silent truncation is how somebody approves a paragraph they never saw.
    const { proposalCard } = await import('@/services/telegramProposals')
    const long = 'я'.repeat(5000)
    const card = proposalCard(
      { id: 'p1', action: 'send', target: '@x', what: long, secret: 's' },
      true
    )
    expect(card.text.length).toBeLessThan(4096)
    expect(card.text).toContain('5000')
  })

  it('the two buttons carry the id of THIS draft', async () => {
    const { proposalCard, PROPOSAL_OK, PROPOSAL_NO } = await import(
      '@/services/telegramProposals'
    )
    const card = proposalCard(
      { id: 'abc123', action: 'send', target: '@x', what: 'hi', secret: 's3' },
      true
    )
    const data = card.markup.reply_markup.inline_keyboard
      .flat()
      .map((b: any) => b.callback_data)
    expect(data).toContain(`${PROPOSAL_OK}abc123:s3`)
    expect(data).toContain(`${PROPOSAL_NO}abc123:s3`)
  })

  it('both buttons carry the one-time secret, not just the id', async () => {
    /*
     * The id alone is readable by anything holding the shared server key --
     * that was the whole hole. If the button carried only the id, the press
     * would be no more authoritative than a key holder's HTTP request.
     */
    const { proposalCard } = await import('@/services/telegramProposals')
    const card = proposalCard(
      {
        id: 'abc123',
        action: 'send',
        target: '@x',
        what: 'hi',
        secret: 'f'.repeat(32),
      },
      true
    )
    for (const b of card.markup.reply_markup.inline_keyboard.flat() as any[]) {
      expect(b.callback_data).toContain('f'.repeat(32))
    }
  })

  it('callback data fits in the 64 bytes Telegram allows', async () => {
    /*
     * Over the limit Telegram rejects the whole message, so the card would not
     * appear at all -- and the failure would look like "the agent did nothing"
     * rather than like a bug. Ids are UUIDs; this is the real size.
     */
    const { proposalCard } = await import('@/services/telegramProposals')
    const card = proposalCard(
      {
        // The real generated shapes: a 12-hex id and a 32-hex secret.
        id: '3f2504e04f89',
        action: 'send',
        target: '@x',
        what: 'hi',
        secret: 'a'.repeat(32),
      },
      true
    )
    for (const b of card.markup.reply_markup.inline_keyboard.flat() as any[]) {
      expect(Buffer.byteLength(b.callback_data, 'utf8')).toBeLessThanOrEqual(64)
    }
  })
})

describe('a silent answer still shows the card', () => {
  it('the card is drawn OUTSIDE the "answer has text" branch', () => {
    /*
     * It used to live inside `if (ответ.текст)`. A turn that called tg_send
     * and said nothing -- which the model does -- fell straight through to the
     * fallback path: the one-time secret had already been issued and burned,
     * no card was ever drawn, and the prepared message sat in the queue until
     * it expired. The person was told nothing at all.
     *
     * Checked by position, because that is exactly what went wrong: the code
     * was correct and in the wrong block.
     */
    const card = SOURCE.indexOf("ctx.chat?.type === 'private' && draft")
    const textBranch = SOURCE.indexOf('if (ответ.текст) {')
    expect(card, 'the card is gone').toBeGreaterThan(-1)
    expect(textBranch, 'the text branch is gone').toBeGreaterThan(-1)
    expect(
      card,
      'карточка снова внутри ветки «в ответе есть текст» — молчаливый ход её потеряет'
    ).toBeLessThan(textBranch)
  })

  it('and the draft is read from the answer before either path runs', () => {
    const draft = SOURCE.indexOf('const draft = ответ.proposal')
    const textBranch = SOURCE.indexOf('if (ответ.текст) {')
    expect(draft).toBeGreaterThan(-1)
    expect(draft).toBeLessThan(textBranch)
  })
})

describe('the draft is never shown to a room', () => {
  it('the card is gated on a private chat', () => {
    /*
     * The card carries the recipient and the FULL TEXT of a message from
     * somebody's personal Telegram, under a Send button. The AI fallback that
     * produces the answer has no chat-type gate of its own -- verified: the
     * only gates below it are attachment, "/" prefix, emoji and scene -- so in
     * a group the bot would print that draft in front of everyone present, and
     * any of them could press.
     */
    /*
     * Anchored on the CALL, not on the first mention of the name: the first
     * `toolsMayHaveProposed` in this file is the import line, so slicing there
     * looked at code above the gate and the check failed on healthy code.
     */
    const call = SOURCE.indexOf("ctx.chat?.type === 'private' && draft")
    expect(
      call,
      'the card is no longer gated on a private chat'
    ).toBeGreaterThan(-1)
    // The card is drawn INSIDE that gate, not merely somewhere near it.
    // Wider than before: the card now carries the owner's history row.
    const after = SOURCE.slice(call, call + 2000)
    expect(after).toContain('proposalCard(')
    expect(after).toContain('ctx.reply(card.text, card.markup)')
  })
})

describe('both buttons are wired, and the press is what acts', () => {
  it('confirm and cancel are both registered as handlers', () => {
    // A button whose press reaches nothing is the same broken promise as the
    // tool that could never send -- one interaction later.
    expect(SOURCE).toContain('bot.action(/^tgp:ok:([^:]+):(.+)$/')
    expect(SOURCE).toContain('bot.action(/^tgp:no:([^:]+):(.+)$/')
  })

  it('the bot never calls confirm on its own, only from a press', () => {
    /*
     * Structural, and load-bearing: `confirmProposal` may appear ONLY inside
     * the callback handler. Anywhere else -- in the answer path, in a timer --
     * it would send without anybody deciding to.
     *
     * The scope of the claim, stated so it is not over-read: this pins the
     * BOT. The render route also accepts the shared server key with an
     * explicit telegram_id, so a key-holder can confirm without any press at
     * all -- see the comment above the route. What is verified here is that
     * the bot itself never presses on somebody's behalf.
     */
    const handler = handlerBody('tgp:ok')
    const total = SOURCE.split('confirmProposal').length - 1
    const inside = handler.split('confirmProposal').length - 1
    expect(total, 'confirmProposal is not referenced at all').toBeGreaterThan(0)
    expect(
      inside,
      'confirmProposal is referenced outside the button handler'
    ).toBe(total)
  })

  it('the buttons are removed once pressed', () => {
    /*
     * A card whose buttons survive their own press invites a second tap, and
     * on a phone the second tap is the normal case, not the rare one.
     *
     * Checked INSIDE both handlers. The first version of this searched the
     * whole file and was satisfied by an unrelated `editMessageReplyMarkup`
     * 800 lines away, in a different handler: removing the call from these two
     * changed nothing and the check passed. It looked at a real line, just not
     * at this one.
     */
    for (const marker of ['tgp:ok', 'tgp:no']) {
      expect(
        handlerBody(marker),
        `${marker} no longer clears its buttons`
      ).toContain('stripButtons(ctx)')
    }
    const strip = sliceFrom(SOURCE, 'const stripButtons')
    expect(strip.slice(0, 200)).toContain('editMessageReplyMarkup(undefined)')
  })

  it('answerCbQuery comes before the work, per the project rule', () => {
    const ok = sliceFrom(SOURCE, 'bot.action(/^tgp:ok:([^:]+):(.+)$/')
    const answered = ok.indexOf('answerCbQuery')
    const acted = ok.indexOf('confirmProposal')
    expect(answered).toBeGreaterThan(-1)
    expect(answered).toBeLessThan(acted)
  })
})

describe('the bot does not claim to know what it does not know', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.RENDER_API_KEY = 'test-key'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('a dropped connection is reported as UNKNOWN, not as "not sent"', async () => {
    /*
     * The route deletes the draft and only then sends. Reproduced against a
     * server that sends and then drops the socket: the recipient received the
     * message and the owner was shown "❌ Не отправлено: fetch failed".
     *
     * That is a claim about a state nobody knows, and it is the expensive kind
     * -- the person rewrites the message and it arrives twice.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch failed')
      })
    )
    const { confirmProposal } = await import('@/services/telegramProposals')
    const r = await confirmProposal('144022504', 'p1', 'secret')
    expect(r.ok).toBe(false)
    expect(r.unknown, 'a transport failure is reported as a definite one').toBe(
      true
    )
  })

  it('a server answer is NOT unknown -- that one really did not send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ ok: false, error: 'уже подтверждено' }),
      }))
    )
    const { confirmProposal } = await import('@/services/telegramProposals')
    const r = await confirmProposal('144022504', 'p1', 'secret')
    expect(r.ok).toBe(false)
    expect(r.unknown).toBeFalsy()
    expect(r.error).toContain('уже подтверждено')
  })

  it('the three states reach three different sentences', () => {
    // A branch nobody renders is a branch that does not exist.
    const handler = handlerBody('tgp:ok')
    expect(handler).toContain('r.unknown')
    expect(handler).toContain('Связь прервалась')
    expect(handler).toContain('Не отправлено')
    expect(handler).toContain('Отправлено')
  })
})

describe('a press inside a scene still reaches the handler', () => {
  it('the confirm buttons are registered BEFORE the scene middleware', () => {
    /*
     * Scene middleware is greedy. Verified against this repo's own telegraf in
     * the real registration order: a wizard step that handles `callback_query`
     * and does not call next() -- neuroPhotoWizard does exactly that -- eats
     * the press, and the confirm handler never runs. The person taps
     * "Отправить", nothing happens, and the draft expires without a word.
     *
     * Reachable, not theoretical: the agent's answer carries a top-up button
     * that enters a scene, so somebody can be inside one between seeing the
     * card and pressing it.
     */
    const registered = SOURCE.indexOf('registerProposalButtons(bot)')
    const stage = SOURCE.indexOf('bot.use(stage.middleware())')
    expect(registered, 'the buttons are no longer registered').toBeGreaterThan(
      -1
    )
    expect(stage, 'the stage middleware is gone').toBeGreaterThan(-1)
    expect(
      registered,
      'сцены перехватят нажатие: кнопки регистрируются после stage'
    ).toBeLessThan(stage)
  })

  it('and the handlers live in that function, not somewhere later', () => {
    const fn = SOURCE.indexOf('export function registerProposalButtons')
    expect(fn).toBeGreaterThan(-1)
    const body = SOURCE.slice(fn, SOURCE.indexOf('\n}', fn))
    expect(body).toContain('bot.action(/^tgp:ok:([^:]+):(.+)$/')
    expect(body).toContain('bot.action(/^tgp:no:([^:]+):(.+)$/')
  })
})

describe('the secret actually reaches the server', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.RENDER_API_KEY = 'test-key'
  })
  afterEach(() => vi.unstubAllGlobals())

  const capture = () => {
    const seen: { url?: string; body?: any } = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any) => {
        seen.url = String(url)
        seen.body = JSON.parse(String(init?.body ?? '{}'))
        return { ok: true, status: 200, json: async () => ({ ok: true }) }
      })
    )
    return seen
  }

  it('confirm posts the secret, not only the id', async () => {
    /*
     * Dropping `secret` from the body changed NOTHING in this suite until this
     * check existed -- and in production every press would have been refused,
     * because the server compares against a secret it never received. Exactly
     * the shape of the defect this morning: a body that does not carry what
     * the other side needs, invisible to everything but a real press.
     */
    const seen = capture()
    const { confirmProposal } = await import('@/services/telegramProposals')
    await confirmProposal('144022504', 'p1', 'f'.repeat(32))
    expect(seen.body).toEqual({ id: 'p1', secret: 'f'.repeat(32) })
  })

  it('cancel posts it too', async () => {
    // Cancel goes through the same claim, so it needs the same proof. Without
    // it a cancelled draft is not consumed and stays live until it expires.
    const seen = capture()
    const { cancelProposal } = await import('@/services/telegramProposals')
    await cancelProposal('144022504', 'p1', 'a'.repeat(32))
    expect(seen.body).toEqual({ id: 'p1', secret: 'a'.repeat(32) })
  })

  it('the identity still travels in the query, where the server reads it', async () => {
    const seen = capture()
    const { confirmProposal } = await import('@/services/telegramProposals')
    await confirmProposal('144022504', 'p1', 's')
    expect(seen.url).toContain('telegram_id=144022504')
    // ...and the secret does NOT, because query strings end up in logs.
    expect(seen.url).not.toContain('secret')
  })
})

describe('the card does not present a bare id as a checkable address', () => {
  it('a numeric recipient is marked as unverifiable', async () => {
    /*
     * `tg_dialogs` hands the model an id and no username, so "reply to this
     * dialog" arrives here as digits -- and the send path was deliberately
     * made to work for that shape. "Кому: 900000002" asks somebody to approve
     * a recipient they cannot recognise.
     */
    const { proposalCard } = await import('@/services/telegramProposals')
    const card = proposalCard(
      {
        id: 'p1',
        action: 'send',
        target: '900000002',
        what: 'hi',
        secret: 's',
      },
      true
    )
    expect(card.text).toContain('900000002')
    expect(card.text).toContain('числовой id')
  })

  it('a @username is shown plainly, with no warning bolted on', async () => {
    // A warning on every recipient is a warning on none.
    const { proposalCard } = await import('@/services/telegramProposals')
    const card = proposalCard(
      { id: 'p1', action: 'send', target: '@ivan', what: 'hi', secret: 's' },
      true
    )
    expect(card.text).toContain('@ivan')
    expect(card.text).not.toContain('числовой id')
  })
})

/**
 * THE CONFIRM PRESS UNDER THE DEAD-PRESS NET.
 *
 * `deadPressNet` arrived from main while this branch was open. It wraps every
 * update and, if nothing answered the press, tells the person "that button is
 * out of date" and posts a fresh menu.
 *
 * That is right for an orphaned button and wrong for this one: the message has
 * just been SENT, and being told the button is dead immediately afterwards
 * would make a successful send look like a failure -- the person re-sends.
 *
 * Reasoning says the handlers are safe because they call `answerCbQuery` first
 * and the witness marks the press. Reasoning is not a check: this drives a real
 * Telegraf with the real middleware, in the real registration order.
 */
const realCallApi = (Telegram.prototype as any).callApi

function press(data: string, chatType = 'private') {
  return {
    update_id: 1,
    callback_query: {
      id: 'cb1',
      from: { id: 144022504, is_bot: false, first_name: 'o' },
      chat_instance: 'ci',
      data,
      message: {
        message_id: 5,
        date: 0,
        chat: { id: 144022504, type: chatType },
      },
    },
  }
}

describe('a confirmed send is not then called a dead button', () => {
  let sink: Array<{ method: string; payload: any }> = []

  beforeEach(() => {
    sink = []
    ;(Telegram.prototype as any).callApi = async (
      method: string,
      payload: any
    ) => {
      sink.push({ method, payload })
      return method === 'sendMessage' ? { message_id: 6 } : true
    }
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
    // The order registerCommands uses: witness, net, THEN the confirm buttons,
    // which sit ahead of the scene middleware.
    bot.use(replyWitness)
    bot.use(session())
    bot.use(deadPressNet as any)
    const { registerProposalButtons } = await import(
      '@/navigation/registerCommands'
    )
    registerProposalButtons(bot as never)
    return { bot, errors }
  }

  it('a successful confirm answers the press and says nothing about dead buttons', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }))
    )
    process.env.RENDER_API_KEY = 'test-key'
    const { bot, errors } = await botWithRealHandlers()
    await bot.handleUpdate(
      press(`tgp:ok:abc123456789:${'f'.repeat(32)}`) as never
    )

    expect(errors).toEqual([])
    const said = sink
      .filter(s => s.method === 'sendMessage')
      .map(s => String(s.payload?.text ?? ''))
      .join(' | ')
    /*
     * Language-agnostic: `isRussianFromState` answers English without a stored
     * language, and pinning one wording would make this test about the
     * dictionary rather than about the net.
     */
    const saysSent = said.includes('Отправлено') || said.includes('Sent')
    const saysDead = said.includes('устарела') || said.includes('out of date')
    expect(saysSent, 'подтверждение не отчиталось человеку').toBe(true)
    expect(saysDead, 'после отправки бот назвал кнопку устаревшей').toBe(false)
    // Exactly one answer: the net must not add a second on top of the handler.
    expect(
      sink.filter(s => s.method === 'answerCallbackQuery'),
      'нажатие отвечено дважды'
    ).toHaveLength(1)
  })

  it('a cancel is treated the same way', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }))
    )
    process.env.RENDER_API_KEY = 'test-key'
    const { bot } = await botWithRealHandlers()
    await bot.handleUpdate(
      press(`tgp:no:abc123456789:${'f'.repeat(32)}`) as never
    )
    const said = sink
      .filter(s => s.method === 'sendMessage')
      .map(s => String(s.payload?.text ?? ''))
      .join(' | ')
    expect(said.includes('Отменено') || said.includes('Cancelled')).toBe(true)
    expect(said.includes('устарела') || said.includes('out of date')).toBe(
      false
    )
  })

  it('and a genuinely orphaned press still gets the net', async () => {
    // The other direction, so the check above cannot pass by the net being
    // broken rather than by the handler working.
    const { bot } = await botWithRealHandlers()
    await bot.handleUpdate(press('act:long_dead_button') as never)
    const said = sink
      .filter(s => s.method === 'sendMessage')
      .map(s => String(s.payload?.text ?? ''))
      .join(' | ')
    expect(
      said.includes('устарела') || said.includes('out of date'),
      'сеть перестала ловить осиротевшие нажатия'
    ).toBe(true)
  })
})

describe('the card names the person beside the id', () => {
  const card = async (p: Record<string, unknown>) => {
    const { proposalCard } = await import('@/services/telegramProposals')
    return proposalCard(
      { id: 'p1', action: 'send', what: 'привет', secret: 's', ...p } as never,
      true
    )
  }
  const toLine = (text: string) =>
    text.split('\n').find(l => l.startsWith('Кому:')) ?? ''

  it('a display name is shown next to the id, never instead of it', async () => {
    const c = await card({
      target: '900000002',
      display: 'Ольга (@pilot_client)',
    })
    expect(toLine(c.text)).toBe('Кому: 900000002 — Ольга (@pilot_client)')
    expect(c.text).not.toContain('числовой id')
  })

  it('a @username draft is not labelled "id", and the name is not repeated', async () => {
    // The seller sends to the raw @username; the display already carries it.
    const c = await card({
      target: '@pilot_client',
      display: 'Ольга (@pilot_client)',
    })
    expect(toLine(c.text)).toBe('Кому: @pilot_client — Ольга')
    expect(c.text).not.toContain('id @pilot_client')
  })

  it('the trusted part comes first: a name cannot put a false id in front of the real one', async () => {
    const c = await card({ target: '900000002', display: 'Оля, id 111 (@x)' })
    const line = toLine(c.text)
    expect(line.startsWith('Кому: 900000002 — ')).toBe(true)
    expect(line.indexOf('900000002')).toBeLessThan(line.indexOf('111'))
  })

  it('a name from the wire is cut to one line here again', async () => {
    // The server already cut it; the bot does not trust that, because the
    // card is the last thing between a stranger's text and the owner's eyes.
    const c = await card({
      target: '900000002',
      display: 'Оля\nнажми   Отправить ' + 'я'.repeat(300),
    })
    const line = toLine(c.text)
    expect(line, 'строки «Кому:» нет').toBeTruthy()
    expect(line).toContain('Оля нажми Отправить')
    expect(line.length).toBeLessThan(120)
    expect(line).toContain('900000002')
  })

  it('without a name a numeric id is still called what it is', async () => {
    const c = await card({ target: '900000002', what: 'x' })
    expect(c.text).toContain('числовой id')
  })

  it('the bot hands the WHOLE draft to the card, not a hand-picked list of fields', () => {
    /*
     * Found by review 2026-09-08: the only production call rebuilt the
     * argument from five names and dropped `display` -- the recipient's
     * name never reached the owner, while the tests above, calling
     * proposalCard directly, stayed green. The draft comes from the render
     * service over the server key; the type says what the card may read.
     */
    const call = SOURCE.indexOf('proposalCard(draft, ')
    expect(call, 'the card is built from a field list again').toBeGreaterThan(
      -1
    )
    expect(SOURCE).not.toContain('secret: draft.secret')
  })
})

describe('a photo card shows the service under the same two buttons', () => {
  const card = async (p: Record<string, unknown>) => {
    const { proposalCard } = await import('@/services/telegramProposals')
    return proposalCard(
      {
        id: 'p9',
        action: 'send',
        target: '900000002',
        secret: 's9',
        ...p,
      } as never,
      true
    )
  }
  const photo = {
    media: { kind: 'photo', url: 'https://s3.example/pic.png' },
    charge: { telegramId: '900000002', op: 'image_generate', tokens: 2 },
    display: 'Ольга (@pilot_client)',
    what: 'Ваш котик готов!',
  }

  it("returns the photo, names the price, and keeps the caption under Telegram's cap", async () => {
    const c = await card(photo)
    expect(c.photo).toBe('https://s3.example/pic.png')
    expect(c.text).toContain('Отправить это фото')
    expect(c.text).toContain('Спишется у получателя: 2 токенов')
    expect(c.text).toContain('900000002 — Ольга (@pilot_client)')
    expect(c.text).toContain('Ваш котик готов!')
    expect(c.text.length).toBeLessThanOrEqual(1024)
  })

  it('a long caption is cut to fit the photo, and the cut is stated', async () => {
    const c = await card({ ...photo, what: 'я'.repeat(3000) })
    expect(c.text.length).toBeLessThanOrEqual(1024)
    expect(c.text).toContain('3000')
  })

  it("the buttons carry this draft's id and secret, photo or not", async () => {
    const { PROPOSAL_OK, PROPOSAL_NO } = await import(
      '@/services/telegramProposals'
    )
    const c = await card(photo)
    const data = c.markup.reply_markup.inline_keyboard
      .flat()
      .map((b: any) => b.callback_data)
    expect(data).toContain(`${PROPOSAL_OK}p9:s9`)
    expect(data).toContain(`${PROPOSAL_NO}p9:s9`)
  })

  it('a text draft has no photo and no price line', async () => {
    const c = await card({ what: 'привет' })
    expect(c.photo).toBeUndefined()
    expect(c.text).not.toContain('Спишется')
    expect(c.text).toContain('Отправить сообщение')
  })

  it('the bot sends a photo card as a photo, and falls back to the link', () => {
    // Source-level: the handler that draws the card is not bootable here.
    const block = sliceFrom(
      SOURCE,
      "ctx.chat?.type === 'private' && draft",
      2200
    )
    expect(block).toContain('if (!card.photo)')
    expect(block).toContain('sendPhotoWithFallback(ctx, card.photo')
    expect(block).toContain('reply_markup: card.markup.reply_markup')
    expect(block).toContain('${card.photo}')
  })
})
