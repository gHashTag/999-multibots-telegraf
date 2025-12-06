// Проверяем модели пользователя через Supabase
import { supabase } from '@/core/supabase'

async function checkUserModels(telegramId: string) {
  console.log(`🔍 Проверяем модели пользователя ${telegramId}...`)

  // 1. Все модели
  console.log('\n📋 ВСЕ МОДЕЛИ:')
  const { data: allModels, error: allError } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('status', 'SUCCESS')
    .order('created_at', { ascending: false })

  if (allError) {
    console.error('❌ Ошибка получения всех моделей:', allError)
  } else {
    console.log(`✅ Найдено ${allModels?.length || 0} моделей`)
    allModels?.forEach((model, i) => {
      console.log(`  ${i + 1}. ${model.model_name} (API: ${model.api}, ID: ${model.id})`)
    })
  }

  // 2. Replicate модели
  console.log('\n🔄 ТОЛЬКО REPLICATE МОДЕЛИ:')
  const { data: replicateModels, error: repError } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('status', 'SUCCESS')
    .eq('api', 'replicate')
    .order('created_at', { ascending: false })

  if (repError) {
    console.error('❌ Ошибка получения replicate моделей:', repError)
  } else {
    console.log(`✅ Найдено ${replicateModels?.length || 0} replicate моделей`)
    replicateModels?.forEach((model, i) => {
      console.log(`  ${i + 1}. ${model.model_name} (URL: ${model.model_url.substring(0, 50)}...)`)
    })
  }

  // 3. Не-Replicate модели
  console.log('\n🎭 НЕ-REPLICATE МОДЕЛИ:')
  const { data: otherModels, error: otherError } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('status', 'SUCCESS')
    .neq('api', 'replicate')
    .order('created_at', { ascending: false })

  if (otherError) {
    console.error('❌ Ошибка получения других моделей:', otherError)
  } else {
    console.log(`✅ Найдено ${otherModels?.length || 0} других моделей`)
    otherModels?.forEach((model, i) => {
      console.log(`  ${i + 1}. ${model.model_name} (API: ${model.api}, URL: ${model.model_url.substring(0, 50)}...)`)
    })
  }

  // 4. История генераций
  console.log('\n📜 ИСТОРИЯ ГЕНЕРАЦИЙ:')
  const { data: history, error: histError } = await supabase
    .from('prompts_history')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('mode', 'neuro_photo')
    .order('created_at', { ascending: false })
    .limit(5)

  if (histError) {
    console.error('❌ Ошибка получения истории:', histError)
  } else {
    console.log(`✅ Последние ${history?.length || 0} генераций:`)
    history?.forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.model_type} - ${h.status} - ${h.created_at}`)
    })
  }

  console.log('\n✅ Проверка завершена!')
}

checkUserModels('144022504')
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Критическая ошибка:', err)
    process.exit(1)
  })
