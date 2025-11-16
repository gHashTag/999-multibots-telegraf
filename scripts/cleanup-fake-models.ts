import { supabase } from '../src/core/supabase'

async function cleanupFakeModels() {
  console.log('\n🧹 Очистка фейковых моделей "fal-test"...\n')

  const telegramId = '144022504'

  // 1. Получаем ВСЕ модели пользователя
  const { data: allModels, error } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Ошибка:', error)
    return
  }

  console.log(`📋 Всего моделей: ${allModels?.length || 0}\n`)

  // 2. Показываем все модели
  allModels?.forEach((m, i) => {
    console.log(`${i + 1}. ${m.model_name}`)
    console.log(`   ID: ${m.id}`)
    console.log(`   Status: ${m.status}`)
    console.log(`   API: ${m.api}`)
    console.log(`   Training ID: ${m.replicate_training_id}`)
    console.log(`   Created: ${m.created_at}`)
    console.log()
  })

  // 3. Находим фейковые "fal-test" (у них zip_url = https://fal.media/files/fal-test/model.zip)
  const fakeModels =
    allModels?.filter(
      m =>
        m.model_name === 'fal-test' &&
        m.zip_url === 'https://fal.media/files/fal-test/model.zip'
    ) || []

  console.log(`\n🎯 Найдено фейковых моделей "fal-test": ${fakeModels.length}`)

  if (fakeModels.length > 0) {
    console.log('\n🗑️  Удаляем фейковые модели...')

    for (const fake of fakeModels) {
      console.log(`   Удаляем: ${fake.id} (${fake.model_name})`)
      const { error: deleteError } = await supabase
        .from('model_trainings')
        .delete()
        .eq('id', fake.id)

      if (deleteError) {
        console.error(`   ❌ Ошибка удаления ${fake.id}:`, deleteError)
      } else {
        console.log(`   ✅ Удалено: ${fake.id}`)
      }
    }
  }

  // 4. Проверяем, есть ли НАСТОЯЩАЯ FAL модель
  console.log('\n\n🔍 Поиск настоящей FAL модели...')
  console.log(
    '   Ищем модель с training_id: 2896cb1f-b659-4057-b03d-a3daf5d9a983'
  )

  const realFalModel = allModels?.find(
    m =>
      m.replicate_training_id === '2896cb1f-b659-4057-b03d-a3daf5d9a983' &&
      m.zip_url !== 'https://fal.media/files/fal-test/model.zip' // НЕ фейковая
  )

  if (realFalModel) {
    console.log('\n✅ НАСТОЯЩАЯ FAL модель НАЙДЕНА:')
    console.log(`   ID: ${realFalModel.id}`)
    console.log(`   Name: ${realFalModel.model_name}`)
    console.log(`   ZIP URL: ${realFalModel.zip_url}`)
    console.log(`   Status: ${realFalModel.status}`)
  } else {
    console.log('\n❌ НАСТОЯЩАЯ FAL модель НЕ НАЙДЕНА')
    console.log('\n💡 Добавляем настоящую FAL модель с правильными данными...')

    const realModelData = {
      telegram_id: telegramId,
      model_name: 'fal-flux-portrait',
      trigger_word: 'NEURO_SAGE',
      replicate_training_id: '2896cb1f-b659-4057-b03d-a3daf5d9a983',
      status: 'SUCCESS',
      bot_name: 'neuro_blogger_bot',
      steps: 2500, // Portrait trainer = 2500 steps
      gender: 'male',
      // ✅ ИСПРАВЛЕНИЕ: Используем .safetensors (LoRA weights), а НЕ config.json!
      zip_url:
        'https://v3b.fal.media/files/b/zebra/oxDuX84XjyEBU_5UT85l8_pytorch_lora_weights.safetensors',
      api: 'fal', // ✅ FAL provider
    }

    const { data: newModel, error: insertError } = await supabase
      .from('model_trainings')
      .insert(realModelData)
      .select()
      .single()

    if (insertError) {
      console.error('❌ Ошибка добавления:', insertError)
    } else {
      console.log('✅ Настоящая модель добавлена!')
      console.log(newModel)
    }
  }

  // 5. Показываем финальный список
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 ФИНАЛЬНЫЙ СПИСОК МОДЕЛЕЙ:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const { data: finalModels } = await supabase
    .from('model_trainings')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })

  finalModels?.forEach((m, i) => {
    console.log(`${i + 1}. ${m.model_name}`)
    console.log(`   Status: ${m.status}`)
    console.log(
      `   Created: ${new Date(m.created_at).toLocaleDateString('ru-RU')}`
    )
    console.log()
  })

  console.log(`✅ Всего моделей после очистки: ${finalModels?.length || 0}\n`)
}

cleanupFakeModels()
  .then(() => console.log('\n✅ Готово!\n'))
  .catch(err => console.error('\n❌ Ошибка:', err))
