/**
 * 🧪 Тестирование интеграции ElevenLabs
 * Этот скрипт проверяет:
 * 1. Доступность API ключа
 * 2. Работу default голосов
 * 3. Fallback механизмы
 * 4. Генерацию аудио с различными voice_id
 */

import { getVoiceId, getFallbackVoiceId, getAvailableDefaultVoices } from '@/core/supabase/getVoiceId'
import { createAudioFileFromText } from '@/core/elevenlabs/createAudioFileFromText'
import { checkVoiceExists } from '@/core/elevenlabs'
import { PRIMARY_FALLBACK_VOICE_ID } from '@/config'
import logger from '@/utils/logger'
import fs from 'fs'

interface TestResult {
  testName: string
  status: 'PASS' | 'FAIL' | 'WARN'
  message: string
  details?: any
}

class ElevenLabsIntegrationTester {
  private results: TestResult[] = []

  private addResult(testName: string, status: 'PASS' | 'FAIL' | 'WARN', message: string, details?: any) {
    this.results.push({ testName, status, message, details })
    const emoji = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌'
    console.log(`${emoji} [${testName}] ${message}`)
    if (details) {
      console.log(`   Details:`, details)
    }
  }

  async testApiKeyPresence() {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      this.addResult('API_KEY', 'FAIL', 'ELEVENLABS_API_KEY не найден в переменных окружения')
      return false
    }

    if (apiKey.length < 20) {
      this.addResult('API_KEY', 'WARN', 'API ключ выглядит подозрительно коротким', { keyLength: apiKey.length })
      return false
    }

    this.addResult('API_KEY', 'PASS', 'API ключ присутствует', {
      keyPrefix: apiKey.substring(0, 8) + '***',
      keyLength: apiKey.length
    })
    return true
  }

  async testDefaultVoiceIds() {
    try {
      const defaultVoices = getAvailableDefaultVoices()
      this.addResult('DEFAULT_VOICES', 'PASS', `Загружено ${Object.keys(defaultVoices).length} default голосов`, defaultVoices)

      const primaryFallback = getFallbackVoiceId()
      this.addResult('FALLBACK_VOICE', 'PASS', 'Fallback голос настроен', { fallbackVoiceId: primaryFallback })

      return true
    } catch (error) {
      this.addResult('DEFAULT_VOICES', 'FAIL', 'Ошибка при получении default голосов', error)
      return false
    }
  }

  async testVoiceExistence() {
    try {
      const voiceExists = await checkVoiceExists(PRIMARY_FALLBACK_VOICE_ID)
      if (voiceExists) {
        this.addResult('VOICE_EXISTS', 'PASS', 'Primary fallback голос существует в ElevenLabs', { voiceId: PRIMARY_FALLBACK_VOICE_ID })
      } else {
        this.addResult('VOICE_EXISTS', 'FAIL', 'Primary fallback голос НЕ найден в ElevenLabs!', { voiceId: PRIMARY_FALLBACK_VOICE_ID })
        return false
      }
      return true
    } catch (error) {
      this.addResult('VOICE_EXISTS', 'FAIL', 'Ошибка при проверке существования голоса', error)
      return false
    }
  }

  async testVoiceIdRetrieval() {
    try {
      // Тест с несуществующим пользователем (должен вернуть fallback)
      const voiceId = await getVoiceId('999999999')
      if (voiceId === PRIMARY_FALLBACK_VOICE_ID) {
        this.addResult('VOICE_RETRIEVAL', 'PASS', 'getVoiceId правильно возвращает fallback для несуществующего пользователя', {
          voiceId,
          expectedFallback: PRIMARY_FALLBACK_VOICE_ID
        })
      } else {
        this.addResult('VOICE_RETRIEVAL', 'FAIL', 'getVoiceId НЕ возвращает fallback', {
          received: voiceId,
          expected: PRIMARY_FALLBACK_VOICE_ID
        })
      }
      return true
    } catch (error) {
      this.addResult('VOICE_RETRIEVAL', 'FAIL', 'Ошибка при тестировании получения voice_id', error)
      return false
    }
  }

  async testAudioGeneration() {
    try {
      const testText = 'Hello, this is a test of ElevenLabs integration.'
      console.log('🎵 Начинаем тест генерации аудио...')

      const audioPath = await createAudioFileFromText({
        text: testText,
        voice_id: PRIMARY_FALLBACK_VOICE_ID,
        telegram_id: '999999999'
      })

      if (audioPath && fs.existsSync(audioPath)) {
        const fileStats = fs.statSync(audioPath)
        this.addResult('AUDIO_GENERATION', 'PASS', 'Аудио файл успешно создан', {
          audioPath,
          fileSize: fileStats.size,
          voiceId: PRIMARY_FALLBACK_VOICE_ID
        })

        // Очистка тестового файла
        try {
          fs.unlinkSync(audioPath)
          console.log('🗑️ Тестовый аудио файл удален')
        } catch (unlinkError) {
          console.warn('⚠️ Не удалось удалить тестовый файл:', unlinkError)
        }

        return true
      } else {
        this.addResult('AUDIO_GENERATION', 'FAIL', 'Аудио файл не создан или не найден', { audioPath })
        return false
      }
    } catch (error) {
      this.addResult('AUDIO_GENERATION', 'FAIL', 'Ошибка при генерации аудио', error)
      return false
    }
  }

  async testInvalidVoiceFallback() {
    try {
      const testText = 'Testing fallback mechanism with invalid voice ID.'
      const invalidVoiceId = 'invalid-voice-id-12345'

      console.log('🔄 Тестируем fallback механизм с недействительным voice_id...')

      const audioPath = await createAudioFileFromText({
        text: testText,
        voice_id: invalidVoiceId,
        telegram_id: '999999999'
      })

      if (audioPath && fs.existsSync(audioPath)) {
        this.addResult('INVALID_VOICE_FALLBACK', 'PASS', 'Fallback механизм работает корректно', {
          originalVoiceId: invalidVoiceId,
          audioPath
        })

        // Очистка
        try {
          fs.unlinkSync(audioPath)
        } catch {}

        return true
      } else {
        this.addResult('INVALID_VOICE_FALLBACK', 'FAIL', 'Fallback механизм не сработал', {
          originalVoiceId: invalidVoiceId
        })
        return false
      }
    } catch (error) {
      this.addResult('INVALID_VOICE_FALLBACK', 'FAIL', 'Ошибка при тестировании fallback', error)
      return false
    }
  }

  async runAllTests(): Promise<TestResult[]> {
    console.log('🚀 Запуск полного тестирования интеграции ElevenLabs...\n')

    await this.testApiKeyPresence()
    await this.testDefaultVoiceIds()
    await this.testVoiceExistence()
    await this.testVoiceIdRetrieval()
    await this.testAudioGeneration()
    await this.testInvalidVoiceFallback()

    console.log('\n📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:')
    console.log('='.repeat(50))

    const passCount = this.results.filter(r => r.status === 'PASS').length
    const warnCount = this.results.filter(r => r.status === 'WARN').length
    const failCount = this.results.filter(r => r.status === 'FAIL').length

    console.log(`✅ Пройдено: ${passCount}`)
    console.log(`⚠️ Предупреждения: ${warnCount}`)
    console.log(`❌ Провалено: ${failCount}`)

    if (failCount === 0) {
      console.log('\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! ElevenLabs интеграция работает корректно.')
    } else {
      console.log(`\n⚠️ НАЙДЕНЫ ПРОБЛЕМЫ! ${failCount} тестов провалено.`)
    }

    return this.results
  }

  getResults(): TestResult[] {
    return this.results
  }
}

// Экспорт для использования в других частях приложения
export { ElevenLabsIntegrationTester }

// Для запуска как standalone скрипт
export async function runElevenLabsTests() {
  const tester = new ElevenLabsIntegrationTester()
  return await tester.runAllTests()
}

// Если файл запущен напрямую
if (require.main === module) {
  runElevenLabsTests().then(results => {
    logger.info('[ElevenLabsIntegrationTester] Tests completed', {
      totalTests: results.length,
      passed: results.filter(r => r.status === 'PASS').length,
      failed: results.filter(r => r.status === 'FAIL').length,
      warnings: results.filter(r => r.status === 'WARN').length
    })
  }).catch(error => {
    logger.error('[ElevenLabsIntegrationTester] Test execution failed', error)
    console.error('❌ Критическая ошибка при выполнении тестов:', error)
    process.exit(1)
  })
}