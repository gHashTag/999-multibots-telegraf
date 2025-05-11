import { Inngest } from 'inngest'

// Экспортируем все функции для использования в index.ts
export const functions: any[] = []

// Создаем клиент Inngest
export const inngest = new Inngest({
  name: '999-multibots-telegraf',
  id: '999-multibots-telegraf',
  eventKey: process.env.INNGEST_EVENT_KEY,
})

// ТЕСТОВЫЙ ВЫЗОВ ДЛЯ ДИАГНОСТИКИ ТИПА
async function testInngestSend() {
  console.log('Тестируем inngest.send в client.ts');
  const testPayload = { test: 'data' };
  const result = await inngest.send({ 
    name: 'test/diagnostic.event', 
    data: testPayload 
  });
  console.log('Результат тестового вызова в client.ts:', result);
  // Если TypeScript здесь выведет для result тип void, то проблема глобальна для этого инстанса.
  // Если тип будет корректным (например, SendEventsResponse или { ids: string[] }), 
  // то проблема возникает при передаче/использовании инстанса в других модулях.
}
// testInngestSend(); // Не будем вызывать его при запуске, только для проверки типов

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
