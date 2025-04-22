import { generateTextToImage } from '@/services/generateTextToImage'
import { logger } from '@/utils/logger'
import { MyContext } from '@/interfaces'
import makeMockContext from '../utils/mockTelegrafContext'

describe('generateTextToImage', () => {
  let ctx: MyContext
  let infoSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    // Spy on logger.info и возвращаем logger для корректной типизации
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger)
    // Используем makeMockContext
    ctx = makeMockContext()
    // ctx.reply уже мокается в makeMockContext
    // ctx = { reply: jest.fn() }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('logs info and replies in Russian when isRu=true', async () => {
    const prompt = 'test'
    const model = 'mod'
    const count = 2
    const userId = 'u1'
    const botName = 'bot'
    await generateTextToImage(prompt, model, count, userId, true, ctx, botName)
    expect(infoSpy).toHaveBeenCalledWith('Генерация изображения:', {
      prompt,
      model,
      count,
      userId,
      isRu: true,
      botName,
    })
    expect(ctx.reply).toHaveBeenCalledWith(
      'Функция генерации изображений временно недоступна.'
    )
  })

  it('logs info and replies in English when isRu=false', async () => {
    const prompt = 'test2'
    const model = 'mod2'
    const count = 1
    const userId = 'u2'
    const botName = 'bot2'
    await generateTextToImage(prompt, model, count, userId, false, ctx, botName)
    expect(infoSpy).toHaveBeenCalledWith('Генерация изображения:', {
      prompt,
      model,
      count,
      userId,
      isRu: false,
      botName,
    })
    expect(ctx.reply).toHaveBeenCalledWith(
      'Image generation function is temporarily unavailable.'
    )
  })
})
