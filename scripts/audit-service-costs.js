#!/usr/bin/env node

/**
 * Комплексный аудит себестоимости всех сервисов
 * Проверяет артефакты, аномалии и несоответствия в данных
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

function fmtNum(n) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0))
}

async function auditServiceCosts() {
  console.log('🔍 КОМПЛЕКСНЫЙ АУДИТ СЕБЕСТОИМОСТИ СЕРВИСОВ')
  console.log('='.repeat(80))
  
  // Получаем все операции расхода по всем ботам
  const { data: payments, error } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('status', 'COMPLETED')
    .eq('type', 'MONEY_OUTCOME')

  if (error) {
    console.error('❌ Error:', error.message)
    return
  }

  console.log(`📊 Всего операций расхода: ${payments.length}`)
  console.log('')

  // Группируем по service_type
  const serviceStats = {}
  const anomalies = {
    nullCost: [],
    zeroCost: [],
    negativeCost: [],
    highCostRatio: [],
    noServiceType: [],
    suspiciousOperations: []
  }

  payments.forEach(payment => {
    const serviceType = payment.service_type || 'unknown'
    const stars = payment.stars || 0
    const cost = payment.cost || 0
    const costRatio = stars > 0 ? (cost / stars) : 0

    // Инициализация статистики
    if (!serviceStats[serviceType]) {
      serviceStats[serviceType] = {
        count: 0,
        totalStars: 0,
        totalCost: 0,
        avgStars: 0,
        avgCost: 0,
        avgCostRatio: 0,
        minCost: Infinity,
        maxCost: -Infinity,
        minStars: Infinity,
        maxStars: -Infinity,
        nullCostCount: 0,
        zeroCostCount: 0,
        operations: []
      }
    }

    const stats = serviceStats[serviceType]
    stats.count++
    stats.totalStars += stars
    stats.totalCost += cost
    stats.operations.push(payment)

    // Обновляем min/max
    if (cost !== null && cost !== undefined) {
      stats.minCost = Math.min(stats.minCost, cost)
      stats.maxCost = Math.max(stats.maxCost, cost)
    }
    stats.minStars = Math.min(stats.minStars, stars)
    stats.maxStars = Math.max(stats.maxStars, stars)

    // Подсчёт аномалий
    if (cost === null || cost === undefined) {
      stats.nullCostCount++
      anomalies.nullCost.push(payment)
    } else if (cost === 0) {
      stats.zeroCostCount++
      anomalies.zeroCost.push(payment)
    } else if (cost < 0) {
      anomalies.negativeCost.push(payment)
    }

    if (!payment.service_type) {
      anomalies.noServiceType.push(payment)
    }

    // Подозрительно высокие соотношения cost/stars
    if (costRatio > 0.8) { // Если себестоимость > 80% от цены
      anomalies.highCostRatio.push({
        ...payment,
        costRatio: costRatio
      })
    }

    // Подозрительные операции (очень большие или странные)
    if (stars > 1000 || cost > 1000) {
      anomalies.suspiciousOperations.push(payment)
    }
  })

  // Рассчитываем средние значения
  Object.values(serviceStats).forEach(stats => {
    stats.avgStars = stats.totalStars / stats.count
    stats.avgCost = stats.totalCost / stats.count
    stats.avgCostRatio = stats.avgStars > 0 ? (stats.avgCost / stats.avgStars) : 0
    
    // Корректируем бесконечности
    if (stats.minCost === Infinity) stats.minCost = 0
    if (stats.maxCost === -Infinity) stats.maxCost = 0
    if (stats.minStars === Infinity) stats.minStars = 0
    if (stats.maxStars === -Infinity) stats.maxStars = 0
  })

  // Выводим статистику по сервисам
  console.log('📈 СТАТИСТИКА ПО СЕРВИСАМ:')
  console.log('-'.repeat(80))
  console.log('| Сервис                    | Опер. | Ср.⭐  | Ср.Cost | Ratio | Null | Zero |')
  console.log('-'.repeat(80))

  Object.entries(serviceStats)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([serviceType, stats]) => {
      const service = serviceType.padEnd(25)
      const count = stats.count.toString().padStart(5)
      const avgStars = fmtNum(stats.avgStars).padStart(6)
      const avgCost = fmtNum(stats.avgCost).padStart(7)
      const ratio = (stats.avgCostRatio * 100).toFixed(1).padStart(5) + '%'
      const nullCount = stats.nullCostCount.toString().padStart(4)
      const zeroCount = stats.zeroCostCount.toString().padStart(4)
      
      console.log(`| ${service} | ${count} | ${avgStars} | ${avgCost} | ${ratio} | ${nullCount} | ${zeroCount} |`)
    })

  console.log('-'.repeat(80))
  console.log('')

  // Топ-10 самых дорогих операций
  console.log('💸 ТОП-10 САМЫХ ДОРОГИХ ОПЕРАЦИЙ:')
  const topExpensive = payments
    .sort((a, b) => (b.stars || 0) - (a.stars || 0))
    .slice(0, 10)

  topExpensive.forEach((op, i) => {
    const ratio = op.stars > 0 ? ((op.cost || 0) / op.stars * 100) : 0
    console.log(`   ${i+1}. ${op.service_type || 'unknown'}: ${op.stars || 0}⭐, cost: ${op.cost || 0}⭐ (${ratio.toFixed(1)}%), bot: ${op.bot_name}`)
  })
  console.log('')

  // Аномалии
  console.log('🚨 ОБНАРУЖЕННЫЕ АНОМАЛИИ:')
  console.log('')

  if (anomalies.nullCost.length > 0) {
    console.log(`❌ Операции с NULL cost: ${anomalies.nullCost.length}`)
    console.log('   Примеры:')
    anomalies.nullCost.slice(0, 3).forEach(op => {
      console.log(`   • ${op.service_type || 'unknown'}: ${op.stars || 0}⭐, bot: ${op.bot_name}`)
    })
    console.log('')
  }

  if (anomalies.zeroCost.length > 0) {
    console.log(`⚠️ Операции с нулевой себестоимостью: ${anomalies.zeroCost.length}`)
    console.log('   Примеры:')
    anomalies.zeroCost.slice(0, 3).forEach(op => {
      console.log(`   • ${op.service_type || 'unknown'}: ${op.stars || 0}⭐, bot: ${op.bot_name}`)
    })
    console.log('')
  }

  if (anomalies.negativeCost.length > 0) {
    console.log(`🔴 Операции с отрицательной себестоимостью: ${anomalies.negativeCost.length}`)
    anomalies.negativeCost.forEach(op => {
      console.log(`   • ${op.service_type || 'unknown'}: ${op.stars || 0}⭐, cost: ${op.cost}⭐, bot: ${op.bot_name}`)
    })
    console.log('')
  }

  if (anomalies.highCostRatio.length > 0) {
    console.log(`📊 Операции с высоким соотношением cost/stars (>80%): ${anomalies.highCostRatio.length}`)
    console.log('   Топ-5 по соотношению:')
    anomalies.highCostRatio
      .sort((a, b) => b.costRatio - a.costRatio)
      .slice(0, 5)
      .forEach(op => {
        console.log(`   • ${op.service_type || 'unknown'}: ${op.stars || 0}⭐, cost: ${op.cost || 0}⭐ (${(op.costRatio * 100).toFixed(1)}%), bot: ${op.bot_name}`)
      })
    console.log('')
  }

  if (anomalies.noServiceType.length > 0) {
    console.log(`❓ Операции без service_type: ${anomalies.noServiceType.length}`)
    console.log('   Примеры:')
    anomalies.noServiceType.slice(0, 3).forEach(op => {
      console.log(`   • ${op.stars || 0}⭐, cost: ${op.cost || 0}⭐, bot: ${op.bot_name}, описание: ${(op.description || '').substring(0, 50)}...`)
    })
    console.log('')
  }

  if (anomalies.suspiciousOperations.length > 0) {
    console.log(`🤔 Подозрительно крупные операции (>1000⭐): ${anomalies.suspiciousOperations.length}`)
    anomalies.suspiciousOperations.forEach(op => {
      console.log(`   • ${op.service_type || 'unknown'}: ${op.stars || 0}⭐, cost: ${op.cost || 0}⭐, bot: ${op.bot_name}`)
    })
    console.log('')
  }

  // Проверка соответствия SERVICE_COST_CONFIG
  console.log('🔧 ПРОВЕРКА СООТВЕТСТВИЯ SERVICE_COST_CONFIG:')
  
  // Определяем ожидаемые значения из конфигурации (упрощенно)
  const expectedCosts = {
    'neuro_photo': 4,
    'kling_video': 10,
    'haiper_video': 12, 
    'image_to_prompt': 1,
    'text_to_speech': 4,
    'minimax_video': 390,
    'image_to_video': 15, // Примерно
    'digital_avatar_body': 50, // Примерно
  }

  Object.entries(expectedCosts).forEach(([serviceType, expectedCost]) => {
    const stats = serviceStats[serviceType]
    if (stats) {
      const deviation = Math.abs(stats.avgCost - expectedCost) / expectedCost * 100
      const status = deviation > 50 ? '❌' : deviation > 20 ? '⚠️' : '✅'
      console.log(`   ${status} ${serviceType}: ожидается ${expectedCost}⭐, фактически ${fmtNum(stats.avgCost)}⭐ (отклонение: ${deviation.toFixed(1)}%)`)
    } else {
      console.log(`   ❓ ${serviceType}: нет данных`)
    }
  })

  console.log('')
  console.log('✅ АУДИТ ЗАВЕРШЁН')
}

auditServiceCosts().catch(console.error)
