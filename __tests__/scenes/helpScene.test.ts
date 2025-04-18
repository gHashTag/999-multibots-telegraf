import { jest, describe, beforeEach, it, expect } from '@jest/globals'
// Мокаем внешние зависимости
jest.mock('@/scenes/levelQuestWizard/handlers', () => ({
  handleLevel1: jest.fn(),
  handleLevel2: jest.fn(),
  handleLevel3: jest.fn(),
  handleLevel4: jest.fn(),
  handleLevel5: jest.fn(),
  handleLevel6: jest.fn(),
  handleLevel7: jest.fn(),
  handleLevel8: jest.fn(),
  handleLevel9: jest.fn(),
  handleLevel10: jest.fn(),
  handleLevel11: jest.fn(),
  handleLevel12: jest.fn(),
  handleLevel13: jest.fn(),
}))
jest.mock('@/menu', () => ({ mainMenu: jest.fn() }))
jest.mock('@/helpers', () => ({ isRussian: jest.fn() }))
jest.mock('@/core/supabase', () => ({ getReferalsCountAndUserData: jest.fn() }))

import { helpSceneEnterHandler } from '@/scenes/helpScene'
import makeMockContext from '../utils/mockTelegrafContext'
import { handleLevel1 } from '@/scenes/levelQuestWizard/handlers'
import { mainMenu } from '@/menu'
import { isRussian } from '@/helpers'
import { getReferalsCountAndUserData } from '@/core/supabase'

describe('helpSceneEnterHandler', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.resetAllMocks()
    ctx = makeMockContext()
    ctx.from = { id: 42, language_code: 'ru' }
    ctx.session = { mode: '' }
  })

  it('calls level handler and mainMenu for digital_avatar_body mode', async () => {
    ctx.session.mode = 'digital_avatar_body'
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    ;(getReferalsCountAndUserData as jest.Mock).mockResolvedValueOnce({
      count: 3,
      subscription: 'sub1',
      level: 5,
    })
    await helpSceneEnterHandler(ctx)
    expect(handleLevel1).toHaveBeenCalledWith(ctx)
    expect(mainMenu).toHaveBeenCalledWith({
      isRu: true,
      inviteCount: 3,
      subscription: 'sub1',
      ctx,
      level: 5,
    })
  })

  it('enters step0 for help mode', async () => {
    ctx.session.mode = 'help'
    ;(isRussian as jest.Mock).mockReturnValueOnce(false)
    ;(getReferalsCountAndUserData as jest.Mock).mockResolvedValueOnce({ count: 0, subscription: '', level: 0 })
    await helpSceneEnterHandler(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('step0')
  })

  it('handles errors by replying to user', async () => {
    ctx.session.mode = 'digital_avatar_body'
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    ;(getReferalsCountAndUserData as jest.Mock).mockRejectedValueOnce(new Error('fail'))
    await helpSceneEnterHandler(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      'Произошла ошибка. Пожалуйста, попробуйте снова.'
    )
  })
})