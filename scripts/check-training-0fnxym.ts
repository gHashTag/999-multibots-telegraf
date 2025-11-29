/**
 * 🔍 Проверка статуса тренировки 0fnxym977srmc0ctsfwv0m9g2w
 */

import { initInfisical, getSecret } from '../src/core/infisical'
const Replicate = require('replicate')

async function checkTrainingStatus() {
  const trainingId = '0fnxym977srmc0ctsfwv0m9g2w'

  console.log('🔍 Проверка статуса тренировки на Replicate...\n')
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

    console.log('🔍 Запрашиваю статус у Replicate...\n')
    const training = await replicate.trainings.get(trainingId)

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

    const created = new Date(training.created_at)
    const now = new Date()
    const elapsed = Math.floor((now.getTime() - created.getTime()) / 1000 / 60)
    console.log(
      `   ⏱️  Elapsed: ${elapsed} minutes (~${(elapsed / 60).toFixed(1)} hours)`
    )

    console.log('\n📋 Интерпретация:')
    if (training.status === 'succeeded') {
      console.log('   ✅ Тренировка ЗАВЕРШЕНА успешно!')
      console.log('   💡 Модель готова к использованию')
      console.log('\n🔍 Проверяю, пришел ли webhook...')
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

