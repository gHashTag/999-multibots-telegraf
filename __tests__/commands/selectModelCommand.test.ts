import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
const mockGetAvailableModels = jest.fn()
jest.mock('../../src/commands/selectModelCommand/getAvailableModels', () => ({
  getAvailableModels: () => mockGetAvailableModels(),
}))
const mockSendGenericError = jest.fn()
jest.mock('../../src/menu', () => ({
  sendGenericErrorMessage: (ctx: any, isRu: boolean, err: any) => mockSendGenericError(ctx, isRu, err),
}))

// Import after mocks
import { selectModelCommand } from '../../src/commands/selectModelCommand'
import { getAvailableModels } from '../../src/commands/selectModelCommand/getAvailableModels'
import { sendGenericErrorMessage } from '../../src/menu'

describe('selectModelCommand', () => {
  let ctx: ReturnType<typeof makeMockContext>

  beforeEach(() => {
    ctx = makeMockContext()
    jest.clearAllMocks()
  })

  it('replies with model selection keyboard in Russian', async () => {
    ctx.from.language_code = 'ru'
    mockGetAvailableModels.mockResolvedValue(['m1', 'm2', 'm3', 'm4'])
    await selectModelCommand(ctx)
    expect(mockGetAvailableModels).toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      '🧠 Выберите модель:',
      expect.any(Object)
    )
  })

  it('replies with model selection keyboard in English', async () => {
    ctx.from.language_code = 'en'
    mockGetAvailableModels.mockResolvedValue(['x'])
    await selectModelCommand(ctx)
    expect(ctx.reply).toHaveBeenCalledWith(
      '🧠 Select AI Model:',
      expect.any(Object)
    )
  })

  it('calls sendGenericErrorMessage on failure', async () => {
    ctx.from.language_code = 'en'
    const error = new Error('fail')
    mockGetAvailableModels.mockRejectedValue(error)
    await selectModelCommand(ctx)
    expect(mockSendGenericError).toHaveBeenCalledWith(ctx, false, error)
  })
})