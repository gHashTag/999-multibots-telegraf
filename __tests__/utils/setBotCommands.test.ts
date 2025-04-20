import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Mock botLogger to capture logs
jest.mock('@/utils/logger', () => ({
  botLogger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}))

import { setBotCommands } from '@/setCommands'
import { botLogger } from '@/utils/logger'

describe('setBotCommands', () => {
  let bot: any

  beforeEach(() => {
    jest.clearAllMocks()
    bot = {
      botInfo: { username: 'testbot' },
      telegram: {
        setMyCommands: jest.fn().mockResolvedValue(undefined),
      },
    }
  })

  it('returns true and logs info on successful command setup', async () => {
    const result = await setBotCommands(bot)
    expect(result).toBe(true)
    // Initial info log and success log
    expect(botLogger.info).toHaveBeenCalledWith(
      'testbot',
      expect.stringContaining('Установка команд')
    )
    expect(botLogger.info).toHaveBeenCalledWith(
      'testbot',
      expect.stringContaining('Команды успешно установлены')
    )
    expect(botLogger.error).not.toHaveBeenCalled()
    // Verify commands set
    expect(bot.telegram.setMyCommands).toHaveBeenCalledWith([
      { command: 'start', description: '👤 Start / Начать' },
      { command: 'menu', description: '👤 Menu / Главное меню' },
    ])
  })

  it('returns false and logs error when setMyCommands throws', async () => {
    // Simulate failure
    bot.telegram.setMyCommands.mockRejectedValue(new Error('fail'))
    const result = await setBotCommands(bot)
    expect(result).toBe(false)
    expect(botLogger.info).toHaveBeenCalledWith(
      'testbot',
      expect.stringContaining('Установка команд')
    )
    expect(botLogger.error).toHaveBeenCalledWith(
      'testbot',
      expect.stringContaining('Ошибка при установке команд')
    )
  })

  it('uses "unknown" when botInfo is undefined', async () => {
    bot.botInfo = undefined
    const result = await setBotCommands(bot)
    expect(result).toBe(true)
    expect(botLogger.info).toHaveBeenCalledWith(
      'unknown',
      expect.any(String)
    )
  })
})