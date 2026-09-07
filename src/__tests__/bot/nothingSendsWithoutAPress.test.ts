import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

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
  const start = SOURCE.indexOf(`bot.action(/^${marker}:(.+)$/`)
  expect(start, `handler ${marker} is gone`).toBeGreaterThan(-1)
  const rest = SOURCE.slice(start + 1)
  const end = rest.indexOf('\n  bot.')
  return end > -1 ? rest.slice(0, end) : rest
}

describe('the card appears only when something is actually waiting', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.RENDER_API_KEY = 'test-key'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a reading tool does not produce a confirmation card', async () => {
    /*
     * Asking somebody to approve a thing that has already happened is how
     * people learn to press the green button without reading it -- which is
     * the exact habit this card exists to prevent.
     */
    const { toolsMayHaveProposed } = await import(
      '@/services/telegramProposals'
    )
    expect(toolsMayHaveProposed(['tg_dialogs', 'tg_history'])).toBe(false)
    expect(toolsMayHaveProposed([])).toBe(false)
  })

  it('an acting tool does', async () => {
    const { toolsMayHaveProposed } = await import(
      '@/services/telegramProposals'
    )
    expect(toolsMayHaveProposed(['tg_send'])).toBe(true)
    expect(toolsMayHaveProposed(['tg_dialogs', 'tg_forward'])).toBe(true)
  })

  it('an unreachable server costs the draft, never the answer', async () => {
    // The person asked a question and got an answer. A queue that cannot be
    // read is not a reason to interrupt them; the draft expires by itself.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('econnrefused')
      })
    )
    const { pendingProposal } = await import('@/services/telegramProposals')
    await expect(pendingProposal('144022504')).resolves.toBeNull()
  })

  it('without a server key nothing is even asked for', async () => {
    process.env.RENDER_API_KEY = ''
    vi.resetModules()
    const called = vi.fn()
    vi.stubGlobal('fetch', called)
    const { pendingProposal } = await import('@/services/telegramProposals')
    expect(await pendingProposal('144022504')).toBeNull()
    expect(called).not.toHaveBeenCalled()
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
      { id: 'p1', action: 'send', target: '@x', what: long },
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
      { id: 'abc-123', action: 'send', target: '@x', what: 'hi' },
      true
    )
    const data = card.markup.reply_markup.inline_keyboard
      .flat()
      .map((b: any) => b.callback_data)
    expect(data).toContain(`${PROPOSAL_OK}abc-123`)
    expect(data).toContain(`${PROPOSAL_NO}abc-123`)
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
        id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
        action: 'send',
        target: '@x',
        what: 'hi',
      },
      true
    )
    for (const b of card.markup.reply_markup.inline_keyboard.flat() as any[]) {
      expect(Buffer.byteLength(b.callback_data, 'utf8')).toBeLessThanOrEqual(64)
    }
  })
})

describe('both buttons are wired, and the press is the only thing that acts', () => {
  it('confirm and cancel are both registered as handlers', () => {
    // A button whose press reaches nothing is the same broken promise as the
    // tool that could never send -- one interaction later.
    expect(SOURCE).toContain('bot.action(/^tgp:ok:(.+)$/')
    expect(SOURCE).toContain('bot.action(/^tgp:no:(.+)$/')
  })

  it('the bot never calls confirm on its own, only from a press', () => {
    /*
     * Structural, and load-bearing: `confirmProposal` may appear ONLY inside
     * the callback handler. Anywhere else -- in the answer path, in a timer --
     * it would send without anybody deciding to.
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
    const strip = SOURCE.slice(SOURCE.indexOf('const stripButtons'))
    expect(strip.slice(0, 200)).toContain('editMessageReplyMarkup(undefined)')
  })

  it('answerCbQuery comes before the work, per the project rule', () => {
    const ok = SOURCE.slice(SOURCE.indexOf('bot.action(/^tgp:ok:(.+)$/'))
    const answered = ok.indexOf('answerCbQuery')
    const acted = ok.indexOf('confirmProposal')
    expect(answered).toBeGreaterThan(-1)
    expect(answered).toBeLessThan(acted)
  })
})
