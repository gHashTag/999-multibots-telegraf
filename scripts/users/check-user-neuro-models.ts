import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || ''

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL или SUPABASE_SERVICE_KEY не найдены в переменных окружения')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface ModelTraining {
  id: string
  created_at: string
  model_name: string
  trigger_word: string
  model_url: string
  status?: string
  api?: string
  telegram_id?: number
  steps?: number
}

/**
 * Проверяет и отображает все нейро-модели пользователя
 */
async function checkUserNeuroModels(telegramId: string) {
  console.log(`🔍 Проверяю модели для пользователя: ${telegramId}`)

  try {
    // Получаем все модели пользователя
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

    console.log(`\n📊 Найдено моделей: ${models.length}`)
    console.log('='.repeat(80))

    models.forEach((model, index) => {
      console.log(`\n🏷️  МОДЕЛЬ ${index + 1}`)
      console.log(`   ID: ${model.id}`)
      console.log(`   Имя: ${model.model_name}`)
      console.log(`   Trigger Word: ${model.trigger_word}`)
      console.log(`   Status: ${model.status}`)
      console.log(`   API: ${model.api}`)
      console.log(`   Model URL: ${model.model_url}`)
      console.log(`   Дата создания: ${model.created_at}`)
      console.log(`   Steps: ${model.steps}`)
      console.log('-'.repeat(80))
    })

    // Фильтруем успешные модели
    const successfulModels = models.filter(m => m.status === 'SUCCESS')

    if (successfulModels.length > 0) {
      console.log(`\n✅ АКТИВНЫЕ МОДЕЛИ (статус SUCCESS): ${successfulModels.length}`)

      successfulModels.forEach((model, index) => {
        console.log(`\n🎯 АКТИВНАЯ МОДЕЛЬ ${index + 1}:`)
        console.log(`   Имя: ${model.model_name}`)
        console.log(`   Trigger: "${model.trigger_word}"`)
        console.log(`   URL: ${model.model_url}`)
      })
    }

    // Проверяем последние генерации нейрофото
    console.log(`\n📸 ПОСЛЕДНИЕ ГЕНЕРАЦИИ НЕЙРОФОТО:`)

    const { data: prompts, error: promptsError } = await supabase
      .from('prompts_history')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('mode', 'neuro_photo')
      .order('created_at', { ascending: false })
      .limit(10)

    if (promptsError) {
      console.error('❌ Ошибка при получении истории промптов:', promptsError)
    } else if (prompts && prompts.length > 0) {
      console.log(`   Найдено записей: ${prompts.length}`)
      prompts.forEach((prompt, index) => {
        console.log(`\n   ${index + 1}. ${prompt.created_at}`)
        console.log(`      Промпт: ${prompt.prompt.substring(0, 100)}...`)
        console.log(`      Модель: ${prompt.model_type}`)
        console.log(`      Статус: ${prompt.status}`)
        if (prompt.media_url) {
          console.log(`      URL: ${prompt.media_url.substring(0, 50)}...`)
        }
      })
    } else {
      console.log('   Записей о генерации нейрофото не найдено')
    }

  } catch (error) {
    console.error('❌ Критическая ошибка:', error)
  }
}

/**
 * Проверяет и исправляет проблемы с моделями
 */
async function fixUserNeuroModels(telegramId: string) {
  console.log(`\n🔧 Попытка исправления моделей для пользователя: ${telegramId}`)

  try {
    // Получаем модели пользователя
    const { data: models, error } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', telegramId)
      .eq('status', 'SUCCESS')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Ошибка при получении моделей:', error)
      return
    }

    if (!models || models.length === 0) {
      console.log('⚠️ Нет активных моделей для исправления')
      return
    }

    console.log(`\n💡 РЕКОМЕНДАЦИИ:`)

    // Проверяем trigger words
    console.log('\n1️⃣ ПРОВЕРКА TRIGGER WORDS:')
    models.forEach((model, index) => {
      console.log(`   ${index + 1}. ${model.model_name}: "${model.trigger_word}"`)
      if (!model.trigger_word || model.trigger_word.length < 3) {
        console.log(`      ⚠️  Trigger word слишком короткий или отсутствует!`)
      }
    })

    // Проверяем URL моделей
    console.log('\n2️⃣ ПРОВЕРКА MODEL URLS:')
    models.forEach((model, index) => {
      console.log(`   ${index + 1}. ${model.model_name}:`)
      console.log(`      URL: ${model.model_url}`)
      if (!model.model_url || !model.model_url.startsWith('http')) {
        console.log(`      ❌ Некорректный URL модели!`)
      } else {
        console.log(`      ✅ URL выглядит корректно`)
      }
    })

    // Предлагаем решения
    console.log('\n3️⃣ ВОЗМОЖНЫЕ РЕШЕНИЯ ПРОБЛЕМЫ:')
    console.log('')
    console.log('   Вариант 1: Переобучить модели')
    console.log('   - Удалите старые модели')
    console.log('   - Загрузите новые фотографии')
    console.log('   - Обучите новые модели с правильными trigger words')
    console.log('')
    console.log('   Вариант 2: Проверить LoRA настройки')
    console.log('   - Убедитесь что используется правильный LoRA scale')
    console.log('   - Проверьте правильность trigger words в промпте')
    console.log('')
    console.log('   Вариант 3: Проверить качество исходных фото')
    console.log('   - Используйте фото с хорошим освещением')
    console.log('   - Убедитесь что лицо четко видно')
    console.log('   - Используйте разные ракурсы (5-10 фото)')

  } catch (error) {
    console.error('❌ Критическая ошибка при исправлении:', error)
  }
}

// Главная функция
async function main() {
  const telegramId = process.argv[2]

  if (!telegramId) {
    console.log(`
🔍 СКРИПТ ДИАГНОСТИКИ НЕЙРО-МОДЕЛЕЙ

Использование:
  npx ts-node scripts/check-user-neuro-models.ts <TelegramID>

Пример:
  npx ts-node scripts/check-user-neuro-models.ts 1234567890

Функции:
  ✅ Показывает все обученные модели пользователя
  ✅ Проверяет статус моделей
  ✅ Отображает историю генераций
  ✅ Даёт рекомендации по исправлению
    `)
    process.exit(0)
  }

  console.log('='.repeat(80))
  console.log('🔬 ДИАГНОСТИКА НЕЙРО-МОДЕЛЕЙ ПОЛЬЗОВАТЕЛЯ')
  console.log('='.repeat(80))

  await checkUserNeuroModels(telegramId)
  await fixUserNeuroModels(telegramId)

  console.log('\n' + '='.repeat(80))
  console.log('✅ Диагностика завершена')
  console.log('='.repeat(80))
}

main().catch(error => {
  console.error('💥 Фатальная ошибка:', error)
  process.exit(1)
})
