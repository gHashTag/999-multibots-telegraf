import makeMockContext from '../utils/mockTelegrafContext'

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

import { uploadTrainFluxModelSceneHandler } from '@/scenes/uploadTrainFluxModelScene'
import { createImagesZip } from '@/helpers/images/createImagesZip'
import { ensureSupabaseAuth } from '@/core/supabase'
import { createModelTraining } from '@/services/createModelTraining'
import { deleteFile } from '@/helpers'

describe('uploadTrainFluxModelSceneHandler', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const zipPath = '/tmp/test.zip'

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // Setup session and context fields
    ctx.session = {
      images: ['img1', 'img2'],
      username: 'userX',
      modelName: 'model1',
      steps: 1234,
      targetUserId: 5678,
    } as any
    ctx.botInfo = { username: 'botY' } as any
    ctx.reply = jest.fn()
    ctx.scene = { enter: jest.fn(), leave: jest.fn() } as any
    ;(createImagesZip as jest.Mock).mockResolvedValue(zipPath)
  })

  it('executes full flow for valid triggerWord', async () => {
    // handler call
    await uploadTrainFluxModelSceneHandler(ctx)
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
        telegram_id: '5678',
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
    ctx.session.username = ''
    await uploadTrainFluxModelSceneHandler(ctx)
    // Archive creation still occurs
    expect(createImagesZip).toHaveBeenCalledWith(ctx.session.images)
    expect(ctx.reply).toHaveBeenCalledWith('❌ Некорректный trigger word')
    expect(ctx.scene.leave).toHaveBeenCalled()
    // Supabase auth occurs before triggerWord check
    expect(ensureSupabaseAuth).toHaveBeenCalled()
    expect(createModelTraining).not.toHaveBeenCalled()
    expect(deleteFile).not.toHaveBeenCalled()
  })
})