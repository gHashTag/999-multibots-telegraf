import makeMockContext from '../utils/mockTelegrafContext'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { Message } from 'telegraf/typings/core/types/typegram' // Импорт для типа TextMessage
import { UserFromGetMe } from 'telegraf/typings/manage' // Импорт для типа UserFromGetMe

// Mock external dependencies via alias paths
jest.mock('@/helpers/images/createImagesZip', () => ({
  createImagesZip: jest.fn(),
}))
jest.mock('@/core/supabase', () => ({
  ensureSupabaseAuth: jest.fn(),
}))
jest.mock('@/services/createModelTraining', () => ({
  createModelTraining: jest.fn(),
}))
jest.mock('@/helpers', () => ({
  deleteFile: jest.fn(),
}))
jest.mock('@/menu', () => ({
  sendGenericErrorMessage: jest.fn(),
}))

import { uploadTrainFluxModelScene } from '@/scenes/uploadTrainFluxModelScene'
import { createImagesZip } from '@/helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '@/core/supabase'
import { createModelTraining } from '@/services/createModelTraining'
import { deleteFile } from '@/helpers'
import { sendGenericErrorMessage } from '@/menu'
import { MySession } from '@/interfaces' // Импортируем MySession

describe('uploadTrainFluxModelScene', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const zipPath = '/tmp/test.zip'

  // Предполагаем, что сцена использует enterHandler
  const sceneHandler = uploadTrainFluxModelScene.enterHandler

  // Мок для функции next
  const mockNext = (): Promise<void> => Promise.resolve()

  beforeEach(() => {
    jest.clearAllMocks()
    // Создаем полный мок botInfo
    const mockBotInfo: UserFromGetMe = {
      id: 1,
      is_bot: true,
      first_name: 'BotY',
      username: 'botY',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    }
    ctx = makeMockContext({}, {}, { botInfo: mockBotInfo })
    // Создаем мок session
    const sessionData: MySession = {
      images: [
        { buffer: Buffer.from('img1'), filename: 'img1.jpg' },
        { buffer: Buffer.from('img2'), filename: 'img2.jpg' },
      ], // Используем объекты с буфером
      username: 'userX',
      modelName: 'model1',
      steps: 1234,
      targetUserId: 5678,
      activeWizard: false,
      wizards: {},
      scene: { current: 'uploadTrainFluxModelScene', state: {} },
      selectedPayment: null,
      userProfile: null,
      cursor: 0,
      email: null,
    }
    ctx.session = sessionData // Присваиваем полную сессию

    // Мокаем ctx.reply правильно
    ctx.reply = jest.fn(
      async (_text: string, _extra?: any): Promise<Message.TextMessage> => {
        // Возвращаем мок TextMessage
        return {
          message_id: Date.now(),
          date: Date.now() / 1000,
          chat: { id: 1, type: 'private' }, // Пример
          text: _text,
          from: { id: 1, is_bot: true, first_name: 'bot' }, // Пример
        } as Message.TextMessage
      }
    )
    ctx.scene = { enter: jest.fn(), leave: jest.fn() } as any
    // Типизируем моки
    ;(
      createImagesZip as jest.Mock<() => Promise<string | null>>
    ).mockResolvedValue(zipPath)
    ;(ensureSupabaseAuth as jest.Mock<() => Promise<void>>).mockResolvedValue()
  })

  it('executes full flow for valid triggerWord', async () => {
    if (!sceneHandler) throw new Error('Scene handler is not defined')
    await sceneHandler(ctx, mockNext) // Используем mockNext
    // Archive creation
    expect(ctx.reply).toHaveBeenCalledWith('⏳ Создаю архив...')
    expect(createImagesZip).toHaveBeenCalledWith(ctx.session.images)
    // Supabase auth
    expect(ensureSupabaseAuth).toHaveBeenCalled()
    // Uploading archive
    expect(ctx.reply).toHaveBeenCalledWith('⏳ Загружаю архив...')
    // TriggerWord uppercase
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('⏳ Начинаю обучение модели')
    )
    // Model training
    expect(createModelTraining).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: zipPath,
        triggerWord: 'USERX',
        modelName: 'model1',
        steps: 1234,
        telegram_id: '5678', // Преобразуем targetUserId в строку
        is_ru: true,
        botName: 'botY',
      }),
      ctx
    )
    // File cleanup
    expect(deleteFile).toHaveBeenCalledWith(zipPath)
    // Scene leave
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('handles missing triggerWord by replying error and leaving', async () => {
    if (!sceneHandler) throw new Error('Scene handler is not defined')
    ctx.session.username = ''
    await sceneHandler(ctx, mockNext) // Используем mockNext
    // Archive creation still occurs
    expect(createImagesZip).toHaveBeenCalledWith(ctx.session.images)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Некорректный trigger word')
    expect(ctx.scene.leave).toHaveBeenCalled()
    // Supabase auth occurs before triggerWord check
    expect(ensureSupabaseAuth).toHaveBeenCalled()
    expect(createModelTraining).not.toHaveBeenCalled()
    expect(deleteFile).not.toHaveBeenCalled() // Проверяем, что deleteFile не вызывался
  })
})
