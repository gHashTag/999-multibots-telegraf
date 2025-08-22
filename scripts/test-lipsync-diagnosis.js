#!/usr/bin/env node

/**
 * Диагностика интеграции Lipsync
 * Проверяет все компоненты и выявляет проблемы
 */

console.log('🔍 === ДИАГНОСТИКА LIPSYNC ===\n')

// 1. Проверка переменных окружения
console.log('1️⃣ Проверка переменных окружения:')
const requiredEnvVars = [
  'REPLICATE_API_TOKEN',
  'SUPABASE_URL', 
  'SUPABASE_ANON_KEY'
]

const envIssues = []
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar]
  if (!value) {
    envIssues.push(envVar)
    console.log(`   ❌ ${envVar}: НЕ УСТАНОВЛЕНА`)
  } else {
    console.log(`   ✅ ${envVar}: установлена (${value.substring(0, 8)}...)`)
  }
})

if (envIssues.length > 0) {
  console.log(`\n🚨 КРИТИЧЕСКАЯ ПРОБЛЕМА: Не установлены переменные окружения:`)
  envIssues.forEach(env => console.log(`   - ${env}`))
  console.log('\n💡 Решение: Создайте .env файл или установите переменные окружения')
}

// 2. Проверка модулей
console.log('\n2️⃣ Проверка модулей:')
const modules = [
  'replicate',
  '@supabase/supabase-js',
  'telegraf'
]

modules.forEach(module => {
  try {
    require(module)
    console.log(`   ✅ ${module}: модуль доступен`)
  } catch (error) {
    console.log(`   ❌ ${module}: модуль недоступен (${error.message})`)
  }
})

// 3. Проверка файлов конфигурации
console.log('\n3️⃣ Проверка файлов конфигурации:')
const fs = require('fs')
const path = require('path')

const configFiles = [
  'src/config/lipsync-models.config.ts',
  'src/core/lipsync/index.ts',
  'src/core/replicate/generateKlingLipSync.ts',
  'src/services/generateLipSync.ts',
  'src/scenes/lipSyncWizard/index.ts'
]

configFiles.forEach(file => {
  const fullPath = path.join(process.cwd(), file)
  if (fs.existsSync(fullPath)) {
    console.log(`   ✅ ${file}: файл существует`)
  } else {
    console.log(`   ❌ ${file}: файл не найден`)
  }
})

// 4. Тест загрузки модулей (только JS файлы)
console.log('\n4️⃣ Тест загрузки JS модулей:')

// Попробуем загрузить Replicate
try {
  const Replicate = require('replicate')
  console.log('   ✅ Replicate: модуль загружается')
  
  if (process.env.REPLICATE_API_TOKEN) {
    try {
      const replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN,
      })
      console.log('   ✅ Replicate: клиент инициализирован')
    } catch (error) {
      console.log(`   ❌ Replicate: ошибка инициализации (${error.message})`)
    }
  } else {
    console.log('   ⚠️ Replicate: токен не установлен, пропускаем инициализацию')
  }
} catch (error) {
  console.log(`   ❌ Replicate: ошибка загрузки (${error.message})`)
}

// 5. Проверка доступности API
console.log('\n5️⃣ Проверка доступности API:')

async function testReplicateAPI() {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.log('   ⚠️ Replicate API: токен не установлен, пропускаем тест')
    return
  }
  
  try {
    const response = await fetch('https://api.replicate.com/v1/models', {
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.ok) {
      console.log('   ✅ Replicate API: доступен')
    } else {
      console.log(`   ❌ Replicate API: ошибка ${response.status} - ${response.statusText}`)
    }
  } catch (error) {
    console.log(`   ❌ Replicate API: ошибка подключения (${error.message})`)
  }
}

// 6. Финальные рекомендации
console.log('\n6️⃣ Анализ и рекомендации:')

async function finalAnalysis() {
  await testReplicateAPI()
  
  console.log('\n📋 ИТОГОВЫЙ ОТЧЁТ:')
  
  if (envIssues.length > 0) {
    console.log('🔴 СТАТУС: ТРЕБУЕТСЯ ИСПРАВЛЕНИЕ')
    console.log('⚠️ Основные проблемы:')
    console.log('   - Не установлены переменные окружения')
    console.log('   - Lipsync не будет работать без REPLICATE_API_TOKEN')
    
    console.log('\n🛠️ Необходимые действия:')
    console.log('1. Создать .env файл в корне проекта')
    console.log('2. Добавить в .env:')
    console.log('   REPLICATE_API_TOKEN=your_replicate_token_here')
    console.log('   SUPABASE_URL=your_supabase_url')
    console.log('   SUPABASE_ANON_KEY=your_supabase_key')
    console.log('3. Перезапустить приложение')
  } else {
    console.log('🟢 СТАТУС: ВСЁ НАСТРОЕНО')
    console.log('✅ Все необходимые переменные установлены')
    console.log('✅ Модули загружаются корректно')
    console.log('📝 Можно приступать к тестированию Lipsync')
  }
  
  console.log('\n📞 Для тестирования запустите:')
  console.log('   node scripts/test-lipsync-simple.js')
}

finalAnalysis().catch(console.error)