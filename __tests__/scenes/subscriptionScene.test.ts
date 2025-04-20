/**
 * Тесты для сцены подписок (subscriptionScene)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { subscriptionScene } from '../../src/scenes/subscriptionScene'
import makeMockContext from '../utils/mockTelegrafContext'
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Markup } from 'telegraf'

// Мокаем внешние зависимости
jest.mock('../../src/helpers', () => ({
  // @ts-ignore
  isRussian: jest.fn(),
}))

describe('subscriptionScene', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('первый шаг: отправляет меню подписок и вызывает next()', async () => {
    const ctx = makeMockContext()
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(true)
    // @ts-ignore
    const step0 = subscriptionScene.steps[0]
    await step0(ctx)
    // Проверяем, что reply был вызван с HTML и inline клавиатурой
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    const [text, opts] = ctx.debug.replies[0].extra
      ? [ctx.debug.replies[0].message, ctx.debug.replies[0].extra]
      : [ctx.debug.replies[0].message, {}]
    expect(typeof text).toBe('string')
    expect(opts.parse_mode).toBe('HTML')
    expect(opts.reply_markup).toBeDefined()
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('первый шаг: при ошибке отправки выходит из сцены', async () => {
    const err = new Error('fail')
    // @ts-ignore: jest.Mock typing workaround for mockRejectedValueOnce
    // @ts-ignore: jest.Mock typing workaround for mockRejectedValueOnce
    const ctx = makeMockContext(
      {},
      { reply: jest.fn().mockRejectedValueOnce(err) }
    )
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(false)
    // @ts-ignore
    const step0 = subscriptionScene.steps[0]
    await step0(ctx)
    // После ошибки должен быть отправлен текст об ошибке и exit
    expect(ctx.reply).toHaveBeenCalledWith('Error displaying tariffs.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('второй шаг: neurobase -> paymentScene', async () => {
    const update = { callback_query: { data: 'neurobase' } }
    // @ts-ignore: override readonly update property for test
    const ctx = makeMockContext({}, { update })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(true)
    // @ts-ignore
    const step1 = subscriptionScene.steps[1]
    await step1(ctx)
    expect(ctx.session.subscription).toBe('neurobase')
    expect(ctx.scene.enter).toHaveBeenCalledWith('paymentScene')
  })

  it('второй шаг: neurophoto -> paymentScene', async () => {
    // @ts-ignore: override readonly update property for test
    const ctx = makeMockContext(
      {},
      { update: { callback_query: { data: 'neurophoto' } } }
    )
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(false)
    // @ts-ignore
    const step1 = subscriptionScene.steps[1]
    await step1(ctx)
    expect(ctx.session.subscription).toBe('neurophoto')
    expect(ctx.scene.enter).toHaveBeenCalledWith('paymentScene')
  })

  it('второй шаг: mainmenu -> menuScene', async () => {
    // @ts-ignore: override readonly update property for test
    const ctx = makeMockContext(
      {},
      { update: { callback_query: { data: 'mainmenu' } } }
    )
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(true)
    // @ts-ignore
    const step1 = subscriptionScene.steps[1]
    await step1(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  it('второй шаг: неизвестный callback -> отвечает и уходит', async () => {
    // @ts-ignore: override readonly update property for test
    const ctx = makeMockContext(
      {},
      { update: { callback_query: { data: 'foo' } } }
    )
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(true)
    // @ts-ignore
    const step1 = subscriptionScene.steps[1]
    await step1(ctx)
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      'Неизвестный выбор. Пожалуйста, используйте кнопки.'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('второй шаг: не callback -> просит выбрать и уходит', async () => {
    // @ts-ignore: override readonly update property for test
    const ctx = makeMockContext({}, { update: {} })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(false)
    // @ts-ignore
    const step1 = subscriptionScene.steps[1]
    await step1(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Please select a tariff using the buttons.'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
