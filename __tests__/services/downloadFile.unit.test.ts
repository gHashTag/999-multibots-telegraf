import { EventEmitter } from 'events'

// jest.mock('@/config') // Убираем пустой мок
// Добавляем полный мок конфигурации
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

// Mock axios.get and fs.createWriteStream
jest.mock('axios', () => ({ get: jest.fn() }))
// Дополняем мок fs
jest.mock('fs', () => ({
  createWriteStream: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true), // Мокаем existsSync
  mkdirSync: jest.fn(), // Мокаем mkdirSync
}))
import axios from 'axios'
import fs from 'fs'
import { downloadFile } from '@/services/generateLipSync'

describe('downloadFile', () => {
  const url = 'http://example.com/file'
  const outputPath = '/tmp/out'
  let writer: EventEmitter & { close: jest.Mock }
  let response: { data: any }
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    // Create fake writable stream
    writer = new EventEmitter() as any
    writer.close = jest.fn()
    ;(fs.createWriteStream as jest.Mock).mockReturnValue(writer)
    // Prepare response.data with pipe
    response = {
      data: { pipe: (dest: any) => process.nextTick(() => dest.emit('close')) },
    }
    ;(axios.get as jest.Mock).mockResolvedValue(response)
  })

  it('resolves when stream closes without error', async () => {
    await expect(downloadFile(url, outputPath)).resolves.toBeUndefined()
    expect(axios.get).toHaveBeenCalledWith(url, { responseType: 'stream' })
    expect(fs.createWriteStream).toHaveBeenCalledWith(outputPath)
  })

  it('rejects when writer emits error', async () => {
    // On pipe, emit error instead of close
    response = {
      data: {
        pipe: (dest: any) =>
          process.nextTick(() => dest.emit('error', new Error('stream err'))),
      },
    }
    ;(axios.get as jest.Mock).mockResolvedValue(response)
    await expect(downloadFile(url, outputPath)).rejects.toThrow('stream err')
  })
})
