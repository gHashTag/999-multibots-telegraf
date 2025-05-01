import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test'
import axios from 'axios'
import {
  generateLipSync,
  LipSyncResponse,
  LipSyncStatus,
} from '@/services/plan_b/generateLipSync'

// --- Мокирование Зависимостей --- //

// Мок @/config
mock.module('@/config', () => ({
  WEBHOOK_URL: 'http://mock-webhook.com/hook',
}))

// Мок @/core/supabase
const mockSaveVideoUrlToSupabase = mock(
  (telegram_id: string, videoId: string, url: string, type: string) =>
    Promise.resolve()
)
mock.module('@/core/supabase', () => ({
  saveVideoUrlToSupabase: mockSaveVideoUrlToSupabase,
}))

// Мок axios
const mockAxiosPost = mock((url: string, body: any, config: any) =>
  Promise.resolve({ data: null, status: 200, statusText: 'OK' })
)
mock.module('axios', () => ({
  default: {
    post: mockAxiosPost,
    isAxiosError: (error: any) => error.isAxiosError === true, // Добавляем isAxiosError
  },
  isAxiosError: (error: any) => error.isAxiosError === true, // Экспортируем и отдельно
}))

// --- Тесты --- //

describe('Plan B: generateLipSync Service', () => {
  const originalSyncLabsApiKey = process.env.SYNC_LABS_API_KEY
  const SYNC_LABS_URL = 'https://api.sync.so/v2/generate'

  beforeEach(() => {
    // Устанавливаем мок API ключа
    process.env.SYNC_LABS_API_KEY = 'mock-sync-labs-key'

    // Сброс моков
    mockSaveVideoUrlToSupabase.mockClear()
    mockAxiosPost
      .mockClear()
      .mockResolvedValue({ data: null, status: 200, statusText: 'OK' })
  })

  afterEach(() => {
    // Восстанавливаем оригинальный ключ
    process.env.SYNC_LABS_API_KEY = originalSyncLabsApiKey
    mock.restore()
  })

  it('should successfully initiate lip sync and save video id', async () => {
    // Arrange
    const telegram_id = 'user123'
    const videoUrl = 'http://example.com/video.mp4'
    const audioUrl = 'http://example.com/audio.mp3'
    const isRu = false
    const mockApiResponse: LipSyncResponse = {
      id: 'sync_job_123',
      createdAt: new Date().toISOString(),
      status: 'processing' as LipSyncStatus,
      model: 'lipsync-1.9.0-beta',
      input: [
        { url: videoUrl, type: 'video' },
        { url: audioUrl, type: 'audio' },
      ],
      webhookUrl: 'http://mock-webhook.com/hook',
      options: { output_format: 'mp4' },
      outputUrl: null,
      outputDuration: null,
      error: null,
    }
    mockAxiosPost.mockResolvedValueOnce({
      data: mockApiResponse,
      status: 200,
      statusText: 'OK',
    })

    const expectedBody = {
      model: 'lipsync-1.9.0-beta',
      input: [
        { type: 'video', url: videoUrl },
        { type: 'audio', url: audioUrl },
      ],
      options: { output_format: 'mp4' },
      webhookUrl: 'http://mock-webhook.com/hook',
    }

    const expectedHeaders = {
      headers: {
        'x-api-key': 'mock-sync-labs-key',
        'Content-Type': 'application/json',
      },
    }

    // Act
    const result = await generateLipSync(telegram_id, videoUrl, audioUrl, isRu)

    // Assert
    // 1. Проверяем вызов axios
    expect(mockAxiosPost).toHaveBeenCalledTimes(1)
    expect(mockAxiosPost).toHaveBeenCalledWith(
      SYNC_LABS_URL,
      expectedBody,
      expectedHeaders
    )

    // 2. Проверяем вызов сохранения в Supabase
    expect(mockSaveVideoUrlToSupabase).toHaveBeenCalledTimes(1)
    expect(mockSaveVideoUrlToSupabase).toHaveBeenCalledWith(
      telegram_id,
      mockApiResponse.id,
      '',
      'lipsync'
    )

    // 3. Проверяем результат функции
    expect(result).toEqual(mockApiResponse)
  })

  it('should return error message if SyncLabs API returns non-200 status', async () => {
    // Arrange
    const telegram_id = 'user123'
    const videoUrl = 'http://example.com/video.mp4'
    const audioUrl = 'http://example.com/audio.mp3'
    const isRu = false
    const mockApiResponse: LipSyncResponse = {
      id: 'sync_job_failed', // ID может присутствовать даже при ошибке
      createdAt: new Date().toISOString(),
      status: 'error' as LipSyncStatus,
      model: 'lipsync-1.9.0-beta',
      input: [],
      webhookUrl: 'http://mock-webhook.com/hook',
      options: { output_format: 'mp4' },
      outputUrl: null,
      outputDuration: null,
      error: 'Internal Server Error',
    }
    // Мокируем ответ axios с ошибкой
    mockAxiosPost.mockResolvedValueOnce({
      data: mockApiResponse,
      status: 500,
      statusText: 'Internal Server Error',
    })

    // Act
    const result = await generateLipSync(telegram_id, videoUrl, audioUrl, isRu)

    // Assert
    expect(result).toEqual({ message: 'Error generating lip sync' })
    expect(mockSaveVideoUrlToSupabase).toHaveBeenCalledTimes(1) // Сохранение ID все равно вызывается
    expect(mockSaveVideoUrlToSupabase).toHaveBeenCalledWith(
      telegram_id,
      mockApiResponse.id,
      '',
      'lipsync'
    )
    expect(mockAxiosPost).toHaveBeenCalledTimes(1)
  })

  it('should return error message if SyncLabs API response has no id', async () => {
    // Arrange
    const telegram_id = 'user123'
    const videoUrl = 'http://example.com/video.mp4'
    const audioUrl = 'http://example.com/audio.mp3'
    const isRu = false
    // Ответ API без поля id
    const mockApiResponse = {
      createdAt: new Date().toISOString(),
      status: 'processing' as LipSyncStatus,
      model: 'lipsync-1.9.0-beta',
      input: [],
      webhookUrl: 'http://mock-webhook.com/hook',
      options: { output_format: 'mp4' },
      outputUrl: null,
      outputDuration: null,
      error: null,
    }
    mockAxiosPost.mockResolvedValueOnce({
      data: mockApiResponse,
      status: 200,
      statusText: 'OK',
    })

    // Act
    const result = await generateLipSync(telegram_id, videoUrl, audioUrl, isRu)

    // Assert
    expect(result).toEqual({ message: 'No video ID found in response' })
    expect(mockSaveVideoUrlToSupabase).not.toHaveBeenCalled() // Сохранение не должно вызываться
    expect(mockAxiosPost).toHaveBeenCalledTimes(1)
  })

  it('should return error message if axios post throws an error', async () => {
    // Arrange
    const telegram_id = 'user123'
    const videoUrl = 'http://example.com/video.mp4'
    const audioUrl = 'http://example.com/audio.mp3'
    const isRu = false
    const axiosError = new Error('Network Error')
    ;(axiosError as any).isAxiosError = true // Имитируем AxiosError
    ;(axiosError as any).response = { data: 'Network failure details' } // Добавляем детали ошибки

    // Мокируем axios.post, чтобы он выбросил ошибку
    mockAxiosPost.mockRejectedValueOnce(axiosError)

    // Act
    const result = await generateLipSync(telegram_id, videoUrl, audioUrl, isRu)

    // Assert
    expect(result).toEqual({
      message: 'Error occurred while generating lip sync',
    })
    expect(mockSaveVideoUrlToSupabase).not.toHaveBeenCalled() // Сохранение не должно вызываться
    expect(mockAxiosPost).toHaveBeenCalledTimes(1)
    // Можно добавить проверку логов, но логгер не мокирован в этом файле
  })

  it('should return error message if saveVideoUrlToSupabase throws an error', async () => {
    // Arrange
    const telegram_id = 'user123'
    const videoUrl = 'http://example.com/video.mp4'
    const audioUrl = 'http://example.com/audio.mp3'
    const isRu = false
    const supabaseError = new Error('Supabase save failed')
    const mockApiResponse: LipSyncResponse = {
      id: 'sync_job_supabase_fail',
      createdAt: new Date().toISOString(),
      status: 'processing' as LipSyncStatus,
      model: 'lipsync-1.9.0-beta',
      input: [
        { url: videoUrl, type: 'video' },
        { url: audioUrl, type: 'audio' },
      ],
      webhookUrl: 'http://mock-webhook.com/hook',
      options: { output_format: 'mp4' },
      outputUrl: null,
      outputDuration: null,
      error: null,
    }
    // Мокируем успешный ответ от axios
    mockAxiosPost.mockResolvedValueOnce({
      data: mockApiResponse,
      status: 200,
      statusText: 'OK',
    })
    // Мокируем saveVideoUrlToSupabase, чтобы он выбросил ошибку
    mockSaveVideoUrlToSupabase.mockRejectedValueOnce(supabaseError)

    // Act
    const result = await generateLipSync(telegram_id, videoUrl, audioUrl, isRu)

    // Assert
    expect(result).toEqual({
      message: 'Error occurred while generating lip sync',
    })
    expect(mockAxiosPost).toHaveBeenCalledTimes(1)
    expect(mockSaveVideoUrlToSupabase).toHaveBeenCalledTimes(1)
    expect(mockSaveVideoUrlToSupabase).toHaveBeenCalledWith(
      telegram_id,
      mockApiResponse.id,
      '',
      'lipsync'
    )
    // Можно добавить проверку логов, но логгер не мокирован
  })
})
