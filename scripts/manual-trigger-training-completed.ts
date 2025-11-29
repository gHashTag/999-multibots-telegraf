/**
 * 🔧 Ручной триггер события model/training.completed
 * Используется когда webhook от Replicate не пришел
 */

import { initInfisical, getSecret } from '../src/core/infisical'
import { inngest } from '../src/inngest_app/client'
const Replicate = require('replicate')

async function manualTrigger() {
  const trainingId = '0fnxym977srmc0ctsfwv0m9g2w'

  console.log('🔧 Ручной триггер события model/training.completed\n')
  console.log(`📊 Training ID: ${trainingId}\n`)

  try {
    await initInfisical()
    console.log('✅ Infisical подключен\n')

    const token = getSecret('REPLICATE_API_TOKEN')
    if (!token) {
      throw new Error('REPLICATE_API_TOKEN не найден в Infisical')
    }

    const replicate = new Replicate({
      auth: token,
    })

    console.log('🔍 Запрашиваю данные тренировки у Replicate...\n')
    const training = await replicate.trainings.get(trainingId)

    console.log('📊 Training Data:')
    console.log('   ID:', training.id)
    console.log('   Status:', training.status)
    console.log('   Model:', training.model)
    console.log('   Version:', training.version)
    if (training.output) {
      console.log('   Output version:', training.output.version)
      console.log('   Output weights:', training.output.weights)
    }
    if (training.error) {
      console.log('   Error:', training.error)
    }

    // Получаем telegram_id и bot_name из БД
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      getSecret('SUPABASE_URL'),
      getSecret('SUPABASE_SERVICE_ROLE_KEY')
    )

    const { data: trainingRecord } = await supabase
      .from('model_trainings')
      .select('telegram_id, bot_name, model_name, trigger_word')
      .eq('replicate_training_id', trainingId)
      .single()

    if (!trainingRecord) {
      console.log(
        '\n⚠️ Запись в БД не найдена, используем только данные из Replicate'
      )
    } else {
      console.log('\n✅ Запись в БД найдена:')
      console.log('   Telegram ID:', trainingRecord.telegram_id)
      console.log('   Bot Name:', trainingRecord.bot_name)
      console.log('   Model Name:', trainingRecord.model_name)
      console.log('   Trigger Word:', trainingRecord.trigger_word)
    }

    // Формируем событие для Inngest
    const eventData = {
      training_id: training.id,
      status: training.status as 'succeeded' | 'failed' | 'canceled',
      model: training.model,
      version: training.version,
      output: training.output,
      error: training.error,
      telegram_id: trainingRecord?.telegram_id,
      bot_name: trainingRecord?.bot_name,
    }

    console.log('\n📤 Отправляю событие в Inngest...')
    console.log('   Event:', JSON.stringify(eventData, null, 2))

    await inngest.send({
      name: 'model/training.completed',
      data: eventData,
    })

    console.log('\n✅ Событие отправлено в Inngest!')
    console.log(
      '💡 Inngest функция обработает событие и отправит уведомление пользователю'
    )
  } catch (error) {
    console.error(
      '\n❌ Ошибка:',
      error instanceof Error ? error.message : String(error)
    )
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack)
    }
    process.exit(1)
  }
}

manualTrigger()
  .then(() => {
    console.log('\n✅ Готово!')
    process.exit(0)
  })
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
