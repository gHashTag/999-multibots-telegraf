/**
 * Тесты для сцены подписок (subscriptionScene)
 */
import { subscriptionScene } from '../../src/scenes/subscriptionScene'
import makeMockContext from '../utils/mockTelegrafContext'
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Markup, Composer } from 'telegraf'
import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Мокаем внешние зависимости
jest.mock('../../src/helpers', () => ({
  // @ts-ignore
  isRussian: jest.fn(),
}))

describe('subscriptionScene', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('step 0: displays subscription info and options', async () => {
    const ctx = makeMockContext()
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(true)
    const step0 = Composer.unwrap(subscriptionScene.steps[0])
    await step0(ctx, async () => {})
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

  it('step 0: handles error during data fetch', async () => {
    const err = new Error('fail')
    // @ts-ignore: jest.Mock typing workaround for mockRejectedValueOnce
    // Передаем мок reply в первый аргумент update
    const ctx = makeMockContext({ 
      // @ts-ignore
      reply: jest.fn<() => Promise<any>>().mockRejectedValueOnce(err) 
    })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(false)
    const step0 = Composer.unwrap(subscriptionScene.steps[0])
    await step0(ctx, async () => {})
    // После ошибки должен быть отправлен текст об ошибке и exit
    expect(ctx.reply).toHaveBeenCalledWith('Error displaying tariffs.')
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: processes valid callback data', async () => {
    // Передаем callback_query в update
    const ctx = makeMockContext({ callback_query: { data: 'neurobase' } as any })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(true)
    const step1 = Composer.unwrap(subscriptionScene.steps[1])
    await step1(ctx, async () => {})
    expect(ctx.session.subscription).toBe('neurobase')
    expect(ctx.scene.enter).toHaveBeenCalledWith('paymentScene')
  })

  it('step 1: leaves scene on mainmenu callback', async () => {
    // Передаем callback_query в update
    const ctx = makeMockContext({ callback_query: { data: 'mainmenu' } as any })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(true)
    const step1 = Composer.unwrap(subscriptionScene.steps[1])
    await step1(ctx, async () => {})
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  it('step 1: replies on unknown callback data', async () => {
    // Передаем callback_query в update
    const ctx = makeMockContext({ callback_query: { data: 'foo' } as any })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(true)
    const step1 = Composer.unwrap(subscriptionScene.steps[1])
    await step1(ctx, async () => {})
    expect(ctx.answerCbQuery).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      'Неизвестный выбор. Пожалуйста, используйте кнопки.'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: handles message instead of callback', async () => {
    // Создаем контекст без callback_query (по умолчанию будет message)
    const ctx = makeMockContext({ message: { text: 'some text' } as any })
    // @ts-ignore: requireMock returns unknown
    const isRu = (jest.requireMock('../../src/helpers') as any).isRussian
    isRu.mockReturnValue(false)
    const step1 = Composer.unwrap(subscriptionScene.steps[1])
    await step1(ctx, async () => {})
    expect(ctx.reply).toHaveBeenCalledWith(
      'Please select a tariff using the buttons.'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
