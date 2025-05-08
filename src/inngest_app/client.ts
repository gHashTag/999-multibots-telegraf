import { Inngest } from 'inngest'

// Создаем клиент Inngest
// Используем осмысленное id, например, имя проекта или приложения
export const inngest = new Inngest({
  id: '999-multibots-telegraf',
  eventKey: process.env.INNGEST_EVENT_KEY,
})

// Наша первая Inngest функция - Hello World
export const helloWorld = inngest.createFunction(
  { id: 'hello-world-function' }, // Уникальный ID для этой функции
  { event: 'test/hello.world' }, // Событие, на которое триггерится функция
  async ({ event, step, logger }) => {
    logger.info('[Inngest:hello-world-function] Function started', {
      eventName: event.name,
    })

    await step.sleep('wait-a-moment', '1s') // Небольшая задержка для имитации работы

    const message = `Hello from Inngest! Event received: ${event.name}. Data: ${JSON.stringify(event.data)}`
    logger.info('[Inngest:hello-world-function] Processing complete', {
      message,
    })

    // Возвращаем результат (опционально, но полезно для отладки)
    return {
      event_name: event.name,
      received_data: event.data,
      processed_message: message,
    }
  }
)

// Экспортируем массив всех функций для использования в serve хендлере
export const functions = [
  helloWorld,
  // Сюда можно будет добавлять другие функции Inngest в будущем
]
