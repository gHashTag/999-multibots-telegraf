#!/usr/bin/env node

/**
 * Простая проверка баланса
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env' })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkBalance(telegramId) {
  console.log(`🔍 Проверяем баланс для ${telegramId}`)

  // Суммируем звезды из payments_v2
  const { data: payments, error } = await supabase
    .from('payments_v2')
    .select('stars_used')
    .eq('telegram_id', telegramId)

  if (error) {
    console.error('❌ Ошибка:', error)
    return
  }

  const totalStars = payments.reduce((sum, p) => sum + (p.stars_used || 0), 0)
  console.log(`✅ Баланс: ${totalStars} звезд (из ${payments.length} платежей)`)

  // Проверим последние платежи
  const { data: recent } = await supabase
    .from('payments_v2')
    .select('stars_used, payment_date')
    .eq('telegram_id', telegramId)
    .order('payment_date', { ascending: false })
    .limit(5)

  console.log('\n📊 Последние 5 платежей:')
  recent.forEach(p => {
    console.log(`  - ${p.payment_date}: ${p.stars_used} звезд`)
  })
}

checkBalance('144022504')
