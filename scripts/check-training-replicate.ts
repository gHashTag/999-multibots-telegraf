/**
 * 🔍 Проверка статуса тренировки на Replicate
 */

import { initInfisical, getSecret } from '../src/core/infisical'
const Replicate = require('replicate')

async function checkTrainingStatus() {
  const trainingId = 'bwx6erm255rm80ctsf39cxzgec'

  console.log('🔍 Проверка статуса тренировки на Replicate...\n')
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

    // Получаем статус тренировки
    console.log('🔍 Запрашиваю статус у Replicate...\n')
    const training = await replicate.trainings.get(trainingId)

    // Выводим информацию
    console.log('📊 Replicate Training Status:')
    console.log('   ID:', training.id)
    console.log('   Status:', training.status)
    console.log('   Model:', training.model)
    console.log('   Created:', training.created_at)
    console.log('   Started:', training.started_at || 'N/A')
    console.log('   Completed:', training.completed_at || 'N/A')

    if (training.error) {
      console.log('   ❌ Error:', training.error)
    }

    if (training.output) {
      console.log('   ✅ Output version:', training.output.version || 'N/A')
      console.log('   ✅ Output weights:', training.output.weights || 'N/A')
    }

    // Проверяем время
    const created = new Date(training.created_at)
    const now = new Date()
    const elapsed = Math.floor((now.getTime() - created.getTime()) / 1000 / 60) // минуты
    console.log(
      `   ⏱️  Elapsed: ${elapsed} minutes (~${(elapsed / 60).toFixed(1)} hours)`
    )

    // Интерпретация статуса
    console.log('\n📋 Интерпретация:')
    if (training.status === 'succeeded') {
      console.log('   ✅ Тренировка ЗАВЕРШЕНА успешно!')
      console.log('   💡 Модель готова к использованию')
    } else if (training.status === 'failed') {
      console.log('   ❌ Тренировка ПРОВАЛИЛАСЬ')
      if (training.error) {
        console.log(`   ⚠️  Причина: ${training.error}`)
      }
    } else if (training.status === 'canceled') {
      console.log('   ⚠️  Тренировка ОТМЕНЕНА')
    } else {
      console.log('   ⏳ Тренировка В ПРОЦЕССЕ')
      console.log('   💡 Обычно занимает 1-2 часа')
    }

    console.log('\n🔗 Прямая ссылка:')
    console.log(`   https://replicate.com/trainings/${trainingId}`)
  } catch (error) {
    console.error('❌ Ошибка:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

checkTrainingStatus()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(1)
  })

