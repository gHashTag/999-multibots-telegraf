/**
 * Тесты для нейрофото-сцены (neuroPhotoWizard)
 */
import { neuroPhotoWizard } from '../../src/scenes/neuroPhotoWizard'
import makeMockContext from '../utils/mockTelegrafContext'
import { Composer } from 'telegraf'
import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { MySession } from '@/interfaces' // Убираем User
import { User } from 'telegraf/typings/core/types/typegram' // Импортируем User отсюда
import { Markup } from 'telegraf' // Импортируем Markup

// Мокаем зависимости
jest.mock('@/handlers/getUserInfo')
jest.mock('@/core/supabase')
jest.mock('@/services/generateNeuroImage')
jest.mock('@/menu')
jest.mock('@/handlers/handleHelpCancel')
jest.mock('@/handlers')

// Импортируем мокированные версии
import { getUserInfo } from '@/handlers/getUserInfo'
import { getLatestUserModel, getReferalsCountAndUserData } from '@/core/supabase'
import { generateNeuroImage } from '@/services/generateNeuroImage'
import { mainMenu, sendPhotoDescriptionRequest, sendGenericErrorMessage } from '@/menu'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { handleMenu } from '@/handlers'

// Типизируем моки (теперь можно использовать импорты)
const mockedGetUserInfo = getUserInfo as jest.Mock
const mockedGetLatestModel = getLatestUserModel as jest.Mock
const mockedGetReferals = getReferalsCountAndUserData as jest.Mock
const mockedGenerateImage = generateNeuroImage as jest.Mock
const mockedMainMenu = mainMenu as jest.Mock<() => Promise<{text: string, keyboard: Markup.Markup<any>}>> // Типизируем mainMenu
const mockedSendDescRequest = sendPhotoDescriptionRequest as jest.Mock
const mockedSendGenericError = sendGenericErrorMessage as jest.Mock
const mockedHandleHelpCancel = handleHelpCancel as jest.Mock<(...args: any[]) => Promise<boolean>>
const mockedHandleMenu = handleMenu as jest.Mock

describe('neuroPhotoWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Настраиваем мок mainMenu (если он используется в этой сцене)
    mockedMainMenu.mockResolvedValue({ text: 'Menu', keyboard: Markup.keyboard([['Btn']]).reply_markup })
  })

  it('должна выйти, если нет обученной модели', async () => {
    const ctx = makeMockContext()
    // Настраиваем моки
    mockedGetUserInfo.mockReturnValue({ userId: 'u1', telegramId: 't1' })
    mockedGetLatestModel.mockResolvedValueOnce(null)
    mockedGetReferals.mockResolvedValueOnce({
      count: 0,
      subscription: 'stars',
      level: 1,
    })
    // Вызываем первый шаг
    // @ts-ignore
    const step = neuroPhotoWizard.steps[0]
    await step(ctx)
    // Должна быть попытка уйти из сцены
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('должна запросить описание и перейти к следующему шагу, если модель есть и не отмена', async () => {
    const ctx = makeMockContext()
    mockedGetUserInfo.mockReturnValue({ userId: 'u2', telegramId: 't2' })
    mockedGetLatestModel.mockResolvedValueOnce({
      model_url: 'url1',
      trigger_word: 'tw',
    })
    mockedGetReferals.mockResolvedValueOnce({
      count: 5,
      subscription: 'premium',
      level: 2,
    })
    mockedHandleHelpCancel.mockResolvedValueOnce(false)
    // @ts-ignore
    const step = neuroPhotoWizard.steps[0]
    await step(ctx)
    expect(mockedSendDescRequest).toHaveBeenCalledWith(ctx, true, 'neuro_photo')
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('должна выйти из сцены, если отмена при запросе описания', async () => {
    const ctx = makeMockContext()
    mockedGetUserInfo.mockReturnValue({ userId: 'u3', telegramId: 't3' })
    mockedGetLatestModel.mockResolvedValueOnce({
      model_url: 'url2',
      trigger_word: 'x',
    })
    mockedGetReferals.mockResolvedValueOnce({
      count: 1,
      subscription: 'basic',
      level: 1,
    })
    mockedHandleHelpCancel.mockResolvedValueOnce(true)
    // @ts-ignore
    const step = neuroPhotoWizard.steps[0]
    await step(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
  })

  it('в шаге промпта генерит изображение и next', async () => {
    const userModel = { model_url: 'url3', trigger_word: 'tg' }
    // @ts-ignore: override readonly properties for test
    // @ts-ignore: override readonly properties for test
    const ctx = makeMockContext(
      {},
      { session: { userModel }, message: { text: 'hello' } }
    )
    mockedHandleHelpCancel.mockResolvedValueOnce(false)
    // @ts-ignore
    const step = neuroPhotoWizard.steps[1]
    await step(ctx)
    expect(ctx.session.prompt).toBe('hello')
    expect(mockedGenerateImage).toHaveBeenCalled()
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('в кнопочном шаге переходит в improvePromptWizard на кнопку улучшить', async () => {
    // @ts-ignore: override readonly properties for test
    // @ts-ignore: override readonly properties for test
    const ctx = makeMockContext({}, { message: { text: '⬆️ Улучшить промпт' } })
    // @ts-ignore
    const step = neuroPhotoWizard.steps[2]
    await step(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('improvePromptWizard')
  })
})
