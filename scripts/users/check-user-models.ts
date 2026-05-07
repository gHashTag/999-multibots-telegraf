/**
 * 🔍 СКРИПТ ДЛЯ ПРОВЕРКИ НАТРЕНИРОВАННЫХ МОДЕЛЕЙ ПОЛЬЗОВАТЕЛЯ
 *
 * Использование:
 * bun run scripts/users/check-user-models.ts <telegram_id>
 *
 * Пример:
 * bun run scripts/users/check-user-models.ts 5439920152
 */

import { supabase } from '@/core/supabase'
import { getUserByTelegramId } from '@/core/supabase/getUserByTelegramId'
import { initInfisical, getSecret } from '@/core/infisical'

// Инициализация Infisical для загрузки секретов
async function initializeInfisical() {
  console.log('🔐 Инициализация Infisical...')

  try {
    await initInfisical()

    // Загружаем необходимые секреты в process.env
    const supabaseUrl = getSecret('SUPABASE_URL')
    const supabaseServiceKey = getSecret('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseAnonKey = getSecret('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Критические секреты Supabase не найдены!')
    }

    process.env.SUPABASE_URL = supabaseUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceKey
    process.env.SUPABASE_ANON_KEY = supabaseAnonKey

    console.log('✅ Infisical инициализирован успешно\n')
    return true
  } catch (error) {
    console.error('❌ Ошибка инициализации Infisical:', error)
    throw error
  }
}

interface ModelTraining {
  id: string
  user_id: string
  telegram_id?: string
  model_name: string
  trigger_word: string
  zip_url: string
  model_url?: string
  replicate_training_id?: string
  status: string
  error?: string
  created_at: string
  updated_at: string
  steps?: number
  api?: string
  gender?: string
  bot_name?: string
}

function getStatusEmoji(status: string): string {
  const emojiMap: Record<string, string> = {
    'pending': '⏳',
    'processing': '🔄',
    'succeeded': '✅',
    'SUCCESS': '✅',
    'failed': '❌',
    'FAILED': '❌',
    'canceled': '🚫',
    'starting': '🚀',
    'completed': '✅'
  }
  return emojiMap[status] || '❓'
}

async function checkUserModels(telegramId: string): Promise<void> {
  try {
    console.log(`🔍 Проверяю модели пользователя ${telegramId}...\n`)

    // 1. Получаем информацию о пользователе
    try {
      const user = await getUserByTelegramId(telegramId)
      if (user) {
        console.log(`👤 Пользователь найден:`)
        console.log(`   Username: @${user.username || 'не указан'}`)
        console.log(`   Bot: ${user.bot_name || 'не указан'}`)
        console.log(`   Created: ${new Date(user.created_at).toLocaleString('ru-RU')}\n`)
      }
    } catch (err) {
      console.warn(`⚠️ Не удалось получить данные пользователя, продолжаю проверку моделей...\n`)
    }

    // 2. ВСЕ МОДЕЛИ (используем только telegram_id)
    console.log('📋 ВСЕ МОДЕЛИ (все статусы):')
    const { data: allModels, error: allError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })

    if (allError) {
      console.error('❌ Ошибка получения всех моделей:', allError.message)
      return
    }

    if (!allModels || allModels.length === 0) {
      console.log('📭 У пользователя нет моделей в базе данных\n')
      return
    }

    console.log(`✅ Найдено ${allModels.length} моделей\n`)
    console.log('━'.repeat(100))

    allModels.forEach((model: ModelTraining, i: number) => {
      console.log(`\n🎭 Модель #${i + 1}:`)
      console.log(`   ID: ${model.id}`)
      console.log(`   Название: ${model.model_name || 'не указано'}`)
      console.log(`   Trigger Word: ${model.trigger_word || 'не указано'}`)
      console.log(`   Статус: ${getStatusEmoji(model.status)} ${model.status}`)
      console.log(`   API: ${model.api || 'не указано'}`)
      console.log(`   Gender: ${model.gender || 'не указано'}`)
      console.log(`   Steps: ${model.steps || 'не указано'}`)
      console.log(`   Bot: ${model.bot_name || 'не указано'}`)
      console.log(`   Replicate Training ID: ${model.replicate_training_id || 'не указано'}`)
      console.log(`   ZIP URL: ${model.zip_url ? '✅ Есть' : '❌ Нет'}`)

      if (model.model_url) {
        console.log(`   Model URL: ✅ ${model.model_url}`)
      } else {
        console.log(`   Model URL: ❌ Нет`)
      }

      console.log(`   Создано: ${new Date(model.created_at).toLocaleString('ru-RU')}`)
      console.log(`   Обновлено: ${new Date(model.updated_at).toLocaleString('ru-RU')}`)

      if (model.error) {
        console.log(`   ⚠️ Ошибка: ${model.error}`)
      }
    })

    console.log('\n' + '━'.repeat(100))

    // 3. Статистика по статусам
    const statusStats = allModels.reduce((acc: any, model: ModelTraining) => {
      acc[model.status] = (acc[model.status] || 0) + 1
      return acc
    }, {})

    console.log(`\n📈 Статистика по статусам:`)
    Object.entries(statusStats).forEach(([status, count]) => {
      console.log(`   ${getStatusEmoji(status)} ${status}: ${count}`)
    })

    // 4. Статистика по API
    const apiStats = allModels.reduce((acc: any, model: ModelTraining) => {
      const api = model.api || 'не указано'
      acc[api] = (acc[api] || 0) + 1
      return acc
    }, {})

    console.log(`\n🔌 Статистика по API:`)
    Object.entries(apiStats).forEach(([api, count]) => {
      console.log(`   ${api}: ${count}`)
    })

    // 5. Успешные модели
    const successModels = allModels.filter((m: ModelTraining) =>
      (m.status === 'succeeded' || m.status === 'SUCCESS' || m.status === 'completed') && m.model_url
    )
    console.log(`\n✅ Успешных моделей с URL: ${successModels.length}`)
    if (successModels.length > 0) {
      successModels.forEach((m: ModelTraining, i: number) => {
        console.log(`   ${i + 1}. ${m.model_name} (${m.api}) - ${m.model_url}`)
      })
    }

    // 6. Модели с ошибками
    const errorModels = allModels.filter((m: ModelTraining) => m.error || m.status === 'failed' || m.status === 'FAILED')
    if (errorModels.length > 0) {
      console.log(`\n⚠️ Модели с ошибками: ${errorModels.length}`)
      errorModels.forEach((m: ModelTraining, i: number) => {
        console.log(`   ${i + 1}. ${m.model_name}: ${m.error || 'Статус failed'}`)
      })
    }

    // 7. История генераций с этими моделями
    console.log(`\n📜 ИСТОРИЯ ГЕНЕРАЦИЙ С МОДЕЛЯМИ:`)
    const { data: history, error: histError } = await supabase
      .from('prompts_history')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('mode', 'neuro_photo')
      .order('created_at', { ascending: false })
      .limit(10)

    if (histError) {
      console.error('❌ Ошибка получения истории:', histError.message)
    } else {
      console.log(`✅ Последние ${history?.length || 0} генераций:`)
      history?.forEach((h: any, i: number) => {
        console.log(`   ${i + 1}. ${h.model_type || 'не указано'} - ${h.status} - ${new Date(h.created_at).toLocaleString('ru-RU')}`)
      })
    }

    console.log('\n✅ Проверка завершена!')

  } catch (error) {
    console.error(`❌ Критическая ошибка:`, error)
    process.exit(1)
  }
}

// Запуск скрипта
const telegramId = process.argv[2]

if (!telegramId) {
  console.error('❌ Укажите Telegram ID пользователя')
  console.error('Использование: bun run scripts/users/check-user-models.ts <telegram_id>')
  console.error('Пример: bun run scripts/users/check-user-models.ts 5439920152')
  process.exit(1)
}

// Инициализируем Infisical и запускаем скрипт
initializeInfisical()
  .then(() => checkUserModels(telegramId))
  .then(() => {
    console.log('\n🎉 Готово!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения:', error)
    process.exit(1)
  })
