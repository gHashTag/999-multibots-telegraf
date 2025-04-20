/**
 * Тесты для нейрофото-сцены (neuroPhotoWizard)
 */
import { neuroPhotoWizard } from '../../src/scenes/neuroPhotoWizard'
import makeMockContext from '../utils/mockTelegrafContext'
/* eslint-disable @typescript-eslint/ban-ts-comment */

// Мокаем зависимости
jest.mock('../../src/handlers/getUserInfo', () => ({
  // @ts-ignore
  getUserInfo: jest.fn(),
}))
jest.mock('../../src/core/supabase', () => ({
  // @ts-ignore
  getLatestUserModel: jest.fn(),
  // @ts-ignore
  getReferalsCountAndUserData: jest.fn(),
}))
jest.mock('../../src/services/generateNeuroImage', () => ({
  // @ts-ignore
  generateNeuroImage: jest.fn(),
}))
jest.mock('../../src/menu', () => ({
  // @ts-ignore
  levels: { 104: { title_ru: 'RU_MENU', title_en: 'EN_MENU' } },
  // @ts-ignore
  mainMenu: jest.fn().mockResolvedValue({ reply_markup: { keyboard: [] } }),
  // @ts-ignore
  sendPhotoDescriptionRequest: jest.fn(),
  // @ts-ignore
  sendGenericErrorMessage: jest.fn(),
}))
jest.mock('../../src/handlers/handleHelpCancel', () => ({
  // @ts-ignore
  handleHelpCancel: jest.fn(),
}))
jest.mock('../../src/handlers', () => ({
  // @ts-ignore
  handleMenu: jest.fn(),
}))

describe('neuroPhotoWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('должна выйти, если нет обученной модели', async () => {
    const ctx = makeMockContext()
    // Настраиваем моки
    // @ts-ignore: requireMock returns unknown
    const getUserInfo = (
      jest.requireMock('../../src/handlers/getUserInfo') as any
    ).getUserInfo
    getUserInfo.mockReturnValue({ userId: 'u1', telegramId: 't1' })
    // @ts-ignore: requireMock returns unknown
    const sb = jest.requireMock('../../src/core/supabase') as any
    sb.getLatestUserModel.mockResolvedValueOnce(null)
    sb.getReferalsCountAndUserData.mockResolvedValueOnce({
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
    const getUserInfo = jest.requireMock(
      '../../src/handlers/getUserInfo'
    ).getUserInfo
    getUserInfo.mockReturnValue({ userId: 'u2', telegramId: 't2' })
    const sb = jest.requireMock('../../src/core/supabase')
    sb.getLatestUserModel.mockResolvedValueOnce({
      model_url: 'url1',
      trigger_word: 'tw',
    })
    sb.getReferalsCountAndUserData.mockResolvedValueOnce({
      count: 5,
      subscription: 'premium',
      level: 2,
    })
    const menu = jest.requireMock('../../src/menu')
    // @ts-ignore: requireMock returns unknown
    const sendDesc = (menu as any).sendPhotoDescriptionRequest
    // @ts-ignore: requireMock returns unknown
    const cancel = (
      jest.requireMock('../../src/handlers/handleHelpCancel') as any
    ).handleHelpCancel
    cancel.mockResolvedValueOnce(false)
    // @ts-ignore
    const step = neuroPhotoWizard.steps[0]
    await step(ctx)
    expect(sendDesc).toHaveBeenCalledWith(ctx, true, 'neuro_photo')
    expect(ctx.wizard.next).toHaveBeenCalled()
  })

  it('должна выйти из сцены, если отмена при запросе описания', async () => {
    const ctx = makeMockContext()
    const getUserInfo = jest.requireMock(
      '../../src/handlers/getUserInfo'
    ).getUserInfo
    getUserInfo.mockReturnValue({ userId: 'u3', telegramId: 't3' })
    const sb = jest.requireMock('../../src/core/supabase')
    sb.getLatestUserModel.mockResolvedValueOnce({
      model_url: 'url2',
      trigger_word: 'x',
    })
    sb.getReferalsCountAndUserData.mockResolvedValueOnce({
      count: 1,
      subscription: 'basic',
      level: 1,
    })
    const cancel = jest.requireMock(
      '../../src/handlers/handleHelpCancel'
    ).handleHelpCancel
    cancel.mockResolvedValueOnce(true)
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
    // @ts-ignore: requireMock returns unknown
    const gen = (
      jest.requireMock('../../src/services/generateNeuroImage') as any
    ).generateNeuroImage
    // @ts-ignore: requireMock returns unknown
    const cancel = (
      jest.requireMock('../../src/handlers/handleHelpCancel') as any
    ).handleHelpCancel
    cancel.mockResolvedValueOnce(false)
    // @ts-ignore
    const step = neuroPhotoWizard.steps[1]
    await step(ctx)
    expect(ctx.session.prompt).toBe('hello')
    expect(gen).toHaveBeenCalled()
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
