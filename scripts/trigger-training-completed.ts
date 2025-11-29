/**
 * 🔧 Ручной триггер обработки завершенной тренировки
 * Используется, если webhook от Replicate не пришел
 */

import { initInfisical, getSecret } from '../src/core/infisical'
import { inngest } from '../src/inngest_app/client'
const Replicate = require('replicate')

async function triggerTrainingCompleted() {
  const trainingId = 'bwx6erm255rm80ctsf39cxzgec'

  console.log('🔧 Ручной триггер обработки завершенной тренировки...\n')
  console.log(`📊 Training ID: ${trainingId}\n`)

  try {
    // Инициализируем Infisical
    await initInfisical()
    console.log('✅ Infisical подключен\n')

    // Получаем токен
    const token = getSecret('REPLICATE_API_TOKEN')
    if (!token) {
      throw new Error('REPLICATE_API_TOKEN не найден в Infisical')
    }

    // Создаем клиент Replicate
    const replicate = new Replicate({
      auth: token,
    })

    // Получаем данные тренировки
    console.log('🔍 Получаю данные тренировки у Replicate...\n')
    const training = await replicate.trainings.get(trainingId)

    if (training.status !== 'succeeded' && training.status !== 'failed' && training.status !== 'canceled') {
      console.log(`⚠️  Тренировка еще не завершена. Статус: ${training.status}`)
      return
    }

    console.log('📊 Данные тренировки:')
    console.log('   Status:', training.status)
    console.log('   Model:', training.model)
    console.log('   Output:', training.output ? 'Есть' : 'Нет')
    console.log('   Error:', training.error || 'Нет')

    // Отправляем событие в Inngest
    console.log('\n📤 Отправляю событие в Inngest...')
    await inngest.send({
      name: 'model/training.completed',
      data: {
        training_id: training.id,
        status: training.status as 'succeeded' | 'failed' | 'canceled',
        model: training.model,
        version: training.output?.version,
        output: training.output,
        error: training.error,
      },
    })

    console.log('✅ Событие отправлено в Inngest!')
    console.log('💡 Inngest функция обработает событие и обновит БД + уведомит пользователя')

  } catch (error) {
    console.error('❌ Ошибка:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

triggerTrainingCompleted()
  .then(() => {
    console.log('\n✅ Готово!')
    process.exit(0)
  })
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })

