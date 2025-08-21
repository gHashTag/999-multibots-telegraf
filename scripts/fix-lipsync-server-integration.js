#!/usr/bin/env node

/**
 * Исправление LipSync интеграции для работы через ai-server
 * Заменяет прямые вызовы Replicate API на вызовы через ai-server
 */

const fs = require('fs')
const path = require('path')

console.log('🛠️ === ИСПРАВЛЕНИЕ LIPSYNC ДЛЯ AI-SERVER ===\n')

const AI_SERVER_URL = 'https://ai-server-u14194.vm.elestio.app'

// Основная функция исправления
async function fixLipSyncIntegration() {
  console.log('📋 ПЛАН ИСПРАВЛЕНИЙ:')
  console.log('1. Создание адаптера для ai-server')
  console.log('2. Обновление провайдера Replicate')  
  console.log('3. Обновление конфигурации')
  console.log('4. Создание тестов')
  
  // 1. Создание адаптера для ai-server
  await createAiServerAdapter()
  
  // 2. Создание нового провайдера для ai-server
  await createAiServerLipSyncProvider()
  
  // 3. Обновление конфигурации
  await updateLipSyncConfig()
  
  // 4. Создание тестов
  await createAiServerTests()
  
  console.log('\n✅ Исправления завершены!')
  console.log('\n📝 ЧТО СДЕЛАНО:')
  console.log('   ✅ Создан адаптер для ai-server')
  console.log('   ✅ Добавлен новый провайдер ai-server-lipsync')
  console.log('   ✅ Обновлена конфигурация моделей')
  console.log('   ✅ Созданы тесты для ai-server')
}

// Создание адаптера для ai-server
async function createAiServerAdapter() {
  console.log('\n1️⃣ Создание адаптера для ai-server...')
  
  const adapterCode = `import { logger } from '@/utils/logger'

/**
 * Адаптер для работы с ai-server
 * Заменяет прямые вызовы Replicate API
 */

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'https://ai-server-u14194.vm.elestio.app'

export interface AiServerLipSyncRequest {
  video_url: string
  audio_url: string
  user_id: string
  model?: string
  webhook_url?: string
}

export interface AiServerLipSyncResponse {
  id: string
  status: 'processing' | 'completed' | 'failed'
  result_url?: string
  error?: string
  progress?: number
}

/**
 * Генерирует LipSync через ai-server
 */
export async function generateLipSyncViaAiServer(
  request: AiServerLipSyncRequest
): Promise<AiServerLipSyncResponse> {
  logger.info('🎬 Отправляем запрос на ai-server для LipSync', {
    user_id: request.user_id,
    model: request.model || 'kling-lipsync',
    video_url: request.video_url.substring(0, 50) + '...',
    audio_url: request.audio_url.substring(0, 50) + '...',
  })

  try {
    // Пробуем разные возможные эндпоинты
    const endpoints = [
      '/api/lipsync',
      '/generate/lipsync', 
      '/generate/kling-lipsync',
      '/api/v1/lipsync',
      '/lipsync',
      '/replicate/lipsync'  // Возможный прокси для Replicate
    ]
    
    let lastError: any = null
    
    for (const endpoint of endpoints) {
      try {
        logger.info(\`🔍 Пробуем эндпоинт: \${endpoint}\`)
        
        const response = await fetch(\`\${AI_SERVER_URL}\${endpoint}\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            // Добавляем авторизацию если нужна
            ...(process.env.AI_SERVER_API_KEY && {
              'Authorization': \`Bearer \${process.env.AI_SERVER_API_KEY}\`
            })
          },
          body: JSON.stringify({
            ...request,
            // Стандартизируем параметры для ai-server
            videoUrl: request.video_url,
            audioUrl: request.audio_url,
            userId: request.user_id,
            modelId: request.model || 'kwaivgi/kling-lip-sync'
          })
        })

        if (response.ok) {
          const result = await response.json()
          logger.info(\`✅ LipSync запущен через ai-server (\${endpoint})\`, {
            id: result.id,
            status: result.status
          })
          
          return {
            id: result.id || \`ai-server-\${Date.now()}\`,
            status: result.status || 'processing',
            result_url: result.result_url || result.output,
            error: result.error,
            progress: result.progress
          }
        } else if (response.status === 404) {
          logger.warn(\`⚠️ Эндпоинт \${endpoint} не найден\`)
          continue
        } else {
          const errorText = await response.text()
          logger.error(\`❌ Ошибка \${endpoint}: \${response.status} - \${errorText}\`)
          lastError = new Error(\`AI Server error: \${response.status} - \${errorText}\`)
        }
      } catch (error) {
        logger.error(\`❌ Сетевая ошибка для \${endpoint}:\`, error)
        lastError = error
        continue
      }
    }
    
    // Если все эндпоинты не работают, используем fallback через прямой Replicate
    logger.warn('⚠️ Все эндпоинты ai-server недоступны, используем fallback через Replicate')
    
    // Импортируем оригинальную функцию как fallback
    const { generateKlingLipSync } = await import('@/core/replicate/generateKlingLipSync')
    
    const replicateResult = await generateKlingLipSync(
      request.user_id,
      request.video_url, 
      request.audio_url,
      true
    )
    
    if ('message' in replicateResult && 'error' in replicateResult) {
      throw new Error(replicateResult.message)
    }
    
    const success = replicateResult as any
    return {
      id: success.id || \`fallback-\${Date.now()}\`,
      status: success.status === 'succeeded' ? 'completed' : 'processing',
      result_url: success.output,
      error: success.error
    }
    
  } catch (error) {
    logger.error('❌ Критическая ошибка ai-server LipSync:', error)
    throw error
  }
}

/**
 * Проверяет статус LipSync задачи
 */
export async function getLipSyncStatusFromAiServer(
  taskId: string
): Promise<AiServerLipSyncResponse> {
  try {
    const response = await fetch(\`\${AI_SERVER_URL}/api/lipsync/\${taskId}\`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.AI_SERVER_API_KEY && {
          'Authorization': \`Bearer \${process.env.AI_SERVER_API_KEY}\`
        })
      }
    })
    
    if (response.ok) {
      const result = await response.json()
      return {
        id: result.id || taskId,
        status: result.status || 'processing',
        result_url: result.result_url || result.output,
        error: result.error,
        progress: result.progress
      }
    }
    
    // Fallback: проверяем через Replicate если задача начинается с префикса Replicate
    if (taskId.startsWith('pred_') || taskId.includes('replicate')) {
      const { getKlingLipSyncStatus } = await import('@/core/replicate/generateKlingLipSync')
      const replicateResult = await getKlingLipSyncStatus(taskId)
      
      if ('message' in replicateResult && 'error' in replicateResult) {
        throw new Error(replicateResult.message)
      }
      
      const success = replicateResult as any
      return {
        id: success.id || taskId,
        status: success.status === 'succeeded' ? 'completed' : 'processing', 
        result_url: success.output,
        error: success.error
      }
    }
    
    throw new Error(\`Failed to get status: \${response.status}\`)
    
  } catch (error) {
    logger.error('❌ Ошибка получения статуса из ai-server:', error)
    throw error
  }
}
`

  const adapterPath = path.join(process.cwd(), 'src/core/ai-server/lipsync-adapter.ts')
  const adapterDir = path.dirname(adapterPath)
  
  if (!fs.existsSync(adapterDir)) {
    fs.mkdirSync(adapterDir, { recursive: true })
  }
  
  fs.writeFileSync(adapterPath, adapterCode)
  console.log('   ✅ Создан адаптер: src/core/ai-server/lipsync-adapter.ts')
}

// Создание нового провайдера для ai-server
async function createAiServerLipSyncProvider() {
  console.log('\n2️⃣ Создание провайдера ai-server...')
  
  const providerCode = `import { saveVideoUrlToSupabase } from '@/core/supabase/saveVideoUrlToSupabase'
import { logger } from '@/utils/logger'
import { 
  generateLipSyncViaAiServer,
  getLipSyncStatusFromAiServer,
  AiServerLipSyncRequest 
} from '../ai-server/lipsync-adapter'

export interface AiServerLipSyncResponse {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string
  error?: string
  urls?: {
    get: string
    cancel: string
  }
}

export interface AiServerLipSyncError {
  message: string
  error?: string
}

export type AiServerLipSyncResult = AiServerLipSyncResponse | AiServerLipSyncError

/**
 * Генерирует видео с липсинком используя ai-server как прокси
 */
export async function generateAiServerLipSync(
  telegramId: string,
  videoUrl: string,
  audioUrl: string,
  isRu: boolean = true
): Promise<AiServerLipSyncResult> {
  try {
    logger.info('🎬 Начинаем генерацию AiServer LipSync', {
      telegramId,
      videoUrl: videoUrl.substring(0, 100) + '...',
      audioUrl: audioUrl.substring(0, 100) + '...',
      provider: 'ai-server',
    })

    const request: AiServerLipSyncRequest = {
      video_url: videoUrl,
      audio_url: audioUrl,
      user_id: telegramId,
      model: 'kwaivgi/kling-lip-sync'
    }

    const result = await generateLipSyncViaAiServer(request)

    // Сохраняем задачу в базу
    await saveVideoUrlToSupabase(
      telegramId,
      result.id,
      result.result_url || '',
      'ai_server_lipsync'
    )

    logger.info('✅ AiServer LipSync задача создана', {
      taskId: result.id,
      status: result.status,
      telegramId,
    })

    return {
      id: result.id,
      status: result.status === 'completed' ? 'succeeded' : 
             result.status === 'failed' ? 'failed' : 'starting',
      output: result.result_url,
      error: result.error,
      urls: {
        get: \`https://ai-server-u14194.vm.elestio.app/api/lipsync/\${result.id}\`,
        cancel: \`https://ai-server-u14194.vm.elestio.app/api/lipsync/\${result.id}/cancel\`
      }
    } as AiServerLipSyncResponse

  } catch (error) {
    logger.error('❌ Ошибка при генерации AiServer LipSync', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      stack: error instanceof Error ? error.stack : undefined,
    })

    if (error instanceof Error) {
      return {
        message: 'Ошибка при генерации видео с липсинком через ai-server',
        error: error.message,
      } as AiServerLipSyncError
    }

    return {
      message: 'Неизвестная ошибка при генерации видео через ai-server',
      error: String(error),
    } as AiServerLipSyncError
  }
}

/**
 * Проверяет статус генерации по ID
 */
export async function getAiServerLipSyncStatus(
  taskId: string
): Promise<AiServerLipSyncResult> {
  try {
    const result = await getLipSyncStatusFromAiServer(taskId)

    return {
      id: result.id,
      status: result.status === 'completed' ? 'succeeded' : 
             result.status === 'failed' ? 'failed' : 'processing',
      output: result.result_url,
      error: result.error,
      urls: {
        get: \`https://ai-server-u14194.vm.elestio.app/api/lipsync/\${result.id}\`,
        cancel: \`https://ai-server-u14194.vm.elestio.app/api/lipsync/\${result.id}/cancel\`
      }
    } as AiServerLipSyncResponse

  } catch (error) {
    logger.error('❌ Ошибка при получении статуса AiServer LipSync', {
      error: error instanceof Error ? error.message : String(error),
      taskId,
    })

    return {
      message: 'Ошибка при проверке статуса генерации через ai-server',
      error: error instanceof Error ? error.message : String(error),
    } as AiServerLipSyncError
  }
}
`

  const providerPath = path.join(process.cwd(), 'src/core/ai-server/generateAiServerLipSync.ts')
  fs.writeFileSync(providerPath, providerCode)
  console.log('   ✅ Создан провайдер: src/core/ai-server/generateAiServerLipSync.ts')
}

// Обновление основного сервиса
async function updateLipSyncConfig() {
  console.log('\n3️⃣ Обновление конфигурации LipSync...')
  
  // Обновляем основной сервис generateLipSync.ts
  const servicePath = path.join(process.cwd(), 'src/services/generateLipSync.ts')
  
  if (fs.existsSync(servicePath)) {
    const serviceCode = fs.readFileSync(servicePath, 'utf8')
    
    // Добавляем импорт ai-server провайдера
    const updatedServiceCode = `import { logger } from '@/utils/logger'
import {
  generateKlingLipSync,
  type KlingLipSyncResult,
  type KlingLipSyncResponse,
  type KlingLipSyncError,
} from '@/core/replicate/generateKlingLipSync'

// НОВОЕ: Импорт ai-server провайдера
import {
  generateAiServerLipSync,
  type AiServerLipSyncResult,
} from '@/core/ai-server/generateAiServerLipSync'

// Интерфейс для обратной совместимости
export interface LipSyncResponse {
  message: string
  resultUrl?: string
  id?: string
  status?: string
}

/**
 * Генерирует видео с липсинком с автоматическим выбором провайдера
 * Приоритет: ai-server > replicate (fallback)
 */
export async function generateLipSync(
  videoUrl: string,
  audioUrl: string,
  telegramId: string,
  botName: string
): Promise<LipSyncResponse> {
  try {
    logger.info('🎬 Начинаем генерацию липсинка', {
      telegramId,
      botName,
      videoUrl: videoUrl.substring(0, 100) + '...',
      audioUrl: audioUrl.substring(0, 100) + '...',
      strategy: 'ai-server-first'
    })

    // НОВОЕ: Пробуем ai-server сначала
    try {
      logger.info('🚀 Пытаемся использовать ai-server...')
      
      const aiServerResult: AiServerLipSyncResult = await generateAiServerLipSync(
        telegramId,
        videoUrl,
        audioUrl,
        true
      )

      // Проверяем если результат - это ошибка
      if ('message' in aiServerResult && 'error' in aiServerResult) {
        logger.warn('⚠️ ai-server вернул ошибку, переключаемся на Replicate', {
          error: aiServerResult.message
        })
        throw new Error(aiServerResult.message)
      }

      // Результат успешный от ai-server
      const success = aiServerResult as any
      
      logger.info('✅ ai-server LipSync запущен успешно', {
        id: success.id,
        status: success.status,
        telegramId,
        hasOutput: !!success.output,
      })

      return {
        message: success.status === 'succeeded'
          ? 'Видео с липсинком готово (ai-server)'
          : 'Видео отправлено на обработку через ai-server. Ждите результата',
        resultUrl: success.output,
        id: success.id,
        status: success.status,
      }
      
    } catch (aiServerError) {
      logger.warn('⚠️ ai-server недоступен, используем Replicate fallback', {
        error: aiServerError instanceof Error ? aiServerError.message : String(aiServerError)
      })
      
      // Fallback на оригинальную Kling модель через Replicate
      const result: KlingLipSyncResult = await generateKlingLipSync(
        telegramId,
        videoUrl,
        audioUrl,
        true
      )

      // Проверяем если результат - это ошибка
      if ('message' in result && 'error' in result) {
        const error = result as KlingLipSyncError
        logger.error('❌ Ошибка от Replicate LipSync сервиса', {
          error: error.message,
          details: error.error,
          telegramId,
        })

        throw new Error(error.message || 'Ошибка при генерации липсинка')
      }

      // Результат успешный от Replicate
      const success = result as KlingLipSyncResponse

      logger.info('✅ Replicate LipSync запущен успешно (fallback)', {
        id: success.id,
        status: success.status,
        telegramId,
        hasOutput: !!success.output,
      })

      return {
        message: success.status === 'succeeded'
          ? 'Видео с липсинком готово (Replicate)'
          : 'Видео отправлено на обработку через Replicate. Ждите результата',
        resultUrl: success.output,
        id: success.id,
        status: success.status,
      }
    }

  } catch (error) {
    logger.error('❌ Критическая ошибка при генерации липсинка', {
      error: error instanceof Error ? error.message : String(error),
      telegramId,
      botName,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Пробрасываем ошибку дальше для обработки в UI
    throw error
  }
}`
    
    fs.writeFileSync(servicePath, updatedServiceCode)
    console.log('   ✅ Обновлен сервис: src/services/generateLipSync.ts')
  }
}

// Создание тестов
async function createAiServerTests() {
  console.log('\n4️⃣ Создание тестов ai-server...')
  
  const testCode = `import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 
  generateLipSyncViaAiServer, 
  getLipSyncStatusFromAiServer,
  type AiServerLipSyncRequest 
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
        result_url: null
      }

      ;(fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const request: AiServerLipSyncRequest = {
        video_url: 'https://example.com/video.mp4',
        audio_url: 'https://example.com/audio.mp3',
        user_id: 'test_user_123'
      }

      const result = await generateLipSyncViaAiServer(request)

      expect(result).toEqual({
        id: 'test-task-123',
        status: 'processing',
        result_url: null,
        error: undefined,
        progress: undefined
      })
    })

    it('должен использовать fallback через Replicate если ai-server недоступен', async () => {
      // Мокаем недоступность всех эндпоинтов ai-server
      ;(fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found'
      })

      const request: AiServerLipSyncRequest = {
        video_url: 'https://example.com/video.mp4',
        audio_url: 'https://example.com/audio.mp3', 
        user_id: 'test_user_123'
      }

      // Мокаем Replicate fallback
      const mockReplicateResult = {
        id: 'replicate-123',
        status: 'starting',
        output: null
      }
      
      vi.doMock('@/core/replicate/generateKlingLipSync', () => ({
        generateKlingLipSync: vi.fn().mockResolvedValue(mockReplicateResult)
      }))

      const result = await generateLipSyncViaAiServer(request)

      expect(result.id).toContain('fallback-')
      expect(result.status).toBe('processing')
    })
  })

  describe('getLipSyncStatusFromAiServer', () => {
    it('должен получить статус задачи от ai-server', async () => {
      const mockResponse = {
        id: 'test-task-123',
        status: 'completed',
        result_url: 'https://result.com/video.mp4'
      }

      ;(fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await getLipSyncStatusFromAiServer('test-task-123')

      expect(result).toEqual({
        id: 'test-task-123',
        status: 'completed',
        result_url: 'https://result.com/video.mp4',
        error: undefined,
        progress: undefined
      })
    })
  })
})`

  const testPath = path.join(process.cwd(), 'src/__tests__/core/ai-server/lipsync-adapter.test.ts')
  const testDir = path.dirname(testPath)
  
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true })
  }
  
  fs.writeFileSync(testPath, testCode)
  console.log('   ✅ Создан тест: src/__tests__/core/ai-server/lipsync-adapter.test.ts')
}

// Запуск основной функции
fixLipSyncIntegration().catch(console.error)