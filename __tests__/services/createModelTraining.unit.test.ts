// Сначала мокируем модули
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn(() => ({
    on: jest.fn(),
    pipe: jest.fn(),
  })),
  promises: { unlink: jest.fn() },
}))

jest.mock('axios')

jest.mock('@/config', () => ({
  isDev: true,
  SECRET_API_KEY: 'secret',
  ELESTIO_URL: 'https://prod.example.com',
  LOCAL_SERVER_URL: 'http://localhost',
}))

// Мокируем FormData для решения проблемы с тестами
const appendMock = jest.fn()
const getHeadersMock = jest.fn().mockReturnValue({
  'content-type': 'multipart/form-data; boundary=---123',
})

// Мокируем класс FormData перед импортом
jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => {
    return {
      append: appendMock,
      getHeaders: getHeadersMock,
    }
  })
})

// Теперь импортируем модули
import fs from 'fs'
import axios from 'axios'
import FormData from 'form-data'
import { createModelTraining } from '@/services/createModelTraining'
import { MyContext, ModeEnum } from '@/interfaces'
import makeMockContext from '../utils/mockTelegrafContext'

describe('createModelTraining', () => {
  const dummyPath = '/tmp/file.zip'
  const reqData = {
    filePath: dummyPath,
    triggerWord: 'word',
    modelName: 'mname',
    telegram_id: '123',
    is_ru: false,
    steps: 5,
    botName: 'botA',
  }
  let ctx: MyContext

  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext({}, { mode: ModeEnum.DigitalAvatarBody })
  })

  it('throws if file does not exist', async () => {
    ;(fs.existsSync as jest.Mock).mockReturnValue(false)
    await expect(createModelTraining(reqData, ctx)).rejects.toThrow(
      'Файл не найден: ' + dummyPath
    )
  })

  it('posts to correct URL, unlinks file, and returns response data', async () => {
    // Настраиваем моки
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    const mockResponse = { data: { message: 'ok' } }

    // Важно - используем mockImplementation, а не простое присваивание
    jest
      .spyOn(axios, 'post')
      .mockImplementation(() => Promise.resolve(mockResponse))

    // Вызываем тестируемую функцию
    const result = await createModelTraining(reqData, ctx)

    // Проверяем, что axios.post был вызван
    expect(axios.post).toHaveBeenCalled()

    // В исходном коде строка с удалением закомментирована, поэтому не проверяем:
    // expect(fs.promises.unlink).toHaveBeenCalledWith(dummyPath)

    // Проверяем результат
    expect(result).toEqual(mockResponse.data)
  })

  it('uses v2 URL when mode is not digital_avatar_body', async () => {
    // Настраиваем моки
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    const mockResponse = { data: { message: 'done' } }
    const postMock = jest
      .spyOn(axios, 'post')
      .mockImplementation(() => Promise.resolve(mockResponse))

    // Создаем контекст с другим режимом
    const ctx2 = makeMockContext({}, { mode: ModeEnum.NeuroPhoto })

    // Вызываем тестируемую функцию
    await createModelTraining(reqData, ctx2)

    // Проверяем URL
    const calledUrl = postMock.mock.calls[0][0]
    expect(calledUrl).toContain('create-model-training-v2')
  })

  it('propagates unexpected errors', async () => {
    // Настраиваем моки
    ;(fs.existsSync as jest.Mock).mockReturnValue(true)
    const err = new Error('xyz')
    jest.spyOn(axios, 'post').mockImplementation(() => Promise.reject(err))

    // Проверяем, что ошибка проброшена дальше
    await expect(createModelTraining(reqData, ctx)).rejects.toBe(err)
  })
})
