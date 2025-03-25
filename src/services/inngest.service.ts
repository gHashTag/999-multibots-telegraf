import { Inngest } from 'inngest'
import { INNGEST_EVENT_KEY } from '@/config'

console.log('📚 Initializing Inngest Service')
console.log('🔑 INNGEST_EVENT_KEY available:', !!INNGEST_EVENT_KEY)
if (INNGEST_EVENT_KEY) {
  console.log(
    '🔑 INNGEST_EVENT_KEY first 10 chars:',
    INNGEST_EVENT_KEY.substring(0, 10) + '...'
  )
}

// Создаем экземпляр Inngest
const inngestInstance = new Inngest({
  id: 'neuro-blogger',
  eventKey: INNGEST_EVENT_KEY || '',
})

/**
 * Сервис для работы с Inngest
 */
export class InngestService {
  /**
   * Отправляет тестовое событие Hello World
   * @param data Дополнительные данные для события
   */
  static async sendHelloWorldEvent(data: Record<string, any> = {}) {
    try {
      console.log('🔔 Отправляем тестовое событие в Inngest')

      if (!INNGEST_EVENT_KEY) {
        console.error(
          '❌ INNGEST_EVENT_KEY не установлен. Событие не будет отправлено.'
        )
        throw new Error('INNGEST_EVENT_KEY не установлен')
      }

      console.log(
        '📝 Используем ключ:',
        INNGEST_EVENT_KEY.substring(0, 10) + '...'
      )

      // Проверяем переменные окружения для дополнительной диагностики
      console.log('📊 Данные события:', JSON.stringify(data, null, 2))

      try {
        const result = await inngestInstance.send({
          name: 'test/hello.world',
          data: {
            message: 'Hello from Telegram Bot!',
            timestamp: new Date().toISOString(),
            ...data,
          },
        })

        console.log('✅ Событие успешно отправлено:', result)
        return result
      } catch (sendError) {
        console.error('❌ Ошибка при отправке в Inngest API:', sendError)
        throw new Error(
          `Ошибка Inngest API: ${sendError.message || 'Неизвестная ошибка'}`
        )
      }
    } catch (error) {
      console.error('❌ Общая ошибка при отправке события:', error)
      throw error
    }
  }

  /**
   * Отправляет произвольное событие в Inngest
   * @param eventName Имя события
   * @param data Данные события
   */
  static async sendEvent(eventName: string, data: Record<string, any> = {}) {
    try {
      console.log(`🔔 Отправляем событие "${eventName}" в Inngest`)

      if (!INNGEST_EVENT_KEY) {
        console.error(
          '❌ INNGEST_EVENT_KEY не установлен. Событие не будет отправлено.'
        )
        throw new Error('INNGEST_EVENT_KEY не установлен')
      }

      if (!eventName) {
        console.error('❌ Имя события не указано')
        throw new Error('Имя события не указано')
      }

      console.log(
        '📝 Используем ключ:',
        INNGEST_EVENT_KEY.substring(0, 10) + '...'
      )

      console.log('📊 Данные события:', JSON.stringify(data, null, 2))

      try {
        const result = await inngestInstance.send({
          name: eventName,
          data: {
            timestamp: new Date().toISOString(),
            ...data,
          },
        })

        console.log('✅ Событие успешно отправлено:', result)
        return result
      } catch (sendError) {
        console.error('❌ Ошибка при отправке в Inngest API:', sendError)
        throw new Error(
          `Ошибка Inngest API: ${sendError.message || 'Неизвестная ошибка'}`
        )
      }
    } catch (error) {
      console.error('❌ Общая ошибка при отправке события:', error)
      throw error
    }
  }
}

// Экспортируем экземпляр для использования в других модулях
export const inngest = inngestInstance
