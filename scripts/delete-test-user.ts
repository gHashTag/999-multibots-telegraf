#!/usr/bin/env bun

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
const envPath = resolve(__dirname, '../.env')
config({ path: envPath })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '❌ SUPABASE_URL или SUPABASE_SERVICE_KEY не установлены в .env'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function deleteTestUser() {
  const testUserId = '6579515876'

  console.log('═══════════════════════════════════════════════════════════')
  console.log('🗑️  УДАЛЕНИЕ ТЕСТОВОГО ПОЛЬЗОВАТЕЛЯ')
  console.log('═══════════════════════════════════════════════════════════')
  console.log()
  console.log('Telegram ID:', testUserId)
  console.log()

  try {
    // Сначала проверим, существует ли пользователь
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('user_id, username, inviter')
      .eq('telegram_id', testUserId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError
    }

    if (!existingUser) {
      console.log('✅ Пользователь не найден в базе данных')
      console.log('   Можно тестировать реферальную систему!')
      console.log()
      console.log('📱 Отправьте боту команду:')
      console.log('   /start 144022504')
      console.log()
      return
    }

    console.log('📊 Информация о пользователе:')
    console.log('─────────────────────────────')
    console.log('User ID:', existingUser.user_id)
    console.log('Username:', existingUser.username)
    console.log('Inviter:', existingUser.inviter || 'none')
    console.log('─────────────────────────────')
    console.log()

    // Удаляем пользователя
    console.log('🔄 Удаление пользователя...')

    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('telegram_id', testUserId)

    if (deleteError) {
      throw deleteError
    }

    console.log('✅ Пользователь успешно удален!')
    console.log()
    console.log('═══════════════════════════════════════════════════════════')
    console.log('📱 ТЕПЕРЬ МОЖНО ТЕСТИРОВАТЬ РЕФЕРАЛЬНУЮ СИСТЕМУ')
    console.log('═══════════════════════════════════════════════════════════')
    console.log()
    console.log('Отправьте боту @ai_koshey_bot одну из команд:')
    console.log()
    console.log('1️⃣ С реферальным кодом:')
    console.log('   /start 144022504')
    console.log()
    console.log('2️⃣ С промо-кодом для фото:')
    console.log('   /start neurophoto')
    console.log()
    console.log('3️⃣ С промо-кодом для видео:')
    console.log('   /start neurovideo')
    console.log()
    console.log('═══════════════════════════════════════════════════════════')
  } catch (error) {
    console.error('❌ Ошибка:', error)
  }
}

deleteTestUser()
