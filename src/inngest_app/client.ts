/**
 * Inngest Client - заглушка для ботов
 *
 * Этот файл создан для совместимости с api_server
 * Боты НЕ используют inngest функции
 */

// Заглушка для inngest клиента
export const inngest = {
  createFunction: () => ({}),
  run: () => Promise.resolve({}),
  send: () => Promise.resolve({}),
  serve: () => (req: any, res: any) => res.send('OK'),
}
