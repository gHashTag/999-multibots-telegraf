// Мокаем внешние зависимые функции
jest.mock('@/core/supabase', () => ({ getReferalsCountAndUserData: jest.fn() }))

import { inviteEnter } from '@/scenes/inviteScene'
import makeMockContext from '../utils/mockTelegrafContext'
import { getReferalsCountAndUserData } from '@/core/supabase'

describe('inviteEnter', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // Настроим контекст
    ctx.from = { id: 123, language_code: 'ru' }
    ctx.botInfo = { username: 'myBot' }
  })

  it('sends invitation text and link, then enters menuScene', async () => {
    ;(getReferalsCountAndUserData as jest.Mock).mockResolvedValueOnce({ count: 7 })
    await inviteEnter(ctx)
    // Первый ответ: интро текст с количеством рефералов
    expect(ctx.reply).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Рефаралы'),
      { parse_mode: 'HTML' }
    )
    // Второй ответ: ссылка с правильным start payload
    expect(ctx.reply).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('https://t.me/myBot?start=123'),
      { parse_mode: 'HTML' }
    )
    expect(ctx.scene.enter).toHaveBeenCalledWith('menuScene')
  })

  it('handles error by notifying user', async () => {
    ;(getReferalsCountAndUserData as jest.Mock).mockRejectedValueOnce(new Error('err'))
    await inviteEnter(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка при получении данных о рефералах. Пожалуйста, попробуйте позже.'
    )
    // Ensure scene does not proceed to menu
    expect(ctx.scene.enter).not.toHaveBeenCalled()
  })
})