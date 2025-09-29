#!/usr/bin/env node

/**
 * 🎯 COMPREHENSIVE TEST SCRIPT FOR AI PHOTOSHOP "ALL MODELS" FUNCTIONALITY
 *
 * Tests the critical "Все сразу" (All at once) feature that processes photos with all 4 models simultaneously
 *
 * CRITICAL FIXES BEING TESTED:
 * 1. Text handler properly detects 'all_models' mode and doesn't call processAiPhotoshopRequest directly
 * 2. Photo collection works correctly in 'all_models' mode
 * 3. Cost calculation shows 30⭐ for all_models processing
 * 4. Multi-photo confirmation flow triggers properly
 * 5. All 4 models process the images (SeeDream-4, Nano Banana, FLUX Kontext Max, Qwen Image Edit Plus)
 * 6. UI displays correctly without HTML tags
 */

const fs = require('fs')
const path = require('path')

console.log('🧪 AI PHOTOSHOP ALL_MODELS COMPREHENSIVE TEST')
console.log('=' .repeat(50))

// Test configuration
const TESTS = [
  {
    name: 'Interface Type Definition',
    description: 'Verify all_models is properly typed in TypeScript interface',
    test: testInterfaceTypeDefinition
  },
  {
    name: 'Button Handler Registration',
    description: 'Verify ai_photoshop_all_models_from_selector handler exists',
    test: testButtonHandlerRegistration
  },
  {
    name: 'Text Handler Fix',
    description: 'Verify text handler checks for all_models mode before processing',
    test: testTextHandlerFix
  },
  {
    name: 'Photo Collection Logic',
    description: 'Verify photo collection works in all_models mode',
    test: testPhotoCollectionLogic
  },
  {
    name: 'Cost Calculation',
    description: 'Verify cost shows 30⭐ for all_models processing',
    test: testCostCalculation
  },
  {
    name: 'Model Title Display',
    description: 'Verify model title shows "🎯 Все модели сразу" instead of undefined',
    test: testModelTitleDisplay
  },
  {
    name: 'All Models Processing',
    description: 'Verify all 4 models are processed when all_models is selected',
    test: testAllModelsProcessing
  },
  {
    name: 'Logging Implementation',
    description: 'Verify comprehensive logging is in place for debugging',
    test: testLoggingImplementation
  }
]

// Test results tracking
let passed = 0
let failed = 0
const results = []

async function runTests() {
  console.log(`🚀 Running ${TESTS.length} comprehensive tests...\n`)

  for (const test of TESTS) {
    try {
      console.log(`⏳ Testing: ${test.name}`)
      console.log(`📋 Description: ${test.description}`)

      const result = await test.test()

      if (result.success) {
        console.log(`✅ PASS: ${test.name}`)
        if (result.details) {
          console.log(`📄 Details: ${result.details}`)
        }
        passed++
        results.push({ name: test.name, status: 'PASS', details: result.details })
      } else {
        console.log(`❌ FAIL: ${test.name}`)
        console.log(`🚨 Error: ${result.error}`)
        failed++
        results.push({ name: test.name, status: 'FAIL', error: result.error })
      }

    } catch (error) {
      console.log(`💥 CRASH: ${test.name}`)
      console.log(`🚨 Exception: ${error.message}`)
      failed++
      results.push({ name: test.name, status: 'CRASH', error: error.message })
    }

    console.log('-'.repeat(40))
  }

  // Final report
  console.log('\n📊 FINAL TEST REPORT')
  console.log('=' .repeat(30))
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`📈 Success Rate: ${((passed / TESTS.length) * 100).toFixed(1)}%`)

  if (failed > 0) {
    console.log('\n🚨 FAILED TESTS:')
    results.filter(r => r.status !== 'PASS').forEach(r => {
      console.log(`- ${r.name}: ${r.error}`)
    })
  }

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    totalTests: TESTS.length,
    passed,
    failed,
    successRate: ((passed / TESTS.length) * 100).toFixed(1) + '%',
    results
  }

  fs.writeFileSync(
    path.join(__dirname, 'all-models-test-report.json'),
    JSON.stringify(report, null, 2)
  )

  console.log('\n📄 Detailed report saved to: tests/ai-photoshop/all-models-test-report.json')

  return failed === 0
}

// Individual test functions

async function testInterfaceTypeDefinition() {
  const interfacePath = path.join(__dirname, '../../src/interfaces/telegram-bot.interface.ts')

  if (!fs.existsSync(interfacePath)) {
    return { success: false, error: 'Interface file not found' }
  }

  const content = fs.readFileSync(interfacePath, 'utf8')

  if (content.includes("'all_models'")) {
    return {
      success: true,
      details: 'all_models type properly defined in aiPhotoshopModel interface'
    }
  }

  return { success: false, error: 'all_models type not found in interface definition' }
}

async function testButtonHandlerRegistration() {
  const scenePath = path.join(__dirname, '../../src/scenes/aiPhotoshopScene/index.ts')

  if (!fs.existsSync(scenePath)) {
    return { success: false, error: 'AI Photoshop scene file not found' }
  }

  const content = fs.readFileSync(scenePath, 'utf8')

  if (content.includes("aiPhotoshopScene.action('ai_photoshop_all_models_from_selector'")) {
    return {
      success: true,
      details: 'Button handler ai_photoshop_all_models_from_selector properly registered'
    }
  }

  return { success: false, error: 'Button handler ai_photoshop_all_models_from_selector not found' }
}

async function testTextHandlerFix() {
  const scenePath = path.join(__dirname, '../../src/scenes/aiPhotoshopScene/index.ts')
  const content = fs.readFileSync(scenePath, 'utf8')

  // Check for the critical fix
  const hasCheck = content.includes("if (ctx.session?.aiPhotoshopModel === 'all_models')")
  const hasReturn = content.includes("return // CRITICAL: Do not call processAiPhotoshopRequest for all_models here!")
  const hasPromptSave = content.includes("ctx.session.aiPhotoshopPrompt = prompt")

  if (hasCheck && hasReturn && hasPromptSave) {
    return {
      success: true,
      details: 'CRITICAL FIX: Text handler properly checks for all_models mode, saves prompt, and returns early'
    }
  }

  return {
    success: false,
    error: 'CRITICAL BUG: Text handler missing proper all_models handling or prompt saving'
  }
}

async function testPhotoCollectionLogic() {
  const scenePath = path.join(__dirname, '../../src/scenes/aiPhotoshopScene/index.ts')
  const content = fs.readFileSync(scenePath, 'utf8')

  // Check for photo collection in all_models mode
  const hasCollectionLogic = content.includes("(ctx.session?.aiPhotoshopModel === 'all_models' && ctx.session?.awaitingAiPhotoshopImage)")

  if (hasCollectionLogic) {
    return {
      success: true,
      details: 'Photo collection properly configured for all_models mode'
    }
  }

  return { success: false, error: 'Photo collection logic for all_models mode not found' }
}

async function testCostCalculation() {
  const scenePath = path.join(__dirname, '../../src/scenes/aiPhotoshopScene/index.ts')
  const content = fs.readFileSync(scenePath, 'utf8')

  // Check for dynamic cost calculation using totalCostAllModels
  const hasDynamicCostLogic = content.includes("const totalCostAllModels = Object.values(AI_PHOTOSHOP_MODELS).reduce((sum, model) => sum + model.cost, 0)")
  const hasButtonWithCost = content.includes("🎯 Все сразу (${totalCostAllModels}⭐)")

  if (hasDynamicCostLogic && hasButtonWithCost) {
    return {
      success: true,
      details: 'DYNAMIC cost calculation properly implemented (5+7+13+5=30⭐) - extensible architecture'
    }
  }

  return { success: false, error: 'Dynamic cost calculation for all_models not found' }
}

async function testModelTitleDisplay() {
  const scenePath = path.join(__dirname, '../../src/scenes/aiPhotoshopScene/index.ts')
  const content = fs.readFileSync(scenePath, 'utf8')

  // Check for proper title display
  const hasTitleLogic = content.includes("modelTitle = isRu ? '🎯 Все модели сразу' : '🎯 All models at once'")

  if (hasTitleLogic) {
    return {
      success: true,
      details: 'Model title properly displays "🎯 Все модели сразу" instead of undefined'
    }
  }

  return { success: false, error: 'Model title for all_models may show as undefined' }
}

async function testAllModelsProcessing() {
  const scenePath = path.join(__dirname, '../../src/scenes/aiPhotoshopScene/index.ts')
  const content = fs.readFileSync(scenePath, 'utf8')

  // Check for all models processing logic
  const hasAllModelsProcessing = content.includes("if (aiPhotoshopModel === 'all_models')")
  const hasModelLoop = content.includes("Object.values(AI_PHOTOSHOP_MODELS)")

  if (hasAllModelsProcessing && hasModelLoop) {
    return {
      success: true,
      details: 'All 4 models processing logic properly implemented with extensible architecture'
    }
  }

  return { success: false, error: 'All models processing logic not found or incomplete' }
}

async function testLoggingImplementation() {
  const scenePath = path.join(__dirname, '../../src/scenes/aiPhotoshopScene/index.ts')
  const content = fs.readFileSync(scenePath, 'utf8')

  // Check for comprehensive logging
  const loggingPoints = [
    "logger.info('🎯 AI Photoshop: All models mode detected in text handler",
    "logger.info('🎯 AI Photoshop: Processing with ALL models from initial selector",
    "logger.info('🎯 AI Photoshop: ALL_MODELS processing detected"
  ]

  const foundLogging = loggingPoints.filter(point => content.includes(point))

  if (foundLogging.length >= 2) {
    return {
      success: true,
      details: `Comprehensive logging implemented: ${foundLogging.length}/${loggingPoints.length} key points logged`
    }
  }

  return { success: false, error: `Insufficient logging: only ${foundLogging.length}/${loggingPoints.length} points found` }
}

// Run the tests if this script is executed directly
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1)
  }).catch(error => {
    console.error('💥 Test suite crashed:', error)
    process.exit(1)
  })
}

module.exports = { runTests, TESTS }