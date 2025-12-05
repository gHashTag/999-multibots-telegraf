#!/usr/bin/env node

/**
 * АНАЛИЗ МОДЕЛЕЙ ПОЛЬЗОВАТЕЛЯ 435572800
 * Изучаем metadata в payments_v2 чтобы найти какие модели использовались
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fd763fa3-35d5-4045-93bd-1795c5f00fc3.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY не найден в переменных окружения')
  console.log('💡 Попробуйте: source .env && npm run env:sync')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const TELEGRAM_ID = '435572800'

/**
 * Анализирует пользователя и его модели
 */
async function analyzeUser() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           🔍 АНАЛИЗ ПОЛЬЗОВАТЕЛЯ ${TELEGRAM_ID}               ║
╚═══════════════════════════════════════════════════════════════╝

`)

  try {
    // 1. Получаем информацию о пользователе
    console.log('📋 1. ПОИСК ПОЛЬЗОВАТЕЛЯ...')
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .single()

    if (userError) {
      console.log('⚠️ Пользователь не найден в таблице users:', userError.message)
    } else {
      console.log('✅ Пользователь найден:')
      console.log(`   ID: ${user.user_id}`)
      console.log(`   Имя: ${user.first_name} ${user.last_name || ''}`)
      console.log(`   Username: ${user.username || 'не указан'}`)
      console.log(`   Создан: ${user.created_at}`)
    }

    // 2. Получаем все платежи за нейрофото
    console.log('\n📊 2. ПОИСК ПЛАТЕЖЕЙ ЗА НЕЙРОФОТО...')
    const { data: payments, error: paymentsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .ilike('service_type', '%neuro%')
      .order('created_at', { ascending: false })
      .limit(50)

    if (paymentsError) {
      console.log('❌ Ошибка при получении платежей:', paymentsError.message)
      return
    }

    if (!payments || payments.length === 0) {
      console.log('⚠️ Платежи за нейрофото не найдены')
    } else {
      console.log(`✅ Найдено платежей за нейрофото: ${payments.length}`)
      console.log('\n📋 СПИСОК ПЛАТЕЖЕЙ:')
      payments.forEach((payment, index) => {
        console.log(`\n[${index + 1}] ${payment.created_at}`)
        console.log(`   Тип: ${payment.service_type}`)
        console.log(`   Сумма: ${payment.amount} ${payment.currency || ''}`)
        console.log(`   Звезды: ${payment.stars || 'не указано'}`)
        console.log(`   Статус: ${payment.status}`)
        console.log(`   Бот: ${payment.bot_name}`)
        console.log(`   Описание: ${payment.description}`)
        if (payment.metadata) {
          console.log(`   Metadata: ${JSON.stringify(payment.metadata, null, 2)}`)
        }
      })
    }

    // 3. Анализируем метаданные на предмет моделей
    console.log('\n🔍 3. АНАЛИЗ МЕТАДАННЫХ НА ПРЕДМЕТ МОДЕЛЕЙ...')
    const modelsInMetadata = new Set()
    const modelUrls = new Map()

    payments.forEach(payment => {
      if (payment.metadata) {
        const metadata = payment.metadata

        // Ищем различные поля с моделями
        const modelFields = [
          'model_url',
          'model_type',
          'model',
          'modelName',
          'lora_path',
          'lora_trigger',
          'provider',
          'provider_model',
          'ai_model'
        ]

        modelFields.forEach(field => {
          if (metadata[field]) {
            modelsInMetadata.add(`${field}: ${metadata[field]}`)
            if (metadata[field].includes('http')) {
              modelUrls.set(field, metadata[field])
            }
          }
        })

        // Ищем в nested objects
        Object.keys(metadata).forEach(key => {
          if (typeof metadata[key] === 'object' && metadata[key] !== null) {
            Object.keys(metadata[key]).forEach(subKey => {
              if (subKey.toLowerCase().includes('model')) {
                modelsInMetadata.add(`${key}.${subKey}: ${metadata[key][subKey]}`)
              }
            })
          }
        })
      }
    })

    if (modelsInMetadata.size > 0) {
      console.log('✅ НАЙДЕННЫЕ МОДЕЛИ В METADATA:')
      modelsInMetadata.forEach(model => {
        console.log(`   📦 ${model}`)
      })
    } else {
      console.log('⚠️ Модели в metadata не найдены')
    }

    if (modelUrls.size > 0) {
      console.log('\n🔗 URL МОДЕЛЕЙ:')
      modelUrls.forEach((url, field) => {
        console.log(`   ${field}: ${url}`)
      })
    }

    // 4. Получаем обученные модели пользователя
    console.log('\n🎓 4. ПОИСК ОБУЧЕННЫХ МОДЕЛЕЙ...')
    const { data: models, error: modelsError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .order('created_at', { ascending: false })

    if (modelsError) {
      console.log('❌ Ошибка при получении моделей:', modelsError.message)
    } else if (!models || models.length === 0) {
      console.log('⚠️ Обученных моделей не найдено')
    } else {
      console.log(`✅ Найдено обученных моделей: ${models.length}`)
      console.log('\n📋 СПИСОК МОДЕЛЕЙ:')
      models.forEach((model, index) => {
        console.log(`\n[${index + 1}] ${model.created_at}`)
        console.log(`   ID: ${model.id}`)
        console.log(`   Имя: ${model.model_name}`)
        console.log(`   Trigger: "${model.trigger_word}"`)
        console.log(`   URL: ${model.model_url}`)
        console.log(`   Status: ${model.status}`)
        console.log(`   API: ${model.api}`)
        console.log(`   Steps: ${model.steps}`)
      })
    }

    // 5. Получаем историю генераций
    console.log('\n🎨 5. ПОИСК ИСТОРИИ ГЕНЕРАЦИЙ...')
    const { data: prompts, error: promptsError } = await supabase
      .from('prompts_history')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .eq('mode', 'neuro_photo')
      .order('created_at', { ascending: false })
      .limit(20)

    if (promptsError) {
      console.log('❌ Ошибка при получении истории:', promptsError.message)
    } else if (!prompts || prompts.length === 0) {
      console.log('⚠️ История генераций не найдена')
    } else {
      console.log(`✅ Найдено записей в истории: ${prompts.length}`)
      console.log('\n📋 ПОСЛЕДНИЕ ГЕНЕРАЦИИ:')
      prompts.forEach((prompt, index) => {
        console.log(`\n[${index + 1}] ${prompt.created_at}`)
        console.log(`   Промпт: ${prompt.prompt.substring(0, 100)}...`)
        console.log(`   Модель: ${prompt.model_type}`)
        console.log(`   Статус: ${prompt.status}`)
        if (prompt.media_url) {
          console.log(`   URL: ${prompt.media_url.substring(0, 80)}...`)
        }
      })
    }

    // 6. ИТОГОВАЯ ДИАГНОСТИКА
    console.log('\n' + '='.repeat(80))
    console.log('📊 ИТОГОВАЯ ДИАГНОСТИКА:')
    console.log('='.repeat(80))

    const issues = []
    const recommendations = []

    if (!user) {
      issues.push('❌ Пользователь не найден в базе')
    }

    if (!payments || payments.length === 0) {
      issues.push('❌ Нет платежей за нейрофото')
      recommendations.push('💡 Попробуйте сгенерировать нейрофото через бота')
    } else {
      console.log(`✅ Платежи найдены: ${payments.length}`)
    }

    if (!models || models.length === 0) {
      issues.push('⚠️ Нет обученных моделей')
      recommendations.push('💡 Обучите новую модель через /face train')
    } else {
      const successfulModels = models.filter(m => m.status === 'SUCCESS')
      console.log(`✅ Обученные модели: ${models.length} (успешных: ${successfulModels.length})`)

      if (successfulModels.length < 2) {
        issues.push('⚠️ Мало успешных моделей')
        recommendations.push('💡 Обучите еще одну модель')
      }
    }

    if (modelsInMetadata.size === 0) {
      issues.push('⚠️ Модели не найдены в metadata платежей')
      recommendations.push('💡 Проверьте историю генераций')
    }

    console.log('\n🔍 НАЙДЕННЫЕ ПРОБЛЕМЫ:')
    if (issues.length === 0) {
      console.log('✅ Критических проблем не найдено')
    } else {
      issues.forEach(issue => console.log(`   ${issue}`))
    }

    console.log('\n💡 РЕКОМЕНДАЦИИ:')
    if (recommendations.length === 0) {
      console.log('✅ Все в порядке! Попробуйте сгенерировать новое фото')
    } else {
      recommendations.forEach(rec => console.log(`   ${rec}`))
    }

    // 7. КОНКРЕТНЫЕ ДЕЙСТВИЯ
    console.log('\n🎯 КОНКРЕТНЫЕ ДЕЙСТВИЯ ДЛЯ ВОССТАНОВЛЕНИЯ:')
    console.log('-' .repeat(80))

    if (models && models.length > 0) {
      console.log('\n1️⃣ УДАЛИТЕ НЕПРАВИЛЬНЫЕ МОДЕЛИ:')
      models.forEach((model, index) => {
        if (model.status !== 'SUCCESS') {
          console.log(`   DELETE FROM model_trainings WHERE id = '${model.id}';`)
        }
      })

      console.log('\n2️⃣ ПРОВЕРЬТЕ TRIGGER WORDS:')
      models.forEach((model, index) => {
        console.log(`   Модель "${model.model_name}": "${model.trigger_word}"`)
      })
    }

    console.log('\n3️⃣ ДЛЯ НОВОГО ОБУЧЕНИЯ:')
    console.log('   - Используйте команду /face в боте')
    console.log('   - Загрузите 5-10 качественных фото')
    console.log('   - Выберите уникальный trigger word')
    console.log('   - Убедитесь что статус = SUCCESS')

    console.log('\n4️⃣ ТЕСТ ГЕНЕРАЦИИ:')
    console.log(`   Используйте промпт с вашим trigger word:`)
    if (models && models.length > 0 && models[0].trigger_word) {
      console.log(`   "${models[0].trigger_word} portrait in cyberpunk style"`)
    } else {
      console.log('   "YOUR_NAME_HERE portrait in cyberpunk style"')
    }

  } catch (error) {
    console.error('💥 Критическая ошибка:', error)
  }
}

// Запуск анализа
analyzeUser()
  .then(() => {
    console.log('\n✅ Анализ завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 Фатальная ошибка:', error)
    process.exit(1)
  })
