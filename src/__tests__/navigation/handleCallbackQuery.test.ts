/**
 * ACKNOWLEDGING A PRESS IS NOT PART OF THE WORK.
 *
 * `handleCallbackQuery` runs on EVERY callback query of every bot
 * (registerGlobalNavigationMiddleware.ts:56). Its three branches each opened
 * with `await ctx.answerCbQuery()` INSIDE the try, so a press on an old
 * message -- Telegram invalidates the query id after ~15 minutes, and a
 * redelivered update is older still -- threw first, before scene.leave and
 * showMainMenu had run. Two things followed from one expired id: the customer
 * got no menu, and the catch called logger.error, which `utils/logger.ts`
 * routes to the owner's Telegram as '❌ [Callback] Error handling main menu'.
 *
 * These tests drive the handler with an answerCbQuery that rejects the way
 * Telegram rejects, and assert the work still happens and nobody is woken --
 * while a genuine failure of the work itself still pages.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MyContext } from '@/interfaces/telegram-bot.interface'

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/navigation', () => ({
  showMainMenu: vi.fn().mockResolvedValue(undefined),
}))

import { handleCallbackQuery } from '@/navigation/handlers/handleCallbackQuery'
import { showMainMenu } from '@/navigation'
import { logger } from '@/utils/logger'

const staleQuery = () =>
  Object.assign(
    new Error(
      '400: Bad Request: query is too old and response timeout expired or query ID is invalid'
    ),
    {
      response: {
        ok: false,
        error_code: 400,
        description:
          'Bad Request: query is too old and response timeout expired or query ID is invalid',
      },
    }
  )

describe('handleCallbackQuery: an expired press must not abort the work', () => {
  let answerCbQuery: ReturnType<typeof vi.fn>
  let sceneLeave: ReturnType<typeof vi.fn>

  const ctxFor = (data: string, sceneId?: string) =>
    ({
      from: { id: 123456 },
      callbackQuery: { data },
      scene: {
        leave: sceneLeave,
        current: sceneId ? { id: sceneId } : undefined,
      },
      answerCbQuery,
    }) as unknown as MyContext

  beforeEach(() => {
    vi.clearAllMocks()
    answerCbQuery = vi.fn().mockResolvedValue(true)
    sceneLeave = vi.fn().mockResolvedValue(undefined)
    ;(showMainMenu as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    )
  })

  it('shows the main menu even when the query id has expired', async () => {
    answerCbQuery.mockRejectedValue(staleQuery())

    const handled = await handleCallbackQuery(ctxFor('go_main_menu'))

    expect(handled).toBe(true)
    expect(sceneLeave).toHaveBeenCalled()
    expect(showMainMenu).toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('cancels even when the query id has expired', async () => {
    answerCbQuery.mockRejectedValue(staleQuery())

    const handled = await handleCallbackQuery(ctxFor('cancel'))

    expect(handled).toBe(true)
    expect(sceneLeave).toHaveBeenCalled()
    expect(showMainMenu).toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('handles help without paging when the query id has expired', async () => {
    answerCbQuery.mockRejectedValue(staleQuery())

    const handled = await handleCallbackQuery(ctxFor('help'))

    expect(handled).toBe(true)
    expect(logger.error).not.toHaveBeenCalled()
  })

  /*
   * The other half: the try/catch that remains has real work inside it, so its
   * alert now means exactly what it says. If showMainMenu itself fails, the
   * menu IS down and the owner should hear about it.
   */
  it('still pages when the menu itself fails to render', async () => {
    ;(showMainMenu as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'reply')")
    )

    const handled = await handleCallbackQuery(ctxFor('go_main_menu'))

    expect(handled).toBe(true)
    expect(logger.error).toHaveBeenCalledWith(
      '❌ [Callback] Error handling main menu:',
      expect.objectContaining({ telegramId: 123456 })
    )
  })

  it('acknowledges the press before doing the work', async () => {
    await handleCallbackQuery(ctxFor('go_main_menu'))

    expect(answerCbQuery).toHaveBeenCalled()
    expect(answerCbQuery.mock.invocationCallOrder[0]).toBeLessThan(
      sceneLeave.mock.invocationCallOrder[0]
    )
  })

  it('leaves chat_with_avatar to handle its own cancel and help', async () => {
    expect(
      await handleCallbackQuery(ctxFor('cancel', 'chat_with_avatar'))
    ).toBe(false)
    expect(await handleCallbackQuery(ctxFor('help', 'chat_with_avatar'))).toBe(
      false
    )
    expect(showMainMenu).not.toHaveBeenCalled()
  })

  it('ignores callbacks that are not ours', async () => {
    expect(await handleCallbackQuery(ctxFor('some_other_button'))).toBe(false)
    expect(answerCbQuery).not.toHaveBeenCalled()
  })
})
