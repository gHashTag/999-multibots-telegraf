// Мокаем зависимости
jest.mock('@/handlers', () => ({ getSubScribeChannel: jest.fn() }))
jest.mock('@/helpers', () => ({ isRussian: jest.fn() }))
jest.mock('@/menu', () => ({ mainMenu: jest.fn() }))
jest.mock('@/core/supabase', () => ({ getReferalsCountAndUserData: jest.fn() }))
jest.mock('@/helpers/error', () => ({ errorMessage: jest.fn() }))

import { handleQuestRules, handleQuestComplete } from '@/scenes/levelQuestWizard/handlers'
import makeMockContext from '../utils/mockTelegrafContext'
import { getSubScribeChannel } from '@/handlers'
import { isRussian } from '@/helpers'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { mainMenu } from '@/menu'
import { errorMessage } from '@/helpers/error'

describe('levelQuestWizard handlers', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    ctx.from = { id: 99, language_code: 'ru' }
  })

  describe('handleQuestRules', () => {
    it('replies with rules message in Russian', async () => {
      ;(isRussian as jest.Mock).mockReturnValue(true)
      ;(getSubScribeChannel as jest.Mock).mockReturnValue('chan123')
      await handleQuestRules(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Добро пожаловать'),
        { parse_mode: 'HTML' }
      )
    })

    it('calls errorMessage on exception', async () => {
      ;(isRussian as jest.Mock).mockReturnValue(false)
      ;(getSubScribeChannel as jest.Mock).mockImplementation(() => { throw new Error('fail') })
      await expect(handleQuestRules(ctx)).rejects.toThrow('fail')
      expect(errorMessage).toHaveBeenCalledWith(ctx, expect.any(Error), false)
    })
  })

  describe('handleQuestComplete', () => {
    it('replies with completion message and keyboard', async () => {
      ;(isRussian as jest.Mock).mockReturnValue(false)
      ;(getReferalsCountAndUserData as jest.Mock).mockResolvedValue({ count: 5, subscription: 'sub', level: 3 })
      ;(mainMenu as jest.Mock).mockReturnValue({ reply_markup: { keyboard: [['m']] } })
      await handleQuestComplete(ctx)
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('NeuroQuest completed'),
        { reply_markup: { keyboard: [['m']] } }
      )
    })

    it('calls errorMessage on exception', async () => {
      ;(isRussian as jest.Mock).mockReturnValue(true)
      ;(getReferalsCountAndUserData as jest.Mock).mockRejectedValue(new Error('oops'))
      await expect(handleQuestComplete(ctx)).rejects.toThrow('oops')
      expect(errorMessage).toHaveBeenCalledWith(ctx, expect.any(Error), true)
    })
  })
})