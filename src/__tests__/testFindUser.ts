import { findUserCommand } from '../commands/statsCommand'

// Симулируем контекст Telegram
const mockCtx = {
  from: { id: 144022504 }, // Админский ID
  message: { text: '/find_user Meta' },
  reply: (msg: string, opts?: any) => {
    console.log('=== ОТВЕТ БОТА ===')
    console.log(msg)
    console.log('================')
    return Promise.resolve()
  },
}

async function testFindUser() {
  console.log('🧪 Тестирую команду /find_user Meta...')
  try {
    await findUserCommand(mockCtx as any)
    console.log('✅ Тест завершен успешно!')
  } catch (error) {
    console.error('❌ Ошибка в тесте:', error)
  }
}

testFindUser()
