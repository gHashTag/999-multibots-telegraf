import { Inngest } from 'inngest'

// Экспортируем все функции для использования в index.ts
export const functions: any[] = []

// Создаем клиент Inngest
// @ts-ignore - Игнорируем несоответствие типов для совместимости между разными версиями Inngest
export const inngest = new Inngest({
  // В разных версиях Inngest используются разные свойства (name/id)
  // @ts-ignore - Совместимость между версиями
  name: '999-multibots-telegraf',
  // @ts-ignore - Совместимость между версиями
  id: '999-multibots-telegraf',
  eventKey: process.env.INNGEST_EVENT_KEY,
})

// Наша первая Inngest функция - Hello World
// @ts-ignore - Игнорируем несоответствие типов для совместимости между разными версиями Inngest
export const helloWorld = inngest.createFunction(
  // В разных версиях Inngest используются разные свойства (name/id)
  // @ts-ignore - Совместимость между версиями
  {
    name: 'hello-world-function',
    id: 'hello-world-function',
  },
  { event: 'test/hello.world' }, // Событие, на которое триггерится функция
  async ({ event, step, logger }) => {
    logger.info('[Inngest:hello-world-function] Function started', {
      eventName: event.name,
    })

    // В версии 2.x используем просто строку в качестве параметра для step.sleep
    await step.sleep('1s')

    const message = `Hello from Inngest! Event received: ${event.name}. Data: ${JSON.stringify(event.data)}`
    logger.info('[Inngest:hello-world-function] Processing complete', {
      message,
    })

    return {
      message,
      receivedAt: new Date().toISOString(),
    }
  }
)

// Добавляем функцию в экспортируемый массив
functions.push(helloWorld)
