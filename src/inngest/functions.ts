import { inngest } from '@/services/inngest.service'

// Пример функции, которая реагирует на событие "test/hello.world"
export const helloWorldFunction = inngest.createFunction(
  { id: 'hello-world-handler' },
  { event: 'test/hello.world' },
  async ({ event, step }) => {
    console.log('🎉 Получено событие hello.world:', event)
    await step.sleep('подождем-секунду', '1s')

    return {
      success: true,
      message: `Привет! Обработано событие с данными: ${JSON.stringify(
        event.data
      )}`,
      processed_at: new Date().toISOString(),
    }
  }
)

// Экспортируем все функции для обработки
export const functions = [
  helloWorldFunction,
  // добавьте сюда другие функции
]
