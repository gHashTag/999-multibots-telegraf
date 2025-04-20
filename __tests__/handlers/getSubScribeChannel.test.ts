// Mock logger methods
jest.mock('@/utils/logger', () => ({
  warn: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
}))
const logger = require('@/utils/logger')

import { getSubScribeChannel } from '@/handlers/getSubScribeChannel'

describe('handlers/getSubScribeChannel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns default channel and logs warning when ctx is falsy', () => {
    const channel = getSubScribeChannel(null as any)
    expect(channel).toBe('neuro_blogger_group')
    expect(logger.warn).toHaveBeenCalledWith(
      '⚠️ Контекст или ID бота отсутствует, возвращаем канал по умолчанию'
    )
  })

  it('returns default channel and logs warning when botId is missing', () => {
    const channel = getSubScribeChannel({} as any)
    expect(channel).toBe('neuro_blogger_group')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('returns correct channel and logs debug for known botId bot2', () => {
    const ctx: any = { botId: 'bot2' }
    const channel = getSubScribeChannel(ctx)
    expect(channel).toBe('MetaMuse_AI_Influencer')
    expect(logger.debug).toHaveBeenCalledWith(
      '🔍 Для бота bot2 определен канал: MetaMuse_AI_Influencer'
    )
  })

  it('returns correct channel and logs debug for known botId bot3', () => {
    const ctx: any = { botId: 'bot3' }
    const channel = getSubScribeChannel(ctx)
    expect(channel).toBe('motionly_tech')
    expect(logger.debug).toHaveBeenCalledWith(
      '🔍 Для бота bot3 определен канал: motionly_tech'
    )
  })

  it('returns default channel and logs info when botId unknown', () => {
    const ctx: any = { botId: 'unknownBot' }
    const channel = getSubScribeChannel(ctx)
    expect(channel).toBe('neuro_blogger_group')
    expect(logger.info).toHaveBeenCalledWith(
      'ℹ️ Для бота unknownBot не найден канал, используем канал по умолчанию'
    )
  })
})