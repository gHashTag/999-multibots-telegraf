import { userSpendingCommand } from '../commands/statsCommand'

// Симулируем контекст Telegram
const mockCtx = {
  from: { id: 144022504 }, // Админский ID
  message: { text: '/user_spending 352374518' },
  reply: (msg: string, opts?: any) => {
    console.log('=== ОТВЕТ БОТА ===')
    console.log(msg)
    console.log('================')
    return Promise.resolve()
  },
}

async function testUserSpending() {
  console.log('🧪 Тестирую команду /user_spending 352374518...')
  try {
    await userSpendingCommand(mockCtx as any)
    console.log('✅ Тест завершен успешно!')
  } catch (error) {
    console.error('❌ Ошибка в тесте:', error)
  }
}

testUserSpending()
