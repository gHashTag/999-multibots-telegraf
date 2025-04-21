import { setBotCommands } from '../../src/setCommands'
import { Telegraf } from 'telegraf'
import { botLogger } from '../../src/utils/logger'
import { MyContext } from '../../src/interfaces'

describe('setBotCommands', () => {
  let mockBot: any

  beforeEach(() => {
    mockBot = {
      botInfo: { username: 'testbot' },
      telegram: {
        setMyCommands: jest.fn().mockResolvedValue(undefined),
      },
    }
    jest.spyOn(botLogger, 'info').mockImplementation(() => {})
    jest.spyOn(botLogger, 'error').mockImplementation(() => {})
  })

  it('should set commands and return true on success', async () => {
    const result = await setBotCommands(mockBot as Telegraf<MyContext>)
    expect(mockBot.telegram.setMyCommands).toHaveBeenCalledWith([
      { command: 'start', description: '👤 Start / Начать' },
      { command: 'menu', description: '👤 Menu / Главное меню' },
    ])
    expect(botLogger.info).toHaveBeenCalledWith(
      'testbot',
      expect.stringContaining('Установка команд')
    )
    expect(botLogger.info).toHaveBeenCalledWith(
      'testbot',
      expect.stringContaining('успешно')
    )
    expect(result).toBe(true)
  })

  it('should return false and log error on failure', async () => {
    const error = new Error('fail')
    mockBot.telegram.setMyCommands.mockRejectedValue(error)
    const result = await setBotCommands(mockBot as Telegraf<MyContext>)
    expect(botLogger.error).toHaveBeenCalledWith(
      'testbot',
      expect.stringContaining('Ошибка при установке команд')
    )
    expect(result).toBe(false)
  })
})