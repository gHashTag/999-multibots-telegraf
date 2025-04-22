// Мокаем зависимости до импортов
jest.mock('@/services/generateNeuroImage', () => jest.fn())
jest.mock('@/handlers/handleHelpCancel', () => ({
  handleHelpCancel: jest.fn(),
}))
jest.mock('@/helpers', () => ({ isRussian: jest.fn() }))
jest.mock('@/scenes/neuroCoderScene/promts', () => ({
  promptNeuroCoder: 'test prompt',
}))

import { neuroCoderScene } from '@/scenes/neuroCoderScene'
import makeMockContext from '../utils/mockTelegrafContext'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { isRussian } from '@/helpers'
import { MyContext, ModeEnum, UserModel } from '@/interfaces'
import { Scenes } from 'telegraf'

// Получаем middleware
const wizardMiddleware = neuroCoderScene.middleware()

describe('neuroCoderScene', () => {
  let ctx: MyContext
  const mockNext = jest.fn()
  const mockUserModel: UserModel = {
    model_name: '',
    trigger_word: '',
    model_url: 'placeholder/placeholder:placeholder',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockNext.mockClear()
    // Создаем базовый контекст в beforeEach
    ctx = makeMockContext(
      {
        update_id: 1,
        message: {
          message_id: 1,
          from: {
            id: 10,
            language_code: 'ru',
            is_bot: false,
            first_name: 'Test',
          },
          chat: { id: 20, type: 'private', first_name: 'Test' },
          date: Date.now(),
          text: '',
        },
      },
      { userModel: mockUserModel, targetUserId: '10' }
    )
    // Мокаем необходимые методы ctx
    ctx.reply = jest.fn() as any
    ctx.scene.leave = jest.fn() as any
    ctx.wizard.next = jest.fn() as any
  })

  it('step 0: prompts for number and advances', async () => {
    ;(isRussian as jest.Mock).mockReturnValueOnce(true)
    ctx.wizard.cursor = 0
    await wizardMiddleware(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Выберите количество изображений для генерации:',
      expect.any(Object)
    )
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('step 1: cancellation leaves', async () => {
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(true)
    ctx.wizard.cursor = 1
    await wizardMiddleware(ctx, mockNext)

    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: invalid message or missing id replies error and leaves', async () => {
    ctx = makeMockContext({ update_id: 2 })
    ctx.reply = jest.fn() as any
    ctx.scene.leave = jest.fn() as any
    ctx.wizard.next = jest.fn() as any
    ;(handleHelpCancel as jest.Mock).mockResolvedValueOnce(false)
    ctx.wizard.cursor = 1
    await wizardMiddleware(ctx, mockNext)

    expect(ctx.reply).toHaveBeenCalledWith(
      'Ошибка при выборе количества изображений.'
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('step 1: valid number triggers generateNeuroImage and leaves', async () => {
    const userId = '10'
    ctx = makeMockContext(
      {
        update_id: 3,
        message: {
          message_id: 2,
          from: {
            id: Number(userId),
            language_code: 'ru',
            is_bot: false,
            first_name: 'Test',
          },
          chat: { id: 20, type: 'private', first_name: 'Test' },
          date: Date.now(),
          text: '3',
        },
      },
      {
        mode: ModeEnum.NeuroPhoto,
        userModel: {
          model_name: '',
          trigger_word: '',
          model_url: 'placeholder/placeholder:placeholder',
        },
        targetUserId: userId,
      }
    )
    ctx.reply = jest.fn() as any
    ctx.scene.leave = jest.fn() as any
    ctx.wizard.next = jest.fn() as any
    ;(handleHelpCancel as jest.Mock).mockResolvedValue(false)
    ctx.wizard.cursor = 1
    await wizardMiddleware(ctx, mockNext)

    expect(generateNeuroImage).toHaveBeenCalledWith(
      'test prompt',
      'placeholder/placeholder:placeholder',
      3,
      userId,
      ctx,
      expect.any(String)
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
  })
})
