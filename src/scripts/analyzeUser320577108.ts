#!/usr/bin/env tsx

/**
 * Диагностический скрипт для анализа пользователя 320577108
 * Проверяет модели, статусы и данные пользователя
 */

import { supabase } from '@/core/supabase'

const TARGET_USER_ID = 320577108

async function analyzeUser() {
  console.log(`🔍 Анализ пользователя ${TARGET_USER_ID}`)
  console.log('='.repeat(50))

  try {
    // 1. Проверяем основные данные пользователя
    console.log('\n1. 👤 Основные данные пользователя:')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', TARGET_USER_ID)
      .single()

    if (userError) {
      console.error('❌ Ошибка получения данных пользователя:', userError)
    } else {
      console.log('✅ Пользователь найден:')
      console.log(`   - ID: ${userData.telegram_id}`)
      console.log(`   - Имя: ${userData.first_name} ${userData.last_name}`)
      console.log(`   - Username: ${userData.username}`)
      console.log(`   - Баланс: ${userData.stars}`)
      console.log(`   - Подписка: ${userData.subscription_type}`)
      console.log(`   - Создан: ${userData.created_at}`)
    }

    // 2. Проверяем ВСЕ записи в model_trainings
    console.log('\n2. 🤖 Все записи в model_trainings:')
    const { data: allModels, error: allModelsError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', TARGET_USER_ID)
      .order('created_at', { ascending: false })

    if (allModelsError) {
      console.error('❌ Ошибка получения моделей:', allModelsError)
    } else if (!allModels || allModels.length === 0) {
      console.log('❌ У пользователя НЕТ записей в model_trainings')
    } else {
      console.log(`✅ Найдено ${allModels.length} записей:`)
      allModels.forEach((model, index) => {
        console.log(`   ${index + 1}. ID: ${model.id}`)
        console.log(`      - Название: ${model.model_name}`)
        console.log(`      - Статус: ${model.status}`)
        console.log(`      - API: ${model.api}`)
        console.log(`      - Trigger Word: ${model.trigger_word}`)
        console.log(`      - Model URL: ${model.model_url}`)
        console.log(`      - Создана: ${model.created_at}`)
        console.log(`      - Steps: ${model.steps}`)
        console.log('      ---')
      })
    }

    // 3. Проверяем только SUCCESS модели
    console.log('\n3. ✅ Только SUCCESS модели:')
    const { data: successModels, error: successError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', TARGET_USER_ID)
      .eq('status', 'SUCCESS')
      .order('created_at', { ascending: false })

    if (successError) {
      console.error('❌ Ошибка получения SUCCESS моделей:', successError)
    } else if (!successModels || successModels.length === 0) {
      console.log('❌ У пользователя НЕТ SUCCESS моделей')
    } else {
      console.log(`✅ Найдено ${successModels.length} SUCCESS моделей:`)
      successModels.forEach((model, index) => {
        console.log(`   ${index + 1}. API: ${model.api} | ${model.model_name}`)
      })
    }

    // 4. Проверяем BFL модели (которые ищет система)
    console.log('\n4. 🎯 BFL модели (SUCCESS):')
    const { data: bflModels, error: bflError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', TARGET_USER_ID)
      .eq('status', 'SUCCESS')
      .eq('api', 'bfl')
      .order('created_at', { ascending: false })

    if (bflError) {
      console.error('❌ Ошибка получения BFL моделей:', bflError)
    } else if (!bflModels || bflModels.length === 0) {
      console.log('❌ У пользователя НЕТ BFL SUCCESS моделей')
      console.log('   👉 Это объясняет ошибку "У вас нет обученных моделей"')
    } else {
      console.log(`✅ Найдено ${bflModels.length} BFL SUCCESS моделей:`)
      bflModels.forEach((model, index) => {
        console.log(
          `   ${index + 1}. ${model.model_name} (${model.created_at})`
        )
      })
    }

    // 5. Проверяем Replicate модели
    console.log('\n5. 🔄 Replicate модели (SUCCESS):')
    const { data: replicateModels, error: replicateError } = await supabase
      .from('model_trainings')
      .select('*')
      .eq('telegram_id', TARGET_USER_ID)
      .eq('status', 'SUCCESS')
      .eq('api', 'replicate')
      .order('created_at', { ascending: false })

    if (replicateError) {
      console.error('❌ Ошибка получения Replicate моделей:', replicateError)
    } else if (!replicateModels || replicateModels.length === 0) {
      console.log('❌ У пользователя НЕТ Replicate SUCCESS моделей')
    } else {
      console.log(
        `✅ Найдено ${replicateModels.length} Replicate SUCCESS моделей:`
      )
      replicateModels.forEach((model, index) => {
        console.log(
          `   ${index + 1}. ${model.model_name} (${model.created_at})`
        )
      })
    }

    // 6. Проверяем статистику по статусам
    console.log('\n6. 📊 Статистика по статусам:')
    const { data: statusStats, error: statusError } = await supabase
      .from('model_trainings')
      .select('status')
      .eq('telegram_id', TARGET_USER_ID)

    if (statusError) {
      console.error('❌ Ошибка получения статистики:', statusError)
    } else if (!statusStats || statusStats.length === 0) {
      console.log('❌ Нет данных для статистики')
    } else {
      const stats = statusStats.reduce(
        (acc, item) => {
          acc[item.status || 'undefined'] =
            (acc[item.status || 'undefined'] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )

      Object.entries(stats).forEach(([status, count]) => {
        console.log(`   - ${status}: ${count}`)
      })
    }
  } catch (error) {
    console.error('💥 Неожиданная ошибка:', error)
  }

  console.log('\n' + '='.repeat(50))
  console.log('🎯 ВЫВОДЫ:')
  console.log('- Если у пользователя нет BFL SUCCESS моделей - это нормально')
  console.log(
    '- Пользователю нужно сначала обучить модель через "🤖 Цифровое тело аватара"'
  )
  console.log('- Только после этого он сможет использовать "📸 Нейрофото"')
}

// Запускаем анализ
analyzeUser().catch(console.error)
