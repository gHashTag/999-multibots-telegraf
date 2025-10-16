/**
 * 🎬 Video Models Testing Suite
 *
 * Систематическое тестирование всех видео моделей (Text-to-Video и Image-to-Video)
 * с использованием стандартного промпта и изображения.
 *
 * ВАЖНО: Реальные API вызовы стоят денег! Используйте mock mode для разработки.
 *
 * Usage:
 *   npm run test:model -- --model=veo3_fast --type=text
 *   npm run test:model -- --model=veo3_fast --type=image --image=<URL>
 *   npm run test:model -- --model=sora-2 --no-polling
 *   npm run test:models:validate  # Dry run без API вызовов
 */

import * as dotenv from 'dotenv'
import { KieAiProvider } from '@/services/video-providers/KieAiProvider'
import { VIDEO_MODELS, VideoModelInfo } from '@/services/videoModels'
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { logger } from '@/utils/logger'

dotenv.config()

// Стандартный тестовый промпт (из требований пользователя)
const STANDARD_TEST_PROMPT = `Уже в эту пятницу, 17 октября, в 11:00 приглашаю вас в Café 13 на бизнес-завтрак IP Business Club.

Я поделюсь своим опытом создания ИИ-агентов — расскажу, как можно просто и быстро создавать приложения и ботов с помощью вайбкодинга, используя обычный язык вместо программирования.

Покажу на реальных примерах, как интегрировать ИИ, находить клиентов и монетизировать эти навыки. Вас ждёт профессиональное сообщество, обмен опытом и нетворкинг.

Оргвзнос: 300 бат. Присоединяйтесь!`

interface TestConfig {
  modelId: string
  type: 'text' | 'image'
  imageUrl?: string
  mockMode?: boolean
  enablePolling?: boolean
  timeout?: number
}

interface TestResult {
  modelId: string
  type: 'text' | 'image'
  success: boolean
  taskId?: string
  videoUrl?: string
  cost?: {
    usd: number
    stars: number
  }
  processingTime?: number
  error?: string
  webhookUrl?: string
  notes?: string[]
}

class VideoModelsTestSuite {
  private kieProvider: KieAiProvider
  private results: TestResult[] = []

  constructor() {
    this.kieProvider = new KieAiProvider()
  }

  /**
   * Валидация конфигурации всех моделей (БЕЗ API вызовов)
   */
  async validateAllModels(): Promise<void> {
    console.log('\n🔍 ============ MODEL CONFIGURATION VALIDATION ============\n')

    const textToVideoModels = Object.values(VIDEO_MODELS).filter(m =>
      m.inputTypes.includes('text')
    )

    const imageToVideoModels = Object.values(VIDEO_MODELS).filter(m =>
      m.inputTypes.includes('image')
    )

    console.log('📊 Text-to-Video Models:', textToVideoModels.length)
    textToVideoModels.forEach((model, i) => {
      const config = VIDEO_MODELS_CONFIG[model.id]
      const hasConfig = !!config
      const hasWebhook = this.getWebhookUrl(model.id)
      const provider = this.getProvider(model.id)

      console.log(`  ${i + 1}. ${model.name} (${model.id})`)
      console.log(`     ├─ Config: ${hasConfig ? '✅' : '❌'}`)
      console.log(`     ├─ Provider: ${provider}`)
      console.log(`     ├─ Price: ${model.priceFixed || 'dynamic'}⭐`)
      console.log(`     └─ Webhook: ${hasWebhook || 'polling'}`)
    })

    console.log('\n📊 Image-to-Video Models:', imageToVideoModels.length)
    imageToVideoModels.forEach((model, i) => {
      const config = VIDEO_MODELS_CONFIG[model.id]
      const hasConfig = !!config
      const hasWebhook = this.getWebhookUrl(model.id)
      const provider = this.getProvider(model.id)

      console.log(`  ${i + 1}. ${model.name} (${model.id})`)
      console.log(`     ├─ Config: ${hasConfig ? '✅' : '❌'}`)
      console.log(`     ├─ Provider: ${provider}`)
      console.log(`     ├─ Price: ${model.priceFixed || 'dynamic'}⭐`)
      console.log(`     ├─ ImageKey: ${config?.imageKey || 'N/A'}`)
      console.log(`     └─ Webhook: ${hasWebhook || 'polling'}`)
    })

    console.log('\n✅ Validation complete\n')
  }

  /**
   * Проверка доступности webhook endpoints
   */
  async validateWebhooks(): Promise<void> {
    console.log('\n🔍 ============ WEBHOOK VALIDATION ============\n')

    const webhooks = [
      {
        name: 'Kie.ai General Callback',
        url: `${process.env.BASE_WEBHOOK_URL || 'https://three-head-dragon.shop'}/api/kie-ai/callback`,
        models: ['veo3_fast', 'veo3', 'runway-aleph'],
      },
      {
        name: 'Sora Callback',
        url: `${process.env.BASE_WEBHOOK_URL || 'https://three-head-dragon.shop'}/api/kie-ai/sora-callback`,
        models: ['sora-2', 'sora-2-pro'],
      },
    ]

    for (const webhook of webhooks) {
      console.log(`\n📡 Testing: ${webhook.name}`)
      console.log(`   URL: ${webhook.url}`)
      console.log(`   Models: ${webhook.models.join(', ')}`)

      try {
        const testPayload = {
          taskId: 'test-validation-' + Date.now(),
          successFlag: 1,
          videoUrl: 'https://example.com/test.mp4',
          resultUrls: ['https://example.com/test.mp4'],
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testPayload),
        })

        if (response.status === 202) {
          console.log(`   ✅ Webhook accessible (202 Accepted)`)
        } else {
          console.log(`   ⚠️  Unexpected status: ${response.status}`)
        }
      } catch (error) {
        console.log(`   ❌ Webhook not accessible: ${error.message}`)
      }
    }

    console.log('\n✅ Webhook validation complete\n')
  }

  /**
   * Тестирование одной модели
   */
  async testModel(config: TestConfig): Promise<TestResult> {
    const { modelId, type, imageUrl, mockMode = false, enablePolling = false } = config

    console.log(`\n🎬 ============ TESTING MODEL: ${modelId} ============\n`)
    console.log(`Type: ${type}`)
    console.log(`Mock Mode: ${mockMode ? 'YES' : 'NO (REAL API CALLS!)'}`)
    console.log(`Image: ${imageUrl || 'N/A'}`)
    console.log(`Polling: ${enablePolling ? 'YES' : 'NO (webhook only)'}`)

    const result: TestResult = {
      modelId,
      type,
      success: false,
      notes: [],
    }

    try {
      // Проверка конфигурации
      const modelInfo = VIDEO_MODELS[modelId]
      if (!modelInfo) {
        throw new Error(`Model ${modelId} not found in VIDEO_MODELS`)
      }

      result.notes!.push(`Model: ${modelInfo.name}`)
      result.notes!.push(`Price: ${modelInfo.priceFixed || 'dynamic'}⭐`)

      // Проверка поддержки типа
      if (!modelInfo.inputTypes.includes(type)) {
        throw new Error(`Model ${modelId} does not support ${type} input`)
      }

      if (type === 'image' && !imageUrl) {
        throw new Error('imageUrl is required for image-to-video tests')
      }

      // Mock mode - только валидация
      if (mockMode) {
        console.log('✅ Mock mode: Configuration valid')
        result.success = true
        result.notes!.push('Mock test - no real API call')
        return result
      }

      // Реальный API вызов
      console.log('⚠️  REAL API CALL - This will cost money!')

      const provider = this.getProvider(modelId)
      result.notes!.push(`Provider: ${provider}`)

      if (provider.includes('Kie.ai') || provider.includes('Sora')) {
        // Kie.ai models
        result.webhookUrl = this.getWebhookUrl(modelId)
        result.notes!.push(`Webhook: ${result.webhookUrl}`)

        if (modelId === 'sora-2' || modelId === 'sora-2-pro') {
          // Sora models
          const soraModel =
            modelId === 'sora-2-pro' ? 'sora-2-pro-text-to-video' : 'sora-2-text-to-video'
          const aspectRatio = 'landscape' // Default for test

          const response = await this.kieProvider.generateSoraVideo(
            STANDARD_TEST_PROMPT,
            soraModel,
            aspectRatio,
            false
          )

          result.success = response.success
          result.taskId = response.data?.taskId
          result.cost = response.cost
          result.error = response.error

          if (response.success && response.data?.taskId) {
            console.log(`✅ Sora task created: ${response.data.taskId}`)

            if (enablePolling) {
              console.log('🔄 Polling for result...')
              const pollingResult = await this.kieProvider.pollSoraTaskStatus(
                response.data.taskId
              )
              result.videoUrl = pollingResult.data?.videoUrl
              result.processingTime = pollingResult.processingTime
            } else {
              console.log('⏭️  Polling disabled - waiting for webhook callback')
              result.notes!.push('Webhook callback pending')
            }
          }
        } else {
          // Veo 3 / Runway models
          const response = await this.kieProvider.generateVideo({
            model: modelId,
            prompt: STANDARD_TEST_PROMPT,
            duration: 8, // Default
            aspectRatio: '16:9',
            imageUrl: type === 'image' ? imageUrl : undefined,
          })

          result.success = response.success
          result.taskId = response.data?.taskId
          result.cost = response.cost
          result.videoUrl = response.data?.videoUrl
          result.processingTime = response.processingTime
          result.error = response.error

          if (response.success && response.data?.taskId) {
            console.log(`✅ Task created: ${response.data.taskId}`)

            if (enablePolling) {
              console.log('🔄 Polling for result...')
              const pollingResult = await this.kieProvider.checkVideoStatus(
                response.data.taskId
              )
              result.videoUrl = pollingResult.data?.videoUrl
            } else {
              console.log('⏭️  Polling disabled - waiting for webhook callback')
              result.notes!.push('Webhook callback pending')
            }
          }
        }
      } else {
        // Replicate models - требуют другой провайдер
        throw new Error(`Provider ${provider} testing not implemented yet`)
      }

      console.log('\n📊 Test Result:')
      console.log(`   Success: ${result.success ? '✅' : '❌'}`)
      console.log(`   Task ID: ${result.taskId || 'N/A'}`)
      console.log(`   Cost: ${result.cost?.stars || 0}⭐ ($${result.cost?.usd || 0})`)
      console.log(`   Processing Time: ${result.processingTime || 0}ms`)
      console.log(`   Video URL: ${result.videoUrl ? '✅ Received' : '⏳ Pending'}`)
      if (result.error) {
        console.log(`   Error: ${result.error}`)
      }
    } catch (error) {
      result.success = false
      result.error = error.message
      console.log(`\n❌ Test failed: ${error.message}`)
    }

    this.results.push(result)
    return result
  }

  /**
   * Генерация отчета по всем тестам
   */
  generateReport(): void {
    console.log('\n📝 ============ TEST REPORT ============\n')
    console.log(`Total Tests: ${this.results.length}`)
    console.log(`Successful: ${this.results.filter(r => r.success).length}`)
    console.log(`Failed: ${this.results.filter(r => !r.success).length}`)

    console.log('\n## Text-to-Video Results\n')
    console.log('| Model | Status | Task ID | Cost | Notes |')
    console.log('|-------|--------|---------|------|-------|')

    this.results
      .filter(r => r.type === 'text')
      .forEach(r => {
        const status = r.success ? '✅' : '❌'
        const taskId = r.taskId || '-'
        const cost = r.cost ? `${r.cost.stars}⭐` : '-'
        const notes = r.notes?.join('; ') || r.error || '-'
        console.log(`| ${r.modelId} | ${status} | ${taskId} | ${cost} | ${notes} |`)
      })

    console.log('\n## Image-to-Video Results\n')
    console.log('| Model | Status | Task ID | Cost | Notes |')
    console.log('|-------|--------|---------|------|-------|')

    this.results
      .filter(r => r.type === 'image')
      .forEach(r => {
        const status = r.success ? '✅' : '❌'
        const taskId = r.taskId || '-'
        const cost = r.cost ? `${r.cost.stars}⭐` : '-'
        const notes = r.notes?.join('; ') || r.error || '-'
        console.log(`| ${r.modelId} | ${status} | ${taskId} | ${cost} | ${notes} |`)
      })

    console.log('\n')
  }

  private getProvider(modelId: string): string {
    if (modelId === 'sora-2' || modelId === 'sora-2-pro') {
      return 'Kie.ai Sora 2'
    }
    if (['veo3_fast', 'veo3', 'runway-aleph'].includes(modelId)) {
      return 'Kie.ai'
    }
    return 'Replicate'
  }

  private getWebhookUrl(modelId: string): string | null {
    const baseUrl = process.env.BASE_WEBHOOK_URL || 'https://three-head-dragon.shop'

    if (modelId === 'sora-2' || modelId === 'sora-2-pro') {
      return `${baseUrl}/api/kie-ai/sora-callback`
    }

    if (['veo3_fast', 'veo3', 'runway-aleph'].includes(modelId)) {
      return `${baseUrl}/api/kie-ai/callback`
    }

    return null // Replicate uses polling
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2)
  const suite = new VideoModelsTestSuite()

  // Parse CLI arguments
  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`))
    return arg?.split('=')[1]
  }

  const hasFlag = (name: string): boolean => {
    return args.includes(`--${name}`)
  }

  const command = args[0]

  try {
    switch (command) {
      case 'validate':
        await suite.validateAllModels()
        break

      case 'webhooks':
        await suite.validateWebhooks()
        break

      case 'test':
        const modelId = getArg('model')
        const type = getArg('type') as 'text' | 'image' | undefined
        const imageUrl = getArg('image')
        const mockMode = hasFlag('mock')
        const enablePolling = !hasFlag('no-polling')

        if (!modelId || !type) {
          console.error('Usage: npm run test:model -- test --model=<id> --type=<text|image> [--image=<url>] [--mock] [--no-polling]')
          process.exit(1)
        }

        await suite.testModel({
          modelId,
          type,
          imageUrl,
          mockMode,
          enablePolling,
        })
        suite.generateReport()
        break

      case 'batch':
        // Batch testing (mock mode only to avoid costs)
        console.log('⚠️  Batch testing in mock mode to avoid costs')
        const models = ['veo3_fast', 'veo3', 'sora-2', 'sora-2-pro', 'runway-aleph']

        for (const model of models) {
          await suite.testModel({
            modelId: model,
            type: 'text',
            mockMode: true,
          })
        }

        suite.generateReport()
        break

      default:
        console.log('🎬 Video Models Test Suite')
        console.log('')
        console.log('Commands:')
        console.log('  validate        - Validate all model configurations (no API calls)')
        console.log('  webhooks        - Test webhook endpoint availability')
        console.log('  test            - Test a single model (REAL API CALL!)')
        console.log('  batch           - Batch test multiple models (mock mode)')
        console.log('')
        console.log('Examples:')
        console.log('  npm run test:model -- validate')
        console.log('  npm run test:model -- webhooks')
        console.log('  npm run test:model -- test --model=veo3_fast --type=text')
        console.log('  npm run test:model -- test --model=veo3_fast --type=image --image=<URL>')
        console.log('  npm run test:model -- test --model=sora-2 --type=text --no-polling')
        console.log('  npm run test:model -- batch')
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  main()
}

export { VideoModelsTestSuite, TestConfig, TestResult }
