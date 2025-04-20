import { Composer } from 'telegraf' // Импорт Composer
import { Markup } from 'telegraf' // Импорт Markup
import { jest, describe, it, expect, beforeEach } from '@jest/globals' // Импорт Jest

// Мокаем внешние зависимости
jest.mock('@/scenes/levelQuestWizard/handlers', () => ({
  handleLevel1: jest.fn(),
  handleLevel2: jest.fn(),
  handleLevel3: jest.fn(),
  handleLevel4: jest.fn(),
  handleLevel5: jest.fn(),
  handleLevel6: jest.fn(),
  handleLevel7: jest.fn(),
  handleLevel8: jest.fn(),
  handleLevel9: jest.fn(),
  handleLevel10: jest.fn(),
  handleLevel11: jest.fn(),
  handleLevel12: jest.fn(),
  handleLevel13: jest.fn(),
}))
jest.mock('@/menu', () => ({ mainMenu: jest.fn() }))
jest.mock('@/helpers', () => ({ isRussian: jest.fn() }))
jest.mock('@/core/supabase', () => ({ getReferalsCountAndUserData: jest.fn() }))

// import { helpSceneEnterHandler } from '@/scenes/helpScene' // Закомментировано, т.к. нет такого экспорта
import { helpScene } from '../../src/scenes/helpScene'
import makeMockContext from '../utils/mockTelegrafContext'
import { handleLevel1 } from '../../src/scenes/levelQuestWizard/handlers'
import { mainMenu } from '../../src/menu'
import { isRussian } from '../../src/helpers'
import { getReferalsCountAndUserData } from '../../src/core/supabase'
import { MyContext, ModeEnum } from '../../src/interfaces'

describe('HelpScene', () => {
  let ctx: MyContext
  let step0: any // Типизируем как any временно

  beforeEach(() => {
    ctx = makeMockContext()
    jest.clearAllMocks()
    // Получаем шаг сцены
    step0 = helpScene.steps[0]
  })

  it('should send help message in Russian', async () => {
    ctx.from = { id: 42, language_code: 'ru' }
    ctx.session = { mode: '' }
    ;(isRussian as jest.Mock).mockReturnValue(true)

    // await helpSceneEnterHandler(ctx) // Удаляем использование
    await step0(ctx) // Вызываем шаг сцены

    expect(ctx.reply).toHaveBeenCalledWith(
      mainMenu.ru.text,
      mainMenu.ru.keyboard
    )
  })

  it('should send help message in English', async () => {
    ctx.from = { id: 43, language_code: 'en' }
    ctx.session = { mode: ModeEnum.DigitalAvatarBodyV2 } // Используем ModeEnum
    ;(isRussian as jest.Mock).mockReturnValue(false)

    // await helpSceneEnterHandler(ctx) // Удаляем использование
    await step0(ctx) // Вызываем шаг сцены

    expect(ctx.reply).toHaveBeenCalledWith(
      mainMenu.en.text,
      mainMenu.en.keyboard
    )
  })

  it('should handle error during message sending', async () => {
    ctx.from = { id: 44, language_code: 'en' }
    ctx.session = { mode: ModeEnum.Help } // Используем ModeEnum
    ;(isRussian as jest.Mock).mockReturnValue(false)
    const error = new Error('Send failed')
    ;(ctx.reply as jest.Mock).mockRejectedValueOnce(error)

    // await helpSceneEnterHandler(ctx) // Удаляем использование
    await expect(step0(ctx)).rejects.toThrow(error) // Вызываем шаг сцены
  })

  // ... (остальные тесты с заменой helpSceneEnterHandler на step0)

  it('should handle different modes correctly (RU)', async () => {
    ctx.from = { id: 45, language_code: 'ru' }
    ctx.session = { mode: ModeEnum.DigitalAvatarBodyV2 } // Используем ModeEnum
    ;(isRussian as jest.Mock).mockReturnValue(true)

    // await helpSceneEnterHandler(ctx) // Удаляем использование
    await step0(ctx) // Вызываем шаг сцены

    expect(ctx.reply).toHaveBeenCalledWith(
      mainMenu.ru.text,
      mainMenu.ru.keyboard
    )
    expect(ctx.session.mode).toBe(ModeEnum.MainMenu) // Проверяем смену режима
  })
})
