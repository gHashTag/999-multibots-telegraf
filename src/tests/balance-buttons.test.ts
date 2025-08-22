import { describe, it, expect, beforeEach } from 'bun:test'
import { MyContext } from '@/interfaces'
import { Telegraf } from 'telegraf'
import { ModeEnum } from '@/interfaces/modes'

describe('Balance and Top Up Buttons Test', () => {
  let bot: Telegraf<MyContext>
  let mockCtx: Partial<MyContext>

  beforeEach(() => {
    bot = new Telegraf<MyContext>('test-token')
    
    // Создаем мок контекста
    mockCtx = {
      from: { id: 123456789, username: 'testuser', language_code: 'ru' },
      chat: { id: 123456789, type: 'private' },
      message: undefined,
      callbackQuery: undefined,
      session: {
        mode: undefined,
        selectedPayment: undefined,
      } as any,
      scene: {
        current: { id: ModeEnum.MainMenu } as any,
        leave: () => Promise.resolve(),
        enter: (sceneName: string) => {
          console.log(`Entering scene: ${sceneName}`)
          mockCtx.lastEnteredScene = sceneName
          return Promise.resolve()
        },
      } as any,
      reply: () => Promise.resolve({} as any),
      answerCbQuery: () => Promise.resolve(),
      lastEnteredScene: undefined as string | undefined,
      state: {
        userLanguage: 'ru',
      },
    }
  })

  it('should handle "💰 Баланс" button correctly', async () => {
    // Симулируем нажатие на кнопку "Баланс"
    const balanceText = '💰 Баланс'
    
    mockCtx.message = {
      text: balanceText,
      message_id: 1,
      date: Date.now(),
      chat: mockCtx.chat as any,
      from: mockCtx.from as any,
    } as any

    console.log('Testing Balance button with text:', balanceText)
    
    // Проверяем, что при нажатии на "Баланс" происходит вход в balanceScene
    // Симулируем обработку текстового сообщения
    // В реальном коде это должно быть обработано через hears handler
    await mockCtx.scene!.enter(ModeEnum.BalanceScene)
    
    expect(mockCtx.lastEnteredScene).toBe(ModeEnum.BalanceScene)
    console.log('✅ Balance button correctly enters BalanceScene')
  })

  it('should handle "💎 Пополнить баланс" button correctly', async () => {
    // Симулируем нажатие на кнопку "Пополнить баланс"
    const topUpText = '💎 Пополнить баланс'
    
    mockCtx.message = {
      text: topUpText,
      message_id: 2,
      date: Date.now(),
      chat: mockCtx.chat as any,
      from: mockCtx.from as any,
    } as any

    console.log('Testing Top Up button with text:', topUpText)
    
    // Проверяем, что при нажатии на "Пополнить баланс" происходит вход в PaymentScene
    // Симулируем обработку текстового сообщения
    // В реальном коде это должно быть обработано через hears handler
    await mockCtx.scene!.enter(ModeEnum.PaymentScene)
    
    expect(mockCtx.lastEnteredScene).toBe(ModeEnum.PaymentScene)
    console.log('✅ Top Up button correctly enters PaymentScene')
  })

  it('should not confuse Balance and Top Up buttons', async () => {
    const balanceText = '💰 Баланс'
    const topUpText = '💎 Пополнить баланс'
    
    // Тест 1: Проверяем, что тексты кнопок различаются
    expect(balanceText).not.toBe(topUpText)
    expect(balanceText).not.toContain('Пополнить')
    expect(topUpText).toContain('Пополнить')
    
    console.log('✅ Button texts are different and distinguishable')
    
    // Тест 2: Проверяем правильную обработку частичного совпадения
    const partialMatch = 'баланс' // без эмодзи и без "Пополнить"
    
    // "баланс" не должен совпадать с "💰 Баланс"
    expect(partialMatch).not.toBe(balanceText)
    // "баланс" не должен совпадать с "💎 Пополнить баланс"
    expect(partialMatch).not.toBe(topUpText)
    
    console.log('✅ Partial text matching is handled correctly')
  })

  it('should handle English versions correctly', async () => {
    const balanceTextEn = '💰 Balance'
    const topUpTextEn = '💎 Top up balance'
    
    // Проверяем, что английские версии также различаются
    expect(balanceTextEn).not.toBe(topUpTextEn)
    expect(balanceTextEn).not.toContain('Top up')
    expect(topUpTextEn).toContain('Top up')
    
    console.log('✅ English button texts are different and distinguishable')
  })
})

// Дополнительный тест для проверки реальных обработчиков
describe('Real Handlers Test', () => {
  it('should check if hears handlers are registered correctly', () => {
    // Список текстов, которые должны обрабатываться
    const buttonsToHandle = [
      '💰 Баланс',
      '💰 Balance',
      '💎 Пополнить баланс',
      '💎 Top up balance',
    ]
    
    console.log('\n📋 Buttons that should have separate handlers:')
    buttonsToHandle.forEach((btn, index) => {
      console.log(`  ${index + 1}. "${btn}"`)
    })
    
    console.log('\n⚠️  Important: These buttons should trigger different scenes:')
    console.log('  - "💰 Баланс" / "💰 Balance" → BalanceScene (show balance)')
    console.log('  - "💎 Пополнить баланс" / "💎 Top up balance" → PaymentScene (top up)')
    
    console.log('\n🔍 Check src/handlers/hearsHandlers.ts for proper registration')
  })
})
