import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateLipSyncViaAiServer,
  getLipSyncStatusFromAiServer,
  type AiServerLipSyncRequest,
} from '@/core/ai-server/lipsync-adapter'

// Мокаем fetch для тестов
global.fetch = vi.fn()

describe('AiServer LipSync Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateLipSyncViaAiServer', () => {
    it('должен успешно отправить запрос на ai-server', async () => {
      const mockResponse = {
        id: 'test-task-123',
        status: 'processing',
        // Поле объявлено как необязательное (result_url?: string), и адаптер
        // оставляет его undefined, когда сервер не вернул output. null здесь
        // никогда не проставлялся.
        result_url: undefined,
      }

      ;(fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const request: AiServerLipSyncRequest = {
        video_url: 'https://example.com/video.mp4',
        audio_url: 'https://example.com/audio.mp3',
        user_id: 'test_user_123',
      }

      const result = await generateLipSyncViaAiServer(request)

      expect(result).toEqual({
        id: 'test-task-123',
        status: 'processing',
        // Поле объявлено как необязательное (result_url?: string), и адаптер
        // оставляет его undefined, когда сервер не вернул output. null здесь
        // никогда не проставлялся.
        result_url: undefined,
        error: undefined,
        progress: undefined,
      })
    })

    it('должен использовать fallback через Replicate если ai-server недоступен', async () => {
      // Мокаем недоступность всех эндпоинтов ai-server
      ;(fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      })

      const request: AiServerLipSyncRequest = {
        video_url: 'https://example.com/video.mp4',
        audio_url: 'https://example.com/audio.mp3',
        user_id: 'test_user_123',
      }

      // Мокаем Replicate fallback
      const mockReplicateResult = {
        id: 'replicate-123',
        status: 'starting',
        output: null,
      }

      vi.doMock('@/core/replicate/generateKlingLipSync', () => ({
        generateKlingLipSync: vi.fn().mockResolvedValue(mockReplicateResult),
      }))

      const result = await generateLipSyncViaAiServer(request)

      // Синтетический id вида fallback-<timestamp> подставляется ТОЛЬКО когда
      // Replicate не вернул своего (`success.id || \`fallback-\${Date.now()}\``).
      // Мок отдаёт id, поэтому проверяем, что использован он — это и есть
      // признак того, что сработал путь фоллбэка через Replicate.
      expect(result.id).toBe('replicate-123')
      expect(result.status).toBe('processing')
    })
  })

  describe('getLipSyncStatusFromAiServer', () => {
    it('должен получить статус задачи от ai-server', async () => {
      const mockResponse = {
        id: 'test-task-123',
        status: 'completed',
        result_url: 'https://result.com/video.mp4',
      }

      ;(fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await getLipSyncStatusFromAiServer('test-task-123')

      expect(result).toEqual({
        id: 'test-task-123',
        status: 'completed',
        result_url: 'https://result.com/video.mp4',
        error: undefined,
        progress: undefined,
      })
    })
  })
})
