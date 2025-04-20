import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/services/generateNeuroImage', () => ({ generateNeuroImage: jest.fn() }))
jest.mock('@/core/replicate', () => ({ models: { neuro_coder: { key: 'model/key:tag' } } }))
jest.mock('@/commands/get100Command/prompts', () => ({ solarPunkAngelPrompt: 'test-prompt' }))

import { get100Command } from '@/commands/get100Command'
import { generateNeuroImage } from '@/services/generateNeuroImage'

describe('get100Command', () => {
  let ctx: ReturnType<typeof makeMockContext>
  const origPrompt = 'test-prompt'

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // Ensure deleteMessage exists on telegram
    ctx.telegram.deleteMessage = jest.fn()
    // default: prompt and from.id and chat.id exist
  })

  it('should throw error when from.id missing', async () => {
    // Clear from.id to simulate missing user id
    delete ctx.from.id
    await expect(get100Command(ctx)).rejects.toThrow('Message or user id not found')
    expect(ctx.reply).toHaveBeenCalledWith('Ошибка при генерации изображения !message || !ctx.from?.id')
  })

  it('should reply error and return when chat.id is missing', async () => {
    // Set prompt
    jest.mocked(require('@/commands/get100Command/prompts')).solarPunkAngelPrompt = origPrompt
    delete ctx.chat.id
    await get100Command(ctx)
    expect(ctx.reply).toHaveBeenCalledWith('Генерация изображения началась...')
    expect(ctx.reply).toHaveBeenCalledWith('Ошибка при генерации ')
    expect(generateNeuroImage).not.toHaveBeenCalled()
  })

  it('should call generateNeuroImage and deleteMessage on success', async () => {
    // spy on telegram.deleteMessage
    const deleteMsgSpy = jest.spyOn(ctx.telegram, 'deleteMessage')
    // Stub reply to return a generating message id
    ctx.reply = jest.fn().mockResolvedValue({ message_id: 123 })
    // run command
    await get100Command(ctx)
    // Should start generation
    expect(ctx.reply).toHaveBeenCalledWith('Генерация изображения началась...')
    // generateNeuroImage called with correct args
    expect(generateNeuroImage).toHaveBeenCalledWith(
      origPrompt,
      'model/key:tag',
      100,
      String(ctx.from.id),
      ctx,
      ctx.botInfo?.username
    )
    // deleteMessage called
    expect(deleteMsgSpy).toHaveBeenCalledWith(ctx.chat.id, expect.any(Number))
  })
})