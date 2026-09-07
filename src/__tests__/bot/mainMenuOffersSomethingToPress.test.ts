import { describe, it, expect, vi } from 'vitest'
import { showMainMenu } from '@/navigation/helpers/menuKeyboard'

/**
 * THE SCREEN EVERY PATH ENDS AT MUST NOT BE AN EMPTY ROOM.
 *
 * `createMainMenuKeyboard` returns `Markup.removeKeyboard()` -- the owner took
 * the eight category buttons out on purpose, and the reply-keyboard app button
 * with them, because a mini app launched from a reply key carries neither
 * signature nor user. That decision stands and is not what this guards.
 *
 * What it guards is what was left behind: the greeting still told the person to
 * choose a category while offering none, and nothing to tap. Reached from 108
 * call sites, including the end of new-user onboarding -- CreateUserScene, the
 * free demo, then here. So "offer payment right after /start" was wired
 * to the one branch of /start that a new person never takes.
 */
const fakeCtx = () => {
  const replies: any[] = []
  return {
    replies,
    ctx: {
      from: { id: 424242, language_code: 'ru' },
      session: {},
      reply: vi.fn(async (...args: any[]) => {
        replies.push(args)
        return { message_id: replies.length }
      }),
    } as any,
  }
}

describe('the main menu leaves the person something to press', () => {
  it('sends the greeting at all (the control for everything below)', async () => {
    const { ctx, replies } = fakeCtx()
    await showMainMenu(ctx)
    expect(replies.length).toBeGreaterThanOrEqual(1)
    expect(String(replies[0][0])).toContain('меню')
  })

  it('stops telling the person to choose a category that is not offered', async () => {
    const { ctx, replies } = fakeCtx()
    await showMainMenu(ctx)
    expect(String(replies[0][0])).not.toContain('Выберите категорию')
  })

  it('still clears a stale wizard keyboard on the greeting', async () => {
    const { ctx, replies } = fakeCtx()
    await showMainMenu(ctx)
    expect(replies[0][1]?.reply_markup?.remove_keyboard).toBe(true)
  })

  it('follows with buttons, top-up first', async () => {
    const { ctx, replies } = fakeCtx()
    await showMainMenu(ctx)
    expect(replies.length).toBe(2)
    const markup = replies[1][1]
    expect(markup?.reply_markup?.inline_keyboard?.length ?? 0).toBeGreaterThan(
      0
    )
    expect(JSON.stringify(markup.reply_markup.inline_keyboard[0])).toContain(
      'act:topup'
    )
  })

  /**
   * The greeting carries `remove_keyboard` and Telegram allows one reply_markup
   * per message, so the buttons cannot ride on it. Two messages is the price of
   * keeping the removal, which 87 places still make necessary.
   */
  it('does not try to put both a removal and buttons on one message', async () => {
    const { ctx, replies } = fakeCtx()
    await showMainMenu(ctx)
    expect(replies[0][1]?.reply_markup?.inline_keyboard).toBeUndefined()
    expect(replies[1][1]?.reply_markup?.remove_keyboard).toBeUndefined()
  })

  /** A follow-up that fails must not undo a menu that displayed. */
  it('survives a failing follow-up', async () => {
    const { ctx, replies } = fakeCtx()
    let call = 0
    ctx.reply = vi.fn(async (...args: any[]) => {
      call++
      if (call === 2) throw new Error('Telegram said no')
      replies.push(args)
      return { message_id: 1 }
    })
    await expect(showMainMenu(ctx)).resolves.toBeUndefined()
    expect(replies).toHaveLength(1)
  })
})
