#!/usr/bin/env node

/**
 * Детальный анализ аномалий в себестоимости
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

async function analyzeAnomalies() {
  console.log('🔍 ДЕТАЛЬНЫЙ АНАЛИЗ АНОМАЛИЙ СЕБЕСТОИМОСТИ')
  console.log('='.repeat(80))
  
  // 1. Операции с соотношением cost > stars (себестоимость больше цены)
  console.log('🚨 1. ОПЕРАЦИИ С УБЫТОЧНЫМ СООТНОШЕНИЕМ (cost > stars):')
  const { data: lossMaking, error: lossError } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('status', 'COMPLETED')
    .eq('type', 'MONEY_OUTCOME')
    .filter('cost', 'gt', 'stars')

  if (lossError) {
    console.error('Error:', lossError.message)
  } else if (lossMaking && lossMaking.length > 0) {
    console.log(`   Найдено ${lossMaking.length} убыточных операций:`)
    lossMaking.forEach((op, i) => {
      const loss = (op.cost || 0) - (op.stars || 0)
      console.log(`   ${i+1}. ${op.service_type || 'unknown'}: ${op.stars || 0}⭐ цена, ${op.cost || 0}⭐ cost, убыток: ${loss}⭐, bot: ${op.bot_name}`)
      console.log(`      Описание: ${(op.description || '').substring(0, 60)}...`)
      console.log(`      Дата: ${new Date(op.created_at).toLocaleDateString('ru-RU')}`)
      console.log('')
    })
  } else {
    console.log('   ✅ Убыточных операций не найдено')
  }
  console.log('')

  // 2. Операции text_to_speech с высокой себестоимостью
  console.log('🎵 2. АНАЛИЗ TEXT_TO_SPEECH (107.4% cost ratio):')
  const { data: ttsOps, error: ttsError } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('service_type', 'text_to_speech')
    .eq('type', 'MONEY_OUTCOME')

  if (!ttsError && ttsOps) {
    console.log(`   Всего операций TTS: ${ttsOps.length}`)
    ttsOps.forEach((op, i) => {
      const ratio = op.stars > 0 ? ((op.cost || 0) / op.stars * 100) : 0
      console.log(`   ${i+1}. ${op.stars || 0}⭐ → ${op.cost || 0}⭐ (${ratio.toFixed(1)}%), bot: ${op.bot_name}`)
      console.log(`      Метаданные: ${JSON.stringify(op.metadata || {})}`)
    })
  }
  console.log('')

  // 3. Операции image_to_prompt с высоким ratio
  console.log('🔍 3. АНАЛИЗ IMAGE_TO_PROMPT (92.5% cost ratio):')
  const { data: itpOps, error: itpError } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('service_type', 'image_to_prompt')
    .eq('type', 'MONEY_OUTCOME')
    .order('cost', { ascending: false })
    .limit(10)

  if (!itpError && itpOps) {
    console.log(`   Топ-10 операций image_to_prompt по себестоимости:`)
    itpOps.forEach((op, i) => {
      const ratio = op.stars > 0 ? ((op.cost || 0) / op.stars * 100) : 0
      console.log(`   ${i+1}. ${op.stars || 0}⭐ → ${op.cost || 0}⭐ (${ratio.toFixed(1)}%), bot: ${op.bot_name}`)
    })
  }
  console.log('')

  // 4. Операции с нулевой себестоимостью но с расходами
  console.log('⚠️ 4. ОПЕРАЦИИ С НУЛЕВОЙ СЕБЕСТОИМОСТЬЮ:')
  const { data: zeroCost, error: zeroError } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('type', 'MONEY_OUTCOME')
    .eq('cost', 0)
    .gt('stars', 0)
    .order('stars', { ascending: false })
    .limit(20)

  if (!zeroError && zeroCost) {
    console.log(`   Топ-20 операций с нулевой себестоимостью:`)
    const serviceGroups = {}
    zeroCost.forEach(op => {
      const service = op.service_type || 'unknown'
      if (!serviceGroups[service]) serviceGroups[service] = []
      serviceGroups[service].push(op)
    })

    Object.entries(serviceGroups).forEach(([service, ops]) => {
      const totalStars = ops.reduce((sum, op) => sum + (op.stars || 0), 0)
      console.log(`   📊 ${service}: ${ops.length} операций, ${totalStars}⭐ без себестоимости`)
      // Показываем несколько примеров
      ops.slice(0, 3).forEach((op, i) => {
        console.log(`      ${i+1}. ${op.stars || 0}⭐, bot: ${op.bot_name}, ${(op.description || '').substring(0, 40)}...`)
      })
    })
  }
  console.log('')

  // 5. Операции digital_avatar_body с высокой себестоимостью
  console.log('🎭 5. АНАЛИЗ DIGITAL_AVATAR_BODY (высокая себестоимость):')
  const { data: avatarOps, error: avatarError } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('service_type', 'digital_avatar_body')
    .eq('type', 'MONEY_OUTCOME')

  if (!avatarError && avatarOps) {
    console.log(`   Всего операций digital_avatar_body: ${avatarOps.length}`)
    avatarOps.forEach((op, i) => {
      const ratio = op.stars > 0 ? ((op.cost || 0) / op.stars * 100) : 0
      console.log(`   ${i+1}. ${op.stars || 0}⭐ → ${op.cost || 0}⭐ (${ratio.toFixed(1)}%), bot: ${op.bot_name}`)
      console.log(`      Описание: ${(op.description || '').substring(0, 60)}...`)
      if (op.metadata && typeof op.metadata === 'object') {
        console.log(`      Метаданные: ${JSON.stringify(op.metadata)}`)
      }
    })
  }
  console.log('')

  // 6. Проверка последних операций по датам
  console.log('📅 6. АНАЛИЗ ПОСЛЕДНИХ ОПЕРАЦИЙ (проверка актуальности логики):')
  const { data: recentOps, error: recentError } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('type', 'MONEY_OUTCOME')
    .order('created_at', { ascending: false })
    .limit(20)

  if (!recentError && recentOps) {
    console.log(`   Последние 20 операций расхода:`)
    recentOps.forEach((op, i) => {
      const ratio = op.stars > 0 ? ((op.cost || 0) / op.stars * 100) : 0
      const date = new Date(op.created_at).toLocaleDateString('ru-RU')
      console.log(`   ${i+1}. [${date}] ${op.service_type || 'unknown'}: ${op.stars || 0}⭐ → ${op.cost || 0}⭐ (${ratio.toFixed(1)}%), bot: ${op.bot_name}`)
    })
  }
  
  console.log('')
  console.log('✅ АНАЛИЗ АНОМАЛИЙ ЗАВЕРШЁН')
}

analyzeAnomalies().catch(console.error)
