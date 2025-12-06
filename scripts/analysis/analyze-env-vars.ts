#!/usr/bin/env tsx
/**
 * Анализирует все переменные окружения в проекте
 * Находит:
 * 1. Какие переменные используются в коде
 * 2. Какие есть в Infisical
 * 3. Мёртвые переменные (не используются)
 * 4. Отсутствующие переменные (используются, но нет в Infisical)
 */

import { config } from 'dotenv'
import { execSync } from 'child_process'
import path from 'path'

config()

async function analyzeEnvVars() {
  console.log('🔍 Анализ переменных окружения...\n')

  // 1. Получаем все переменные из кода
  console.log('📋 Шаг 1: Поиск переменных в коде...')
  const codeVarsRaw = execSync(
    `grep -rh "process.env\\." src/ --include="*.ts" --include="*.js" | grep -o 'process\\.env\\.[A-Z_][A-Z0-9_]*' | sort -u`,
    { encoding: 'utf-8', cwd: path.join(process.cwd()) }
  )

  const codeVars = codeVarsRaw
    .split('\n')
    .filter(Boolean)
    .map(v => v.replace('process.env.', ''))
    .sort()

  console.log(`✅ Найдено ${codeVars.length} уникальных переменных в коде\n`)

  // 2. Подключаемся к Infisical и получаем список секретов
  console.log('📋 Шаг 2: Подключение к Infisical...')
  const { initInfisical, getSecretsStats } = await import('../src/core/infisical')

  await initInfisical()
  const stats = getSecretsStats()

  const infisicalVars = stats.secretKeys.sort()
  console.log(`✅ Найдено ${infisicalVars.length} секретов в Infisical (${stats.environment})\n`)

  // 3. Анализ
  console.log('📊 Шаг 3: Анализ...\n')

  // Переменные в коде, но НЕ в Infisical
  const missingInInfisical = codeVars.filter(v => !infisicalVars.includes(v))

  // Переменные в Infisical, но НЕ используются в коде
  const unusedInCode = infisicalVars.filter(v => !codeVars.includes(v))

  // Используемые переменные (есть и в коде, и в Infisical)
  const activeVars = codeVars.filter(v => infisicalVars.includes(v))

  // 4. Отчёт
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 СТАТИСТИКА')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✅ Активные переменные (используются): ${activeVars.length}`)
  console.log(`⚠️  Отсутствуют в Infisical:            ${missingInInfisical.length}`)
  console.log(`🗑️  Мёртвые (не используются):         ${unusedInCode.length}`)
  console.log(`📦 Всего в Infisical:                  ${infisicalVars.length}`)
  console.log(`💻 Всего в коде:                       ${codeVars.length}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // 5. Детальные списки
  if (missingInInfisical.length > 0) {
    console.log('⚠️  ОТСУТСТВУЮТ В INFISICAL (используются в коде, но нет в Infisical):')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    missingInInfisical.forEach((v, i) => {
      console.log(`${(i + 1).toString().padStart(3)}. ${v}`)
    })
    console.log('')
  }

  if (unusedInCode.length > 0) {
    console.log('🗑️  МЁРТВЫЕ ПЕРЕМЕННЫЕ (есть в Infisical, но не используются в коде):')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Группируем по категориям
    const deadBotTokens = unusedInCode.filter(v => v.startsWith('BOT_TOKEN_'))
    const deadApiKeys = unusedInCode.filter(v => v.includes('API_KEY') || v.includes('TOKEN'))
    const deadOther = unusedInCode.filter(v => !deadBotTokens.includes(v) && !deadApiKeys.includes(v))

    if (deadBotTokens.length > 0) {
      console.log('\n  🤖 BOT Токены:')
      deadBotTokens.forEach(v => console.log(`     - ${v}`))
    }

    if (deadApiKeys.length > 0) {
      console.log('\n  🔑 API Keys:')
      deadApiKeys.forEach(v => console.log(`     - ${v}`))
    }

    if (deadOther.length > 0) {
      console.log('\n  📦 Другие:')
      deadOther.forEach(v => console.log(`     - ${v}`))
    }
    console.log('')
  }

  console.log('✅ АКТИВНЫЕ ПЕРЕМЕННЫЕ (первые 20):')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  activeVars.slice(0, 20).forEach((v, i) => {
    console.log(`${(i + 1).toString().padStart(3)}. ${v}`)
  })
  if (activeVars.length > 20) {
    console.log(`    ... и ещё ${activeVars.length - 20} переменных`)
  }
  console.log('')

  // 6. Рекомендации
  console.log('💡 РЕКОМЕНДАЦИИ:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (missingInInfisical.length > 0) {
    console.log(`⚠️  Добавить ${missingInInfisical.length} переменных в Infisical или убрать из кода`)
  }

  if (unusedInCode.length > 0) {
    console.log(`🗑️  Удалить ${unusedInCode.length} неиспользуемых переменных из Infisical`)
    console.log(`    (освободит место и упростит конфигурацию)`)
  }

  if (activeVars.length > 0) {
    console.log(`✅ ${activeVars.length} активных переменных - всё в порядке`)
  }
  console.log('')
}

analyzeEnvVars().catch(console.error)
