import { Inngest } from 'inngest'
import { INNGEST_EVENT_KEY } from '@/config'
// Добавляем лог для проверки инициализации
console.log('🔄 Initializing Inngest client...')
console.log('🔑 INNGEST_EVENT_KEY available:', !!INNGEST_EVENT_KEY)

if (INNGEST_EVENT_KEY) {
  console.log(
    '🔑 INNGEST_EVENT_KEY first 10 chars:',
    INNGEST_EVENT_KEY.substring(0, 10) + '...'
  )
}

// Создаем экземпляр Inngest
export const inngest = new Inngest({
  id: 'neuro-blogger',
  eventKey: INNGEST_EVENT_KEY,
})

// Проверка экспорта
console.log('✅ Inngest client created:', !!inngest)

export const functions = []
