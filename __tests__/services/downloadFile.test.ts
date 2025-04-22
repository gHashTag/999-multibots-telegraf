import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals'
import fs from 'fs'
import axios from 'axios'
// Исправляем путь импорта
// import { downloadFile } from '../../src/services/downloadFile'
import { downloadFile } from '@/services/generateLipSync'
import { Readable, Writable } from 'stream'
import { logger } from '@/utils/logger'
import EventEmitter from 'events'

// Мокаем dotenv
jest.mock('dotenv')
// Добавляем мок конфигурации
jest.mock('@/config', () => ({
  MODE: 'development',
  TELEGRAM_BOT_TOKEN: 'test-token',
  TELEGRAM_BOT_TOKEN_ASSISTANT: 'test-token-assistant',
  BOT_USERNAME: 'test_bot',
  BOT_WEBHOOK_URL: 'https://example.com',
  BOT_ADMIN_ID: 123456,
  ASSISTANT_ADMIN_ID: 789012,
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_KEY: 'test-supabase-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-supabase-service-role-key',
  NODE_ENV: 'test',
  REPLICATE_API_TOKEN: 'test-replicate-key',
  OPENROUTER_API_KEY: 'test-openrouter-key',
  OPENAI_API_KEY: 'test-openai-key',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  HOST: '0.0.0.0',
  PORT: 3000,
  LOG_LEVEL: 'debug',
  REDIS_HOST: 'localhost',
  REDIS_PORT: 6379,
  REDIS_PASSWORD: '',
  DEFAULT_MODEL_NAME: 'test-model',
  DEFAULT_PROVIDER: 'test-provider',
  // Добавь сюда любые другие переменные, которые могут понадобиться
}))
// Мокаем зависимости
jest.mock('fs')
jest.mock('axios')
jest.mock('@/utils/logger')

// Типизируем мок axios
const mockedAxios = axios as jest.Mocked<typeof axios>
// Типизируем мок fs
const mockedFs = fs as jest.Mocked<typeof fs>

describe('downloadFile (generateLipSync version) Integration Test', () => {
  const testUrl = 'http://example.com/file.jpg'
  const testFilePath = '/tmp/downloaded_file.jpg'
  let mockAxiosResponseStream: Readable
  let mockWriteStream: EventEmitter & { close: jest.Mock; end: jest.Mock }

  beforeEach(() => {
    // Сбрасываем моки перед каждым тестом
    jest.clearAllMocks()

    // Устанавливаем необходимые переменные окружения для теста, если они нужны
    // process.env.SOME_VAR = 'test_value';

    // Настраиваем моки
    mockAxiosResponseStream = new Readable({ read() {} })

    // Создаем экземпляр EventEmitter и добавляем методы close/end
    mockWriteStream = new EventEmitter() as EventEmitter & {
      close: jest.Mock
      end: jest.Mock
    }
    mockWriteStream.close = jest.fn()
    mockWriteStream.end = jest.fn()

    mockedAxios.get.mockResolvedValue({
      data: mockAxiosResponseStream,
      headers: { 'content-type': 'image/jpeg' },
      status: 200,
    })
    mockedFs.createWriteStream.mockReturnValue(
      mockWriteStream as unknown as fs.WriteStream
    )
  })

  afterEach(() => {
    // Удаляем переменные окружения после теста
    // delete process.env.SOME_VAR;
  })

  it('should download a file successfully and save it', async () => {
    // Имитируем успешное завершение записи
    // Сначала вызываем downloadFile, потом эмитируем 'finish'
    const downloadPromise = downloadFile(testUrl, testFilePath)
    mockAxiosResponseStream.push(null) // Сигнал окончания readable стрима
    mockWriteStream.emit('finish') // Сигнал окончания writable стрима
    await expect(downloadPromise).resolves.toBeUndefined() // Проверяем, что промис разрешился

    expect(mockedAxios.get).toHaveBeenCalledWith(testUrl, {
      responseType: 'stream',
    })
    expect(mockedFs.createWriteStream).toHaveBeenCalledWith(testFilePath)
  })

  it('should reject on Axios error during download', async () => {
    const axiosError = new Error('Network Error')
    mockedAxios.get.mockRejectedValue(axiosError)

    await expect(downloadFile(testUrl, testFilePath)).rejects.toThrow(
      'Network Error'
    )

    expect(mockedAxios.get).toHaveBeenCalledWith(testUrl, {
      responseType: 'stream',
    })
    expect(mockedFs.createWriteStream).not.toHaveBeenCalled()
  })

  it('should reject on file stream write error', async () => {
    const writeError = new Error('Disk full')
    // Вызываем downloadFile и сразу после этого эмитируем ошибку
    const downloadPromise = downloadFile(testUrl, testFilePath)
    mockWriteStream.emit('error', writeError)
    await expect(downloadPromise).rejects.toThrow('Disk full')

    expect(mockedAxios.get).toHaveBeenCalledWith(testUrl, {
      responseType: 'stream',
    })
    expect(mockedFs.createWriteStream).toHaveBeenCalledWith(testFilePath)
    // Проверка вызова listener'а для 'error' не так надежна с EventEmitter,
    // важнее, что промис отклонился с правильной ошибкой.
  })

  // Тест на non-Axios error не нужен, т.к. он покрывается тестом на Axios error
  // it('should handle non-Axios error during download attempt', ...)
})
