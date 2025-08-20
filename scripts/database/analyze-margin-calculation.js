#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function analyzeMargin() {
  const botName = 'neuro_blogger_bot'
  
  // Получаем все платежи как в getUserBalanceStats
  const { data: payments, error } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('status', 'COMPLETED')
    .eq('bot_name', botName)

  if (error) {
    console.error('❌ Error:', error.message)
    return
  }

  console.log('🔍 ДЕТАЛЬНЫЙ АНАЛИЗ МАРЖИ для бота:', botName)
  console.log('='.repeat(70))
  
  // Фильтруем по category = REAL как в коде
  const realPayments = payments.filter(p => p.category === 'REAL')
  
  const income = realPayments
    .filter(p => p.type === 'MONEY_INCOME')
    .reduce((sum, p) => sum + (p.stars || 0), 0)
    
  const outcome = realPayments
    .filter(p => p.type === 'MONEY_OUTCOME')
    .reduce((sum, p) => sum + (p.stars || 0), 0)
    
  const cost = realPayments
    .filter(p => p.type === 'MONEY_OUTCOME')
    .reduce((sum, p) => sum + (p.cost || 0), 0)
    
  const netProfit = income - outcome - cost
  const profitMargin = income > 0 ? (netProfit / income) * 100 : 0
  
  console.log('📊 РАСЧЁТ МАРЖИ:')
  console.log(`   💰 Доход (income): ${income.toLocaleString()}⭐`)
  console.log(`   📉 Расход (outcome): ${outcome.toLocaleString()}⭐`)
  console.log(`   🏭 Себестоимость (cost): ${cost.toLocaleString()}⭐`)
  console.log(`   💎 Чистая прибыль: ${netProfit.toLocaleString()}⭐`)
  console.log(`   📊 Маржа: ${profitMargin.toFixed(1)}%`)
  console.log('')
  
  // Проверим детали расходов
  const outcomePayments = realPayments.filter(p => p.type === 'MONEY_OUTCOME')
  
  console.log('🔍 АНАЛИЗ РАСХОДОВ:')
  console.log(`   📝 Всего операций расхода: ${outcomePayments.length}`)
  
  const serviceTypes = {}
  outcomePayments.forEach(p => {
    const serviceType = p.service_type || 'unknown'
    if (!serviceTypes[serviceType]) {
      serviceTypes[serviceType] = { count: 0, stars: 0, cost: 0 }
    }
    serviceTypes[serviceType].count++
    serviceTypes[serviceType].stars += (p.stars || 0)
    serviceTypes[serviceType].cost += (p.cost || 0)
  })
  
  console.log('   📊 По типам сервисов:')
  Object.entries(serviceTypes)
    .sort((a, b) => b[1].stars - a[1].stars)
    .forEach(([type, data]) => {
      const efficiency = data.stars > 0 ? ((data.stars - data.cost) / data.stars * 100) : 0
      console.log(`      ${type}: ${data.count} оп., ${data.stars.toLocaleString()}⭐ потрачено, ${data.cost.toLocaleString()}⭐ себестоимость, ${efficiency.toFixed(1)}% эффективность`)
    })
    
  console.log('')
  console.log('🤔 ВОЗМОЖНЫЕ ПРОБЛЕМЫ С МАРЖОЙ:')
  console.log('   1. Высокая себестоимость относительно расходов')
  console.log('   2. Неправильный расчёт cost в payments_v2')
  console.log('   3. Смешивание разных типов операций')
  console.log(`   4. Соотношение cost/outcome: ${(cost/outcome*100).toFixed(1)}%`)
  
  // Проверим примеры операций
  console.log('')
  console.log('📝 ПРИМЕРЫ ОПЕРАЦИЙ РАСХОДА (топ-10):')
  outcomePayments
    .sort((a, b) => (b.stars || 0) - (a.stars || 0))
    .slice(0, 10)
    .forEach((p, i) => {
      console.log(`   ${i+1}. ${p.service_type || 'unknown'}: ${p.stars || 0}⭐ потрачено, ${p.cost || 0}⭐ себестоимость, описание: ${(p.description || '').substring(0, 50)}...`)
    })
}

analyzeMargin().catch(console.error)
