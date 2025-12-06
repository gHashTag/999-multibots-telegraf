import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || ''

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL или SUPABASE_SERVICE_KEY не найдены в переменных окружения')
  console.log('💡 Попробуйте запустить с загруженными переменными:')
  console.log('   source .env')
  console.log('   npx ts-node scripts/check-recent-neurophoto-generations.ts')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

/**
 * Показывает последние генерации нейрофото с неправильными лицами
 */
async function checkRecentNeuroPhotoGenerations() {
  console.log('🔍 Ищу последние генерации нейрофото...\n')

  try {
    // Получаем последние генерации нейрофото
    const { data: prompts, error } = await supabase
      .from('prompts_history')
      .select('*')
      .eq('mode', 'neuro_photo')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('❌ Ошибка при получении истории промптов:', error)
      return
    }

    if (!prompts || prompts.length === 0) {
      console.log('⚠️ Записей о генерации нейрофото не найдено')
      return
    }

    console.log(`📊 Найдено записей: ${prompts.length}`)
    console.log('='.repeat(100))

    prompts.forEach((prompt, index) => {
      console.log(`\n🎨 ГЕНЕРАЦИЯ ${index + 1}:`)
      console.log(`   ID: ${prompt.prompt_id}`)
      console.log(`   Telegram ID: ${prompt.telegram_id}`)
      console.log(`   Дата: ${prompt.created_at}`)
      console.log(`   Статус: ${prompt.status}`)
      console.log(`   Модель: ${prompt.model_type}`)
      console.log(`   Промпт: ${prompt.prompt.substring(0, 150)}...`)

      if (prompt.media_url) {
        console.log(`   URL изображения: ${prompt.media_url.substring(0, 100)}...`)
      }

      console.log('-'.repeat(100))
    })

    // Группируем по пользователям
    console.log('\n👥 СТАТИСТИКА ПО ПОЛЬЗОВАТЕЛЯМ:')

    const userStats: { [key: string]: number } = {}
    prompts.forEach(prompt => {
      if (prompt.telegram_id) {
        userStats[prompt.telegram_id] = (userStats[prompt.telegram_id] || 0) + 1
      }
    })

    Object.entries(userStats)
      .sort(([, a], [, b]) => b - a)
      .forEach(([userId, count]) => {
        console.log(`   Пользователь ${userId}: ${count} генераций`)
      })

    console.log('\n💡 ПОСЛЕДНИЕ 5 ПОЛЬЗОВАТЕЛЕЙ:')
    const recentUsers = [...new Set(prompts.slice(0, 10).map(p => p.telegram_id).filter(Boolean))]

    recentUsers.forEach((userId, index) => {
      console.log(`   ${index + 1}. ${userId}`)
    })

  } catch (error) {
    console.error('❌ Критическая ошибка:', error)
  }
}

/**
 * Проверяет модели пользователя по Telegram ID
 */
async function checkUserModels(telegramId: string) {
  console.log(`\n🔍 Проверяю модели для пользователя: ${telegramId}\n`)

  try {
    // Получаем модели пользователя
    const { data: models, error } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Ошибка при получении моделей:', error)
      return
    }

    if (!models || models.length === 0) {
      console.log('⚠️ У пользователя нет обученных моделей')
      return
    }

    console.log(`📊 Найдено моделей: ${models.length}`)
    console.log('='.repeat(100))

    models.forEach((model, index) => {
      console.log(`\n🏷️  МОДЕЛЬ ${index + 1}:`)
      console.log(`   ID: ${model.id}`)
      console.log(`   Имя: ${model.model_name}`)
      console.log(`   Trigger Word: "${model.trigger_word}"`)
      console.log(`   Status: ${model.status}`)
      console.log(`   API: ${model.api}`)
      console.log(`   Model URL: ${model.model_url}`)
      console.log(`   Дата создания: ${model.created_at}`)
      console.log(`   Steps: ${model.steps}`)
      console.log('-'.repeat(100))
    })

  } catch (error) {
    console.error('❌ Критическая ошибка:', error)
  }
}

// Главная функция
async function main() {
  const telegramId = process.argv[2]

  if (!telegramId) {
    console.log(`
🔍 ПРОСМОТР ПОСЛЕДНИХ ГЕНЕРАЦИЙ НЕЙРОФОТО

Использование:
  npx ts-node scripts/check-recent-neurophoto-generations.ts [TelegramID]

Примеры:
  npx ts-node scripts/check-recent-neurophoto-generations.ts
  npx ts-node scripts/check-recent-neurophoto-generations.ts 1234567890

Функции:
  ✅ Показывает последние 20 генераций нейрофото
  ✅ Отображает статистику по пользователям
  ✅ Если указан Telegram ID - показывает модели этого пользователя
    `)
    process.exit(0)
  }

  console.log('='.repeat(100))
  console.log('🔬 ПРОСМОТР ГЕНЕРАЦИЙ НЕЙРОФОТО')
  console.log('='.repeat(100))

  await checkRecentNeuroPhotoGenerations()

  if (telegramId) {
    await checkUserModels(telegramId)
  }

  console.log('\n' + '='.repeat(100))
  console.log('✅ Проверка завершена')
  console.log('='.repeat(100))
}

main().catch(error => {
  console.error('💥 Фатальная ошибка:', error)
  process.exit(1)
})
