import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import { TestCategory } from '../../core/categories'
import { runNeuroPhotoTests } from './neuroPhotoTest'
import { runTextToVideoTests } from './textToVideoTest'
import { runTextToImageTests } from './textToImageTest'
import { runImageToPromptTests } from './imageToPromptTest'
import { runTextToSpeechTests } from './textToSpeechTest'
import { runVoiceToTextTests } from './voiceToTextTest'
import { runImageToVideoTests } from './imageToVideoTest'
import { runModelTrainingTests } from './modelTrainingTest'
import { runDigitalAvatarTests } from './digitalAvatarTest'
import { runVoiceAvatarTests } from './createVoiceAvatarTest'
import { runBalanceNotifierTests } from './balanceNotifierTest'

/**
 * Запускает все тесты для Inngest функций
 */
export async function runInngestTests(options: { verbose?: boolean } = {}): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов Inngest Functions...', { description: 'Starting Inngest Function Tests...' })
  
  const results: TestResult[] = []
  
  try {
    // Model training tests
    const modelTrainingResults = await runModelTrainingTests()
    results.push(...modelTrainingResults)
    
    // Neuro image generation tests
    const imageGenerationResults = await runTextToImageTests(options)
    results.push(...imageGenerationResults)
    
    // Voice Avatars
    const voiceAvatarResults = await runDigitalAvatarTests()
    results.push(...voiceAvatarResults)
    
    // Text to Video
    const textToVideoResults = await runTextToVideoTests(options)
    results.push(...textToVideoResults)
    
    // Image to Prompt
    const imageToPromptResults = await runImageToPromptTests(options)
    results.push(...imageToPromptResults)
    
    // Text to Speech
    const textToSpeechResults = await runTextToSpeechTests(options)
    results.push(...textToSpeechResults)
    
    // Voice to Text
    const voiceToTextResults = await runVoiceToTextTests(options)
    results.push(...voiceToTextResults)
    
    // Image to Video
    const imageToVideoResults = await runImageToVideoTests(options)
    results.push(...imageToVideoResults)
    
    // Create Voice Avatar
    const voiceAvatarCreationResults = await runVoiceAvatarTests(options)
    results.push(...voiceAvatarCreationResults)
    
    // Balance Notifier
    const balanceNotifierResults = await runBalanceNotifierTests(options)
    results.push(...balanceNotifierResults)
    
    const passedTests = results.filter(r => r.passed).length
    
    logger.info(`📊 Тесты Inngest завершены: ${passedTests}/${results.length} успешно`, {
      description: `Inngest Tests completed: ${passedTests}/${results.length} passed`
    })
    
    if (passedTests < results.length) {
      const failedTests = results.filter(r => !r.passed)
      logger.warn(`❗ ${failedTests.length} тестов провалено:`, {
        description: `${failedTests.length} tests failed:`
      })
      
      failedTests.forEach((test, index) => {
        logger.warn(`  ${index + 1}. ${test.name}: ${test.message}`, {
          description: `  ${index + 1}. ${test.name}: ${test.message}`
        })
      })
    }
  } catch (error: any) {
    logger.error(`❌ Критическая ошибка при запуске тестов Inngest: ${error.message}`, {
      description: `Critical error running Inngest tests: ${error.message}`
    })
  }
  
  return results
}

// Запускаем тесты если файл запущен напрямую
if (require.main === module) {
  runInngestTests({ verbose: true }).then(results => {
    logger.info({
      message: '📊 Результаты тестов Inngest функций',
      description: 'Inngest function tests results',
      success: results.every((r: TestResult) => r.success),
      testName: 'Inngest Tests Suite',
      details: results.map((r: TestResult) => ({
        testName: r.name,
        success: r.success,
        message: r.message
      })).join('\n')
    })
    
    if (!results.every((r: TestResult) => r.success)) {
      process.exit(1)
    }
  }).catch(error => {
    logger.error('Критическая ошибка при запуске тестов:', error)
    process.exit(1)
  })
} 