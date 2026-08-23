#!/usr/bin/env node
/**
 * Fix is_test field for user 5732975798
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_SERVICE_KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY не задан. Возьмите: railway variables --kv | grep SUPABASE'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const TELEGRAM_ID = '5732975798'

async function fixUser() {
  console.log('🔧 Исправляем поле is_test для пользователя 5732975798...\n')

  try {
    // Прямое SQL обновление
    console.log('1️⃣ Добавляем колонку напрямую...')
    const { error: alterError } = await supabase.rpc('exec_sql', {
      query: `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;`,
    })

    if (alterError) {
      console.log('⚠️ Колонка может уже существовать:', alterError.message)
    } else {
      console.log('   ✅ Колонка добавлена')
    }

    // Обновляем поле
    console.log('\n2️⃣ Обновляем is_test = true...')
    const { data, error: updateError } = await supabase.rpc('exec_sql', {
      query: `UPDATE users SET is_test = TRUE WHERE telegram_id = '${TELEGRAM_ID}';`,
    })

    if (updateError) {
      console.error('❌ Ошибка обновления:', updateError.message)
    } else {
      console.log('   ✅ Обновлено успешно')
    }

    // Проверяем
    console.log('\n3️⃣ Проверяем результат...')
    const { data: verifyUser } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .single()

    console.log('\n=== РЕЗУЛЬТАТ ===')
    console.log('Telegram ID:', TELEGRAM_ID)
    console.log('is_test:', verifyUser?.is_test ? '✅ TRUE' : '❌ FALSE')

    if (verifyUser?.is_test) {
      console.log('\n🎉 ГОТОВО! Поле is_test установлено в TRUE')
    } else {
      console.log(
        '\n⚠️ Поле still FALSE - возможно проблема с правами или схемой'
      )
    }
  } catch (err) {
    console.error('\n❌ ОШИБКА:', err.message)
    process.exit(1)
  }
}

fixUser().then(() => process.exit(0))
