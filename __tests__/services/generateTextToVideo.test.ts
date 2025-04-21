import makeMockContext from '../utils/mockTelegrafContext'

// Mock logger to provide named export 'logger'
jest.mock('@/utils/logger', () => ({ logger: { info: jest.fn() } }))
import { logger } from '@/utils/logger'
import { generateTextToVideo } from '@/services/generateTextToVideo'

describe('generateTextToVideo', () => {
  const prompt = 'Test prompt'
  const videoModel = 'modelX'
  const userId = '42'
  const username = 'user'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('logs info with Russian flag', async () => {
    await expect(
      generateTextToVideo(prompt, videoModel, userId, username, true)
    ).resolves.toBeUndefined()
    expect(logger.info).toHaveBeenCalledWith('Генерация видео:', {
      prompt,
      videoModel,
      userId,
      username,
      isRu: true,
    })
  })

  it('logs info with English flag', async () => {
    await expect(
      generateTextToVideo(prompt, videoModel, userId, username, false)
    ).resolves.toBeUndefined()
    expect(logger.info).toHaveBeenCalledWith('Генерация видео:', {
      prompt,
      videoModel,
      userId,
      username,
      isRu: false,
    })
  })
})