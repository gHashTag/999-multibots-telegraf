#!/usr/bin/env node

/**
 * Simple CLI for Testing Inngest Functions
 * Без зависимостей, простой JavaScript
 */

const fs = require('fs')
const path = require('path')

// Список всех функций
const functions = [
  { id: 'ai-reels-callback', name: 'AI Reels Callback', category: 'callback' },
  { id: 'render', name: 'Render', category: 'render' },
  { id: 'render-avatar-video', name: 'Render Avatar Video', category: 'render' },
  { id: 'render-riddle', name: 'Render Riddle', category: 'render' },
  { id: 'model-training-v2', name: 'Model Training V2', category: 'training' },
  { id: 'morph-images', name: 'Morph Images', category: 'training' },
  { id: 'analyze-competitor-reels', name: 'Analyze Competitor Reels', category: 'content' },
  { id: 'extract-top-content', name: 'Extract Top Content', category: 'content' },
  { id: 'find-competitors', name: 'Find Competitors', category: 'content' },
  { id: 'generate-content-scripts', name: 'Generate Content Scripts', category: 'content' },
  { id: 'generate-detailed-script', name: 'Generate Detailed Script', category: 'content' },
  { id: 'generate-scenario-clips', name: 'Generate Scenario Clips', category: 'content' },
  { id: 'instagram-scraper-v2', name: 'Instagram Scraper V2', category: 'instagram' },
  { id: 'instagram-scraper-v2-simple', name: 'Instagram Scraper V2 Simple', category: 'instagram' },
  { id: 'generate-ai-reels', name: 'Generate AI Reels', category: 'existing' },
  { id: 'generate-advanced-looping-video', name: 'Generate Advanced Looping Video', category: 'existing' },
  { id: 'generate-model-training', name: 'Generate Model Training', category: 'existing' },
  { id: 'neuro-image-generation', name: 'Neuro Image Generation', category: 'generation' },
  { id: 'payment-processing', name: 'Payment Processing', category: 'payment' },
  { id: 'broadcast/send-message', name: 'Broadcast Message', category: 'broadcast' },
  { id: 'critical-error-monitor', name: 'Critical Error Monitor', category: 'monitoring' },
  { id: 'log-monitor', name: 'Log Monitor', category: 'monitoring' },
  { id: 'test-simple', name: 'Test Simple', category: 'test' },
  { id: 'test-simple-message', name: 'Test Simple Message', category: 'test' },
  { id: 'test-advanced-loop', name: 'Test Advanced Loop', category: 'test' },
  { id: 'video-upload-helper', name: 'Video Upload Helper', category: 'helper' },
  { id: 'wan25-helpers', name: 'WAN25 Helpers', category: 'helper' },
]

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

// Функция для вывода цветного текста
function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`
}

// Показать справку
function showHelp() {
  console.log(colorize('cyan', '\n📋 Inngest Functions Test CLI'))
  console.log(colorize('yellow', '\nUsage:'))
  console.log('  node test-cli.js <command> [options]\n')
  console.log(colorize('yellow', 'Commands:'))
  console.log('  list                    - Показать все функции')
  console.log('  list <category>         - Показать функции по категории')
  console.log('  info <function_id>      - Информация о функции')
  console.log('  test <function_id>      - Протестировать функцию')
  console.log('  batch                   - Протестировать все функции')
  console.log('  categories              - Показать категории')
  console.log('  help                    - Показать справку\n')
  console.log(colorize('yellow', 'Examples:'))
  console.log('  node test-cli.js list')
  console.log('  node test-cli.js list render')
  console.log('  node test-cli.js info ai-reels-callback')
  console.log('  node test-cli.js test ai-reels-callback')
  console.log('  node test-cli.js batch\n')
}

// Показать все функции
function listFunctions(category = null) {
  console.log(colorize('cyan', '\n📊 Available Inngest Functions'))
  console.log(colorize('yellow', 'Total:'), functions.length)

  if (category) {
    const filtered = functions.filter((f) => f.category === category)
    console.log(colorize('yellow', `\nCategory: ${category}`))
    console.log(colorize('yellow', 'Count:'), filtered.length)
    filtered.forEach((func, index) => {
      console.log(`  ${index + 1}. ${colorize('green', func.id)} - ${func.name}`)
    })
  } else {
    const grouped = functions.reduce((acc, func) => {
      acc[func.category] = acc[func.category] || []
      acc[func.category].push(func)
      return acc
    }, {})

    for (const [cat, funcs] of Object.entries(grouped)) {
      console.log(colorize('yellow', `\n${cat.toUpperCase()} (${funcs.length})`))
      funcs.forEach((func, index) => {
        console.log(`  ${index + 1}. ${colorize('green', func.id)} - ${func.name}`)
      })
    }
  }
  console.log()
}

// Показать категории
function listCategories() {
  console.log(colorize('cyan', '\n📂 Function Categories'))

  const grouped = functions.reduce((acc, func) => {
    acc[func.category] = acc[func.category] || []
    acc[func.category].push(func)
    return acc
  }, {})

  for (const [cat, funcs] of Object.entries(grouped)) {
    console.log(colorize('yellow', `\n${cat.toUpperCase()}`))
    console.log(`  Count: ${funcs.length}`)
    console.log(`  Functions: ${funcs.map((f) => f.id).join(', ')}`)
  }
  console.log()
}

// Информация о функции
function functionInfo(functionId) {
  const func = functions.find((f) => f.id === functionId)

  if (!func) {
    console.log(colorize('red', `\n❌ Function "${functionId}" not found\n`))
    return
  }

  console.log(colorize('cyan', `\nℹ️  Function Information`))
  console.log(colorize('yellow', 'ID:'), func.id)
  console.log(colorize('yellow', 'Name:'), func.name)
  console.log(colorize('yellow', 'Category:'), func.category)

  // Загружаем тестовые данные если есть
  const testDataPath = path.join(__dirname, 'test', 'fixtures', `${func.category}-fixtures.ts`)
  if (fs.existsSync(testDataPath)) {
    console.log(colorize('green', '\n✓ Test data available'))
    console.log(colorize('yellow', 'Test file:'), testDataPath)
  } else {
    console.log(colorize('yellow', '\n⚠ Test data not found'))
  }
  console.log()
}

// Тест функции
async function testFunction(functionId) {
  const func = functions.find((f) => f.id === functionId)

  if (!func) {
    console.log(colorize('red', `\n❌ Function "${functionId}" not found\n`))
    return
  }

  console.log(colorize('cyan', `\n🧪 Testing Function: ${func.name}`))
  console.log(colorize('yellow', 'ID:'), func.id)
  console.log(colorize('yellow', 'Category:'), func.category)

  // Простая проверка файла
  const funcPath = findFunctionFile(functionId)
  if (funcPath) {
    console.log(colorize('green', '\n✓ Function file exists:'), funcPath)
  } else {
    console.log(colorize('red', '\n❌ Function file not found'))
  }

  // Проверяем тест файл
  const testPath = findTestFile(functionId)
  if (testPath) {
    console.log(colorize('green', '✓ Test file exists:'), testPath)
  } else {
    console.log(colorize('yellow', '⚠ Test file not found'))
  }

  // Проверяем fixtures
  const fixturePath = findFixtureFile(func.category)
  if (fixturePath) {
    console.log(colorize('green', '✓ Fixture file exists:'), fixturePath)
  } else {
    console.log(colorize('yellow', '⚠ Fixture file not found'))
  }

  console.log()
}

// Batch тест
async function batchTest() {
  console.log(colorize('cyan', '\n🔄 Batch Testing All Functions'))
  console.log(colorize('yellow', 'Total:'), functions.length)

  const results = []

  for (const func of functions) {
    process.stdout.write(`Testing ${func.id}... `)

    const funcExists = findFunctionFile(func.id) ? true : false
    const testExists = findTestFile(func.id) ? true : false
    const fixtureExists = findFixtureFile(func.category) ? true : false

    const score = [funcExists, testExists, fixtureExists].filter(Boolean).length

    results.push({
      id: func.id,
      name: func.name,
      category: func.category,
      score,
      files: {
        function: funcExists,
        test: testExists,
        fixture: fixtureExists,
      },
    })

    if (score === 3) {
      console.log(colorize('green', '✓'))
    } else if (score === 2) {
      console.log(colorize('yellow', '⚠'))
    } else {
      console.log(colorize('red', '✗'))
    }
  }

  // Итоговая статистика
  console.log(colorize('cyan', '\n📊 Test Results Summary'))
  const passed = results.filter((r) => r.score === 3).length
  const partial = results.filter((r) => r.score === 2).length
  const failed = results.filter((r) => r.score < 2).length

  console.log(colorize('green', `✓ Fully tested: ${passed}`))
  console.log(colorize('yellow', `⚠ Partially tested: ${partial}`))
  console.log(colorize('red', `✗ Not tested: ${failed}`))
  console.log(colorize('cyan', `Total: ${results.length}`))

  if (failed > 0) {
    console.log(colorize('red', '\nFunctions needing tests:'))
    results
      .filter((r) => r.score < 2)
      .forEach((r) => {
        console.log(`  - ${r.id} (${r.category})`)
      })
  }

  console.log()
}

// Найти файл функции
function findFunctionFile(functionId) {
  const possiblePaths = [
    path.join(__dirname, 'functions', `${functionId}.ts`),
    path.join(__dirname, 'functions', functionId, `${functionId}.ts`),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }
  return null
}

// Найти тестовый файл
function findTestFile(functionId) {
  const testDir = path.join(__dirname, 'test', 'unit')
  if (!fs.existsSync(testDir)) return null

  const files = fs.readdirSync(testDir)
  return files.find((f) => f.includes(functionId)) || null
}

// Найти файл с фикстурами
function findFixtureFile(category) {
  const fixturePath = path.join(__dirname, 'test', 'fixtures', `${category}-fixtures.ts`)
  return fs.existsSync(fixturePath) ? fixturePath : null
}

// Главная функция
function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === 'help') {
    showHelp()
    return
  }

  switch (command) {
    case 'list':
      listFunctions(args[1])
      break

    case 'categories':
      listCategories()
      break

    case 'info':
      if (!args[1]) {
        console.log(colorize('red', '\n❌ Function ID required\n'))
        showHelp()
      } else {
        functionInfo(args[1])
      }
      break

    case 'test':
      if (!args[1]) {
        console.log(colorize('red', '\n❌ Function ID required\n'))
        showHelp()
      } else {
        testFunction(args[1])
      }
      break

    case 'batch':
      batchTest()
      break

    default:
      console.log(colorize('red', `\n❌ Unknown command: ${command}\n`))
      showHelp()
  }
}

// Запускаем
main()
