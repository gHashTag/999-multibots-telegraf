/**
 * Tests for balanceScene
 */
import { balanceScene } from '../../src/scenes/balanceScene'
import makeMockContext from '../utils/makeMockContext'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { Composer } from 'telegraf'

// Mock getUserBalance from Supabase
jest.mock('../../src/core/supabase', () => ({
  getUserBalance: jest.fn(),
}))
import { getUserBalance } from '../../src/core/supabase'

describe('balanceScene', () => {
  let ctx: MyContext
  // Создаем next-функцию для middleware
  const next = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    next.mockClear()
  })

  it('replies with balance in Russian and enters menuScene', async () => {
    // Создаем контекст с языком ru
    ctx = makeMockContext()
    
    // Настраиваем мок для getUserBalance
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(456)

    // Получаем первый шаг wizard-сцены
    const step = Composer.unwrap(balanceScene.steps[0])

    // Вызываем шаг сцены с контекстом и next
    await step(ctx, next)

    // Проверяем, что getUserBalance был вызван с правильным ID пользователя
    expect(getUserBalance).toHaveBeenCalledWith('1')
    
    // Проверяем сообщение и переход в меню
    expect(ctx.reply).toHaveBeenCalledWith('💰✨ <b>Ваш баланс:</b> 456 ⭐️', {
      parse_mode: 'HTML',
    })
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
  })

  it('replies with balance in English and enters menuScene', async () => {
    // Создаем контекст с языком en
    ctx = makeMockContext({
      message: {
        from: { id: 1, language_code: 'en', is_bot: false, first_name: 'Test' },
      }
    })
    
    // Настраиваем мок для getUserBalance
    ;(getUserBalance as jest.Mock).mockResolvedValueOnce(789)

    // Получаем первый шаг wizard-сцены
    const step = Composer.unwrap(balanceScene.steps[0])

    // Вызываем шаг сцены с контекстом и next
    await step(ctx, next)

    // Проверяем, что getUserBalance был вызван с правильным ID пользователя
    expect(getUserBalance).toHaveBeenCalledWith('1')
    
    // Проверяем сообщение и переход в меню
    expect(ctx.reply).toHaveBeenCalledWith(
      '💰✨ <b>Your balance:</b> 789 ⭐️',
      { parse_mode: 'HTML' }
    )
    expect(ctx.scene.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
  })

  it('throws error when getUserBalance rejects', async () => {
    // Создаем контекст
    ctx = makeMockContext()
    
    // Настраиваем мок для getUserBalance, который отклоняет promise
    const error = new Error('fetch failed')
    ;(getUserBalance as jest.Mock).mockRejectedValueOnce(error)

    // Получаем первый шаг wizard-сцены
    const step = Composer.unwrap(balanceScene.steps[0])

    // Проверяем, что функция выбрасывает ошибку
    await expect(step(ctx, next)).rejects.toThrow('fetch failed')
    
    // Проверяем, что getUserBalance был вызван с правильным ID пользователя
    expect(getUserBalance).toHaveBeenCalledWith('1')
  })
})
