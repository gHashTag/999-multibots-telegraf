#!/usr/bin/env node

/**
 * Проверяем структуру payments_v2
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env' })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkPayments() {
  console.log('🔍 Получаем последние 5 записей из payments_v2...')

  const { data, error } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('telegram_id', '144022504')
    .order('payment_date', { ascending: false })
    .limit(5)

  if (error) {
    console.error('❌ Ошибка:', error)
    return
  }

  if (data && data.length > 0) {
    console.log('\n📊 Последние платежи:')
    data.forEach((payment, idx) => {
      console.log(`\n${idx + 1}.`, JSON.stringify(payment, null, 2))
    })
  } else {
    console.log('❌ Платежи не найдены')
  }
}

checkPayments()
