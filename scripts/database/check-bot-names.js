#!/usr/bin/env node

/**
 * Скрипт для проверки всех bot_name в базе данных
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// Настройка Supabase
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkBotNames() {
  console.log('🔍 Анализ всех bot_name в базе данных')
  console.log('=' * 50)

  try {
    // Получаем уникальные bot_name с количеством пользователей
    const { data: botNames, error } = await supabase
      .from('users')
      .select('bot_name')
      .not('bot_name', 'is', null)

    if (error) {
      console.error('❌ Ошибка при получении bot_name:', error.message)
      return
    }

    if (!botNames || botNames.length === 0) {
      console.log('❌ Не найдено пользователей с bot_name')
      return
    }

    // Подсчитываем количество для каждого bot_name
    const botCounts = {}
    botNames.forEach(item => {
      const botName = item.bot_name
      if (botName) {
        botCounts[botName] = (botCounts[botName] || 0) + 1
      }
    })

    console.log('📊 Найденные bot_name и количество пользователей:')
    
    // Сортируем по количеству пользователей (по убыванию)
    const sortedBots = Object.entries(botCounts).sort((a, b) => b[1] - a[1])
    
    sortedBots.forEach(([botName, count], index) => {
      console.log(`   ${index + 1}. "${botName}" - ${count} пользователей`)
    })

    console.log(`\n📈 Общая статистика:`)
    console.log(`   • Уникальных ботов: ${sortedBots.length}`)
    console.log(`   • Общее количество пользователей с bot_name: ${botNames.length}`)

    // Ищем варианты с "ai" или "stars"
    console.log(`\n🔍 Боты содержащие "ai" или "stars":`)
    const aiStarsBots = sortedBots.filter(([botName]) => 
      botName.toLowerCase().includes('ai') || botName.toLowerCase().includes('stars')
    )
    
    if (aiStarsBots.length > 0) {
      aiStarsBots.forEach(([botName, count]) => {
        console.log(`   • "${botName}" - ${count} пользователей`)
      })
    } else {
      console.log('   ❌ Не найдено ботов с "ai" или "stars"')
    }

  } catch (error) {
    console.error('❌ Непредвиденная ошибка:', error.message)
  }
}

checkBotNames()
  .then(() => {
    console.log('\n✅ Анализ завершен')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Ошибка выполнения:', error.message)
    process.exit(1)
  })
