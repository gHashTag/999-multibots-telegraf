#!/usr/bin/env ts-node
/**
 * Video Model Validation Script
 * Validates all 23 video generation models WITHOUT making real API calls
 */

import { UNIFIED_VIDEO_MODELS as VIDEO_MODELS_CONFIG } from '../src/config/unified-video-models.config'
import { KIE_AI_MODELS_PRICING } from '../src/price/constants'
import axios from 'axios'

interface ValidationResult {
  model: string
  status: 'PASS' | 'FAIL' | 'WARNING'
  issues: string[]
  details: Record<string, any>
}

const results: ValidationResult[] = []
const EXPECTED_MODELS_COUNT = 23

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

function log(color: keyof typeof colors, ...args: any[]) {
  console.log(colors[color], ...args, colors.reset)
}

// ============================================
// 1. CONFIGURATION VALIDATION
// ============================================

log('cyan', '\n=== 1. CONFIGURATION VALIDATION ===\n')

// Count models in unified configuration
const videoModelsConfigCount = Object.keys(VIDEO_MODELS_CONFIG).length

log('blue', `UNIFIED_VIDEO_MODELS: ${videoModelsConfigCount} models`)

if (videoModelsConfigCount !== EXPECTED_MODELS_COUNT) {
  log('red', `❌ Expected ${EXPECTED_MODELS_COUNT} models, found ${videoModelsConfigCount}`)
} else {
  log('green', `✅ UNIFIED_VIDEO_MODELS has correct count (${EXPECTED_MODELS_COUNT})`)
}

if (videoModelsConfigCount !== EXPECTED_MODELS_COUNT) {
  log('red', `❌ Expected ${EXPECTED_MODELS_COUNT} models in VIDEO_MODELS_CONFIG, found ${videoModelsConfigCount}`)
} else {
  log('green', `✅ VIDEO_MODELS_CONFIG has correct count (${EXPECTED_MODELS_COUNT})`)
}

// List all models
log('cyan', '\n=== ALL MODELS LIST ===\n')
Object.keys(VIDEO_MODELS_CONFIG).forEach((modelId, index) => {
  const model = VIDEO_MODELS_CONFIG[modelId as keyof typeof VIDEO_MODELS_CONFIG]
  const config = VIDEO_MODELS_CONFIG[modelId]

  log('white', `${index + 1}. ${modelId}`)
  log('white', `   Name: ${model.name} (${model.nameRu})`)
  log('white', `   Input Types: ${model.inputTypes.join(', ')}`)
  log('white', `   Price: ${model.priceFixed !== undefined ? `${model.priceFixed}⭐ (fixed)` : `$${model.pricePerSecond}/sec (dynamic)`}`)
  log('white', `   Has Config: ${config ? '✅' : '❌'}`)
  console.log()
})

// ============================================
// 2. MODEL VALIDATION
// ============================================

log('cyan', '\n=== 2. MODEL-BY-MODEL VALIDATION ===\n')

for (const [modelId, model] of Object.entries(VIDEO_MODELS_CONFIG)) {
  const issues: string[] = []
  const details: Record<string, any> = {}

  // Check if model exists in VIDEO_MODELS_CONFIG
  const config = VIDEO_MODELS_CONFIG[modelId]
  if (!config) {
    issues.push(`Missing entry in VIDEO_MODELS_CONFIG`)
  } else {
    details.hasConfig = true
  }

  // Validate pricing
  if (model.priceFixed === undefined && model.pricePerSecond === undefined) {
    issues.push('No pricing information (neither priceFixed nor pricePerSecond)')
  } else if (model.priceFixed !== undefined) {
    details.pricingType = 'fixed'
    details.price = `${model.priceFixed}⭐`
  } else {
    details.pricingType = 'dynamic'
    details.pricePerSecond = `$${model.pricePerSecond}/sec`
  }

  // Validate input types
  if (!model.inputTypes || model.inputTypes.length === 0) {
    issues.push('No input types specified')
  } else {
    details.inputTypes = model.inputTypes.join(', ')
  }

  // Validate provider
  const isKieAiModel = ['veo3', 'veo3_fast', 'runway-aleph', 'sora-2', 'sora-2-pro'].includes(modelId)
  const isReplicateModel = !isKieAiModel

  details.provider = isKieAiModel ? 'Kie.ai' : 'Replicate'

  // Check Kie.ai specific config
  if (isKieAiModel) {
    const kieConfig = KIE_AI_MODELS_PRICING[modelId]
    if (!kieConfig) {
      issues.push('Missing entry in KIE_AI_MODELS_PRICING')
    } else {
      details.hasKieConfig = true
      details.kieConfig = {
        pricePerSecondUSD: kieConfig.pricePerSecondUSD,
        supportedDurations: kieConfig.supportedDurations,
        defaultDuration: kieConfig.defaultDuration,
      }
    }
  }

  // Check image-to-video requirements
  if (model.inputTypes.includes('image')) {
    if (config && !config.imageKey) {
      issues.push('Image-to-video model missing imageKey in config')
    } else if (config) {
      details.imageKey = config.imageKey
    }
  }

  // Check aspect ratio options
  if (config?.aspectRatioOptions) {
    details.aspectRatioOptions = config.aspectRatioOptions.join(', ')
  }

  // Check duration options
  if (config?.durationOptions) {
    details.durationOptions = config.durationOptions.join(', ')
  }

  // Determine status
  const status: 'PASS' | 'FAIL' | 'WARNING' = issues.length === 0 ? 'PASS' :
                                               issues.some(i => i.includes('Missing')) ? 'FAIL' : 'WARNING'

  results.push({
    model: modelId,
    status,
    issues,
    details,
  })

  // Log result
  const statusColor = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'yellow'
  log(statusColor, `${status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'} ${modelId} - ${status}`)

  if (issues.length > 0) {
    issues.forEach(issue => log('red', `   - ${issue}`))
  }

  Object.entries(details).forEach(([key, value]) => {
    log('white', `   ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
  })
  console.log()
}

// ============================================
// 3. WEBHOOK VALIDATION
// ============================================

log('cyan', '\n=== 3. WEBHOOK VALIDATION ===\n')

const BASE_WEBHOOK_URL = process.env.BASE_WEBHOOK_URL || 'https://ai-server-production-production-8e2d.up.railway.app'
const KIE_AI_WEBHOOK = `${BASE_WEBHOOK_URL}/api/kie-ai/callback`
const SORA_WEBHOOK = `${BASE_WEBHOOK_URL}/api/kie-ai/sora-callback`

log('blue', `Base Webhook URL: ${BASE_WEBHOOK_URL}`)
log('blue', `Kie.ai Webhook: ${KIE_AI_WEBHOOK}`)
log('blue', `Sora Webhook: ${SORA_WEBHOOK}`)

// Test webhook accessibility (HEAD request only, no actual call)
async function testWebhookAccessibility(url: string, name: string): Promise<boolean> {
  try {
    log('white', `\nTesting ${name} accessibility...`)
    // Using HEAD to check if endpoint exists without making a full request
    const response = await axios.head(url, {
      timeout: 5000,
      validateStatus: (status) => status < 500 // Accept any non-500 status
    })
    log('green', `✅ ${name} is accessible (status: ${response.status})`)
    return true
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      log('red', `❌ ${name} is NOT accessible (${error.code})`)
      return false
    } else if (error.response) {
      // Got a response, endpoint exists
      log('green', `✅ ${name} endpoint exists (status: ${error.response.status})`)
      return true
    } else {
      log('yellow', `⚠️ ${name} test inconclusive: ${error.message}`)
      return false
    }
  }
}

// Test webhooks
async function runWebhookTests() {
  const webhookTests = [
    { url: KIE_AI_WEBHOOK, name: 'Kie.ai Webhook (Veo, Runway)' },
    { url: SORA_WEBHOOK, name: 'Sora Webhook (Sora 2, Sora 2 Pro)' },
  ]

  for (const test of webhookTests) {
    await testWebhookAccessibility(test.url, test.name)
  }
}

runWebhookTests().then(() => {
  // Continue with rest of validation
  continueValidation()
}).catch(err => {
  log('red', `Webhook test error: ${err.message}`)
  continueValidation()
})

function continueValidation() {

// ============================================
// 4. PROVIDER VALIDATION
// ============================================

log('cyan', '\n=== 4. PROVIDER VALIDATION ===\n')

const kieAiModels = Object.keys(VIDEO_MODELS_CONFIG).filter(id =>
  ['veo3', 'veo3_fast', 'runway-aleph', 'sora-2', 'sora-2-pro'].includes(id)
)

const replicateModels = Object.keys(VIDEO_MODELS_CONFIG).filter(id =>
  !['veo3', 'veo3_fast', 'runway-aleph', 'sora-2', 'sora-2-pro'].includes(id)
)

log('blue', `Kie.ai Models (${kieAiModels.length}):`)
kieAiModels.forEach(id => log('white', `  - ${id}`))

log('blue', `\nReplicate Models (${replicateModels.length}):`)
replicateModels.forEach(id => log('white', `  - ${id}`))

// ============================================
// 5. PARAMETER VALIDATION
// ============================================

log('cyan', '\n=== 5. PARAMETER VALIDATION ===\n')

const imageToVideoModels = Object.entries(VIDEO_MODELS)
  .filter(([_, model]) => model.inputTypes.includes('image'))
  .map(([id]) => id)

log('blue', `Image-to-Video Models (${imageToVideoModels.length}):`)
imageToVideoModels.forEach(id => {
  const config = VIDEO_MODELS_CONFIG[id]
  const hasImageKey = config && config.imageKey
  log(hasImageKey ? 'green' : 'red', `  ${hasImageKey ? '✅' : '❌'} ${id}${hasImageKey ? ` (imageKey: ${config.imageKey})` : ' - MISSING imageKey'}`)
})

// ============================================
// 6. SUMMARY REPORT
// ============================================

log('cyan', '\n=== 6. VALIDATION SUMMARY ===\n')

const passCount = results.filter(r => r.status === 'PASS').length
const failCount = results.filter(r => r.status === 'FAIL').length
const warningCount = results.filter(r => r.status === 'WARNING').length

log('green', `✅ PASSED: ${passCount}/${EXPECTED_MODELS_COUNT}`)
log('red', `❌ FAILED: ${failCount}/${EXPECTED_MODELS_COUNT}`)
log('yellow', `⚠️ WARNINGS: ${warningCount}/${EXPECTED_MODELS_COUNT}`)

if (failCount > 0) {
  log('red', '\n❌ CRITICAL ISSUES FOUND:')
  results.filter(r => r.status === 'FAIL').forEach(result => {
    log('red', `\n${result.model}:`)
    result.issues.forEach(issue => log('red', `  - ${issue}`))
  })
}

if (warningCount > 0) {
  log('yellow', '\n⚠️ WARNINGS:')
  results.filter(r => r.status === 'WARNING').forEach(result => {
    log('yellow', `\n${result.model}:`)
    result.issues.forEach(issue => log('yellow', `  - ${issue}`))
  })
}

// ============================================
// 7. RECOMMENDATIONS
// ============================================

log('cyan', '\n=== 7. RECOMMENDATIONS ===\n')

if (failCount === 0 && warningCount === 0) {
  log('green', '🎉 All validations passed! No issues found.')
} else {
  log('yellow', '📝 Recommendations for fixes:')

  if (videoModelsCount !== EXPECTED_MODELS_COUNT) {
    log('yellow', `  1. Add missing models to VIDEO_MODELS to reach ${EXPECTED_MODELS_COUNT}`)
  }

  if (videoModelsConfigCount !== EXPECTED_MODELS_COUNT) {
    log('yellow', `  2. Add missing models to VIDEO_MODELS_CONFIG to reach ${EXPECTED_MODELS_COUNT}`)
  }

  const missingImageKeys = results.filter(r => r.issues.some(i => i.includes('imageKey')))
  if (missingImageKeys.length > 0) {
    log('yellow', `  3. Add imageKey to config for: ${missingImageKeys.map(r => r.model).join(', ')}`)
  }

  const missingKieConfig = results.filter(r => r.issues.some(i => i.includes('KIE_AI_MODELS_PRICING')))
  if (missingKieConfig.length > 0) {
    log('yellow', `  4. Add Kie.ai pricing config for: ${missingKieConfig.map(r => r.model).join(', ')}`)
  }
}

  log('cyan', '\n=== VALIDATION COMPLETE ===\n')

  // Exit with appropriate code
  process.exit(failCount > 0 ? 1 : 0)
}
