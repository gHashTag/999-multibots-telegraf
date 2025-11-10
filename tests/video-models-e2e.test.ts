/**
 * E2E Integration Tests for All Video Models
 *
 * Tests all active video models from unified configuration to verify:
 * - Text-to-Video generation works
 * - Image-to-Video generation works
 * - Correct provider is used (Kie.ai vs Replicate)
 * - Pricing calculations are correct
 * - API responses are valid
 *
 * Run with: npm run test:vitest -- tests/video-models-e2e.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import {
  UNIFIED_VIDEO_MODELS,
  getUnifiedModelConfig,
  getUnifiedModelPrice,
  getActiveModels
} from '@/config/unified-video-models.config'
import { KieAiProvider } from '@/services/video-providers/KieAiProvider'
import Replicate from 'replicate'

// Test configuration
const TEST_TIMEOUT = 600000 // 10 minutes per test (video generation can be slow)
const TEST_PROMPT = 'A serene mountain landscape at sunset with golden hour lighting'
const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4' // Sample mountain image

// Skip actual API calls in CI (use mock mode)
const SKIP_ACTUAL_GENERATION = !process.env.KIE_AI_API_KEY || !process.env.REPLICATE_API_TOKEN

// Test results tracking
interface TestResult {
  modelId: string
  name: string
  provider: string
  inputTypes: string[]
  priceCalculated: number
  success: boolean
  error?: string
  skipped?: boolean
  duration?: number
}

const testResults: TestResult[] = []

describe('Video Models E2E Integration Tests', () => {
  let kieProvider: KieAiProvider
  let replicate: Replicate

  beforeAll(() => {
    kieProvider = new KieAiProvider()
    replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN || '',
    })
  })

  // ============================================================================
  // TEST ALL ACTIVE MODELS FROM UNIFIED CONFIG
  // ============================================================================

  describe('Unified Config - All Active Models', () => {
    const activeModels = getActiveModels()

    console.log(`\n📋 Testing ${activeModels.length} active models from unified config:\n`)
    activeModels.forEach(model => {
      console.log(`  - ${model.name} (${model.id}) - ${model.provider} - ${model.inputTypes.join('/')}`)
    })

    activeModels.forEach((model) => {
      test(`${model.name} (${model.id}) - ${model.provider} - ${model.inputTypes.join('/')}`, async () => {
        const startTime = Date.now()
        const price = getUnifiedModelPrice(model.id)

        // Record basic info
        const result: TestResult = {
          modelId: model.id,
          name: model.name,
          provider: model.provider,
          inputTypes: model.inputTypes,
          priceCalculated: price,
          success: false,
          skipped: SKIP_ACTUAL_GENERATION
        }

        try {
          // Verify basic model configuration
          expect(model.id).toBeTruthy()
          expect(model.name).toBeTruthy()
          expect(model.provider).toMatch(/^(kie|replicate)$/)
          expect(model.inputTypes.length).toBeGreaterThan(0)
          expect(price).toBeGreaterThan(0)

          // If skipping actual generation, just verify config
          if (SKIP_ACTUAL_GENERATION) {
            result.success = true
            result.duration = Date.now() - startTime
            testResults.push(result)
            expect(model).toBeDefined() // Config is valid
            return
          }

          // Test actual generation based on provider
          if (model.provider === 'kie') {
            const testInput = model.inputTypes.includes('image')
              ? { model: model.id, prompt: TEST_PROMPT, aspectRatio: '16:9', imageUrl: TEST_IMAGE_URL }
              : { model: model.id, prompt: TEST_PROMPT, aspectRatio: '16:9' }

            const response = await kieProvider.generateVideo(testInput)

            expect(response).toBeDefined()
            expect(response.success).toBe(true)
            expect(response.data.taskId || response.data.videoUrl).toBeTruthy()

            result.success = true
          } else if (model.provider === 'replicate') {
            const imageKey = model.apiSettings.imageKey || 'image'
            const testInput: Record<string, any> = {
              prompt: TEST_PROMPT,
              ...model.apiSettings.baseInput
            }

            if (model.inputTypes.includes('image')) {
              testInput[imageKey] = TEST_IMAGE_URL
            }

            const output = await replicate.run(model.apiModel as any, { input: testInput })

            expect(output).toBeDefined()
            result.success = true
          }

          result.duration = Date.now() - startTime
          testResults.push(result)
        } catch (error) {
          result.error = (error as Error).message
          result.duration = Date.now() - startTime
          testResults.push(result)
          throw error
        }
      }, TEST_TIMEOUT)
    })
  })

  // ============================================================================
  // PRICING VALIDATION TESTS
  // ============================================================================

  describe('Pricing Validation', () => {
    test('All models have valid pricing', () => {
      const activeModels = getActiveModels()

      activeModels.forEach(model => {
        const price = getUnifiedModelPrice(model.id)
        expect(price).toBeGreaterThan(0)
        expect(typeof price).toBe('number')
        expect(isFinite(price)).toBe(true)
      })
    })

    test('Fixed price models have correct pricing', () => {
      const fixedPriceModels = getActiveModels().filter(m => m.pricing.type === 'fixed')

      fixedPriceModels.forEach(model => {
        const price = getUnifiedModelPrice(model.id)
        expect(price).toBe(model.pricing.fixedPriceStars!)
      })
    })

    test('Per-second models calculate pricing correctly', () => {
      const activeModels = getActiveModels()
      const perSecondModel = activeModels.find(m => m.pricing.type === 'per_second')

      if (perSecondModel) {
        const defaultDuration = perSecondModel.pricing.defaultDuration || 5
        const price = getUnifiedModelPrice(perSecondModel.id, { duration: defaultDuration })
        expect(price).toBeGreaterThan(0)
      }
    })
  })

  // ============================================================================
  // MODEL CONFIGURATION VALIDATION
  // ============================================================================

  describe('Model Configuration Validation', () => {
    test('All models have required fields', () => {
      const activeModels = getActiveModels()

      activeModels.forEach(model => {
        expect(model.id).toBeTruthy()
        expect(model.name).toBeTruthy()
        expect(model.nameRu).toBeTruthy()
        expect(model.description).toBeTruthy()
        expect(model.provider).toMatch(/^(kie|replicate)$/)
        expect(model.apiModel).toBeTruthy()
        expect(model.inputTypes.length).toBeGreaterThan(0)
        expect(model.pricing).toBeDefined()
        expect(model.apiSettings).toBeDefined()
        expect(model.status).toBe('active')
      })
    })

    test('Kie.ai models have correct configuration', () => {
      const kieModels = getActiveModels().filter(m => m.provider === 'kie')

      kieModels.forEach(model => {
        expect(model.apiSettings.aspectRatios).toBeDefined()
        expect(model.apiSettings.aspectRatios!.length).toBeGreaterThan(0)

        if (model.inputTypes.includes('image')) {
          expect(model.apiSettings.imageKey).toBe('imageUrl')
        }
      })
    })

    test('Replicate models have correct configuration', () => {
      const replicateModels = getActiveModels().filter(m => m.provider === 'replicate')

      replicateModels.forEach(model => {
        expect(model.apiModel).toContain('/')

        if (model.inputTypes.includes('image')) {
          expect(model.apiSettings.imageKey).toBeDefined()
        }
      })
    })
  })

  // ============================================================================
  // GENERATE TEST REPORT
  // ============================================================================

  afterAll(() => {
    console.log('\n\n' + '='.repeat(80))
    console.log('VIDEO MODELS E2E TEST REPORT')
    console.log('='.repeat(80))

    if (SKIP_ACTUAL_GENERATION) {
      console.log('\n⚠️  API KEYS NOT PROVIDED - Configuration validation only')
      console.log('   Set KIE_AI_API_KEY and REPLICATE_API_TOKEN to test actual generation\n')
    }

    const successful = testResults.filter(r => r.success)
    const failed = testResults.filter(r => !r.success)
    const skipped = testResults.filter(r => r.skipped)

    // Group by provider
    const kieModels = testResults.filter(r => r.provider === 'kie')
    const replicateModels = testResults.filter(r => r.provider === 'replicate')

    console.log(`\n📊 SUMMARY:`)
    console.log(`   Total Models: ${testResults.length}`)
    console.log(`   ✅ Successful: ${successful.length}`)
    console.log(`   ❌ Failed: ${failed.length}`)
    if (skipped.length > 0) {
      console.log(`   ⏭️  Skipped (config only): ${skipped.length}`)
    }

    console.log(`\n🔧 BY PROVIDER:`)
    console.log(`   Kie.ai: ${kieModels.length} models`)
    console.log(`   Replicate: ${replicateModels.length} models`)

    console.log(`\n✅ WORKING MODELS (${successful.length}):`)
    successful.forEach(result => {
      const durationStr = result.duration ? `${(result.duration / 1000).toFixed(1)}s` : 'N/A'
      const statusIcon = result.skipped ? '⚙️' : '✓'
      console.log(`  ${statusIcon} ${result.name} (${result.provider}) - ${result.inputTypes.join('/')} - ${result.priceCalculated}⭐ - ${durationStr}`)
    })

    if (failed.length > 0) {
      console.log(`\n❌ FAILED MODELS (${failed.length}):`)
      failed.forEach(result => {
        console.log(`  ✗ ${result.name} (${result.provider}) - ${result.inputTypes.join('/')}`)
        if (result.error) {
          const shortError = result.error.length > 100 ? result.error.substring(0, 100) + '...' : result.error
          console.log(`    Error: ${shortError}`)
        }
      })
    }

    console.log('\n💰 PRICING RANGE:')
    const prices = testResults.map(r => r.priceCalculated).filter(p => p > 0)
    if (prices.length > 0) {
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
      console.log(`   Min: ${minPrice}⭐ | Max: ${maxPrice}⭐ | Avg: ${avgPrice}⭐`)
    }

    console.log('\n' + '='.repeat(80))
    if (testResults.length > 0) {
      console.log(`SUCCESS RATE: ${((successful.length / testResults.length) * 100).toFixed(1)}%`)
    }
    console.log('='.repeat(80) + '\n')
  })
})
