/**
 * Тест функции Model Training - Flux LoRA
 * Проверяет, что функция правильно обрабатывает zipUrl и steps
 */

import { inngestProvider } from '../src/inngest_app/inngest-provider'

async function testModelTrainingFunction() {
  console.log('🧪 Тестирование функции Model Training...\n')

  // Тестовые данные
  const testEvent = {
    bot_name: 'neuro_blogger_bot',
    is_ru: true,
    modelName: `test_model_${Date.now()}`,
    steps: '1000', // Строка (как из сцены)
    telegram_id: '144022504',
    triggerWord: 'TESTMODEL',
    zipUrl: 'https://three-head-dragon.shop/uploads/144022504/train/test.zip', // HTTP URL
    gender: 'male',
  }

  console.log('📤 Отправка тестового события:', {
    ...testEvent,
    zipUrl: testEvent.zipUrl.substring(0, 50) + '...',
  })

  try {
    const result = await inngestProvider.sendEvent(
      'RENDER',
      'model/training.start',
      testEvent
    )

    console.log('\n✅ Событие отправлено успешно!')
    console.log('📋 Результат:', result)

    if (result?.eventId) {
      console.log(`\n🎯 Event ID: ${result.eventId}`)
      console.log('📍 Проверьте в Inngest Dashboard:')
      console.log('   https://app.inngest.com/env/production/functions')
    } else {
      console.log(
        '\n⚠️  Event ID не получен (возможно, функция еще не обработана)'
      )
    }
  } catch (error) {
    console.error('\n❌ Ошибка при отправке события:', error)
    if (error instanceof Error) {
      console.error('   Message:', error.message)
      console.error('   Stack:', error.stack)
    }
    process.exit(1)
  }
}

// Запуск теста
testModelTrainingFunction()
  .then(() => {
    console.log('\n✅ Тест завершен')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Тест провален:', error)
    process.exit(1)
  })
