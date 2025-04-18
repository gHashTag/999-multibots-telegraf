/**
 * Tests for paymentScene
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
/* eslint-disable @typescript-eslint/ban-ts-comment */
import makeMockContext, { DebugExtension } from '../utils/mockTelegrafContext'
import type { MyContext } from '../../src/interfaces'
// import types if needed
import {
  paymentSceneEnterHandler,
  paymentSceneStarsHandler,
  paymentSceneRublesHandler,
  paymentSceneMenuHandler,
} from '../../src/scenes/paymentScene'

// Мокаем зависимости по относительным путям
jest.mock('../../src/helpers', () => ({ isRussian: jest.fn() }))
jest.mock('../../src/handlers/handleBuySubscription', () => ({
  handleBuySubscription: jest.fn(),
}))
jest.mock('../../src/handlers/handleSelectStars', () => ({
  handleSelectStars: jest.fn(),
}))

describe('paymentScene', () => {
  let ctx: MyContext & DebugExtension
  const helpers = jest.requireMock('../../src/helpers') as {
    isRussian: jest.Mock
  }
  const isRu = helpers.isRussian
  const buyModule = jest.requireMock(
    '../../src/handlers/handleBuySubscription'
  ) as {
    handleBuySubscription: jest.Mock
  }
  const buyMock = buyModule.handleBuySubscription
  const starsModule = jest.requireMock(
    '../../src/handlers/handleSelectStars'
  ) as {
    handleSelectStars: jest.Mock
  }
  const starsMock = starsModule.handleSelectStars

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
  })

  it('enter: sends payment options keyboard', async () => {
    isRu.mockReturnValue(true)
    await paymentSceneEnterHandler(ctx)
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    const reply = ctx.debug.replies[0]
    expect(typeof reply.message).toBe('string')
    expect(reply.extra.reply_markup).toBeDefined()
  })

  it('enter: on error replies error message', async () => {
    isRu.mockReturnValue(false)
    // @ts-ignore: allow injecting mock failure
    ctx = makeMockContext(
      {},
      // @ts-ignore: jest.Mock typing workaround
      { reply: jest.fn().mockRejectedValueOnce(new Error('fail')) }
    )
    await paymentSceneEnterHandler(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'An error occurred. Please try again.'
    )
  })

  it('stars handler: neurobase calls handleBuySubscription and leaves', async () => {
    isRu.mockReturnValue(true)
    ctx.session.subscription = 'neurobase'
    // @ts-ignore: override readonly message for test
    ctx.message = { text: '⭐️ Звездами' }
    await paymentSceneStarsHandler(ctx)
    expect(buyMock).toHaveBeenCalledWith({ ctx, isRu: true })
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('stars handler: stars subscription calls handleSelectStars and leaves', async () => {
    isRu.mockReturnValue(false)
    ctx.session.subscription = 'stars'
    // @ts-ignore: override readonly message for test
    ctx.message = { text: '⭐️ Stars' }
    await paymentSceneStarsHandler(ctx)
    expect(starsMock).toHaveBeenCalledWith({
      ctx,
      isRu: false,
      starAmounts: expect.any(Array),
    })
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('stars handler: no subscription calls handleSelectStars and leaves', async () => {
    isRu.mockReturnValue(true)
    // @ts-ignore: allow undefined subscription scenario
    ctx.session.subscription = undefined
    // @ts-ignore: override readonly message for test
    ctx.message = { text: '⭐️ Звездами' }
    await paymentSceneStarsHandler(ctx)
    expect(starsMock).toHaveBeenCalledWith({
      ctx,
      isRu: true,
      starAmounts: expect.any(Array),
    })
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('rubles handler: subscription neurophoto enters getEmailWizard', async () => {
    isRu.mockReturnValue(false)
    ctx.session.subscription = 'neurophoto'
    // @ts-ignore: override readonly update for test
    ctx.update = { callback_query: { data: '💳 Рублями' } }
    await paymentSceneRublesHandler(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('getEmailWizard')
  })

  it('rubles handler: stars subscription enters emailWizard', async () => {
    isRu.mockReturnValue(true)
    ctx.session.subscription = 'stars'
    // @ts-ignore: override readonly update for test
    ctx.update = { callback_query: { data: '💳 Рублями' } }
    await paymentSceneRublesHandler(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('emailWizard')
  })

  it('rubles handler: unknown subscription replies error and leaves', async () => {
    isRu.mockReturnValue(true)
    // @ts-ignore: allow invalid subscription for test
    ctx.session.subscription = 'foo'
    // @ts-ignore: override readonly update for test
    ctx.update = { callback_query: { data: '💳 Рублями' } }
    await paymentSceneRublesHandler(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Сначала выберите подписку или пакет звезд для покупки.'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('menu handler: enters menuScene', async () => {
    // @ts-ignore: allow invalid subscription for test
    ctx.session.subscription = 'anything'
    // @ts-ignore: override readonly message for test
    ctx.message = { text: '🏠 Главное меню' }
    await paymentSceneMenuHandler(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })
})
