import { generateNeuroPhotoHybrid } from './src/services/generateNeuroPhotoHybrid'
import { ModeEnum } from './src/interfaces/modes'

// Мок контекста для тестирования
const mockContext = {
  session: {
    prompt: 'Test prompt for hybrid function',
    userModel: {
      model_url: 'test/model:123',
      trigger_word: 'test_trigger',
      finetune_id: 'test_finetune',
    },
  },
  from: {
    id: 144022504,
    username: 'test_user',
  },
  chat: {
    id: 144022504,
  },
  telegram: {
    sendChatAction: async () => {},
    sendMessage: async () => {},
  },
  reply: async (text: string) => {
    console.log('📱 Reply:', text)
  },
  botInfo: {
    username: 'test_bot',
  },
} as any

async function testHybridFunction() {
  console.log('🧪 ТЕСТИРОВАНИЕ ГИБРИДНОЙ ФУНКЦИИ generateNeuroPhotoHybrid')
  console.log('='.repeat(60))

  try {
    console.log('📝 Параметры теста:')
    console.log('- Промпт: "Test prompt for hybrid function"')
    console.log('- Модель: test/model:123')
    console.log('- Количество изображений: 1')
    console.log('- Telegram ID: 144022504')
    console.log('')

    console.log('🚀 Запуск гибридной функции...')

    const result = await generateNeuroPhotoHybrid(
      'Test prompt for hybrid function',
      'test/model:123' as any,
      1,
      '144022504',
      mockContext,
      'test_bot'
    )

    console.log('')
    console.log('✅ Результат:', result)

    if (result) {
      console.log('🎉 Гибридная функция работает!')
      console.log('📊 Данные:', result.data)
      console.log('✅ Успех:', result.success)
      if (result.urls) {
        console.log('🖼️ URLs:', result.urls)
      }
    } else {
      console.log('❌ Функция вернула null')
    }
  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error)

    if (error instanceof Error) {
      console.error('📝 Сообщение:', error.message)
      console.error('📚 Стек:', error.stack)
    }
  }
}

// Запуск теста
testHybridFunction()
  .then(() => {
    console.log('')
    console.log('🏁 Тестирование завершено')
    process.exit(0)
  })
  .catch(error => {
    console.error('💥 Критическая ошибка:', error)
    process.exit(1)
  })
