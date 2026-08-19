/**
 * Button mapping utilities
 */

import { MyContext } from '@/interfaces'

/**
 * Проверяет callback_data и, если задан префикс, достаёт из неё идентификатор.
 *
 * Раньше функция принимала один аргумент и умела только две проверки — пустоту
 * и длину, — с комментарием «добавить правила по мере необходимости». Префикс
 * не проверялся вовсе, то есть middleware (buttonErrorMiddleware.ts:28)
 * пропускал любую строку до 64 символов.
 *
 * Контракт задан тестами, которые не исполнялись: файл не загружался.
 *
 * @param expectedPrefix если задан, данные обязаны быть вида `<префикс>_<id>`,
 *   и `extractedId` вернёт этот id. Без префикса проверяются только пустота и
 *   длина — прежнее поведение, чтобы единственный существующий вызов не
 *   изменился.
 */
export function validateCallbackData(
  data: string,
  expectedPrefix?: string
): { isValid: boolean; error?: string; extractedId?: string } {
  if (!data || typeof data !== 'string') {
    return { isValid: false, error: 'Callback data is empty or not a string' }
  }
  // Telegram ограничивает callback_data 64 БАЙТАМИ, а не символами: кириллица
  // в UTF-8 занимает два байта, поэтому длину меряем в байтах.
  if (Buffer.byteLength(data, 'utf8') > 64) {
    return { isValid: false, error: 'Callback data exceeds 64 bytes' }
  }
  if (expectedPrefix) {
    const head = `${expectedPrefix}_`
    if (!data.startsWith(head)) {
      return {
        isValid: false,
        error: `Callback data has wrong prefix: expected "${head}"`,
      }
    }
    return { isValid: true, extractedId: data.slice(head.length) }
  }
  // Без требования префикса идентификатором считается вся строка: вызывающему
  // нужен один и тот же способ достать значение независимо от того, задан
  // префикс или нет.
  return { isValid: true, extractedId: data }
}

/**
 * Логирует ошибку кнопки и вызывает запасное действие, не давая ему упасть
 * наружу.
 *
 * Раньше вызов был `callback().catch(...)` — это разваливается, если запасное
 * действие СИНХРОННО бросает: исключение летит до `.catch` и уходит наверх, в
 * обработчик кнопки. Оборачиваем в try, а промис доводим через Promise.resolve,
 * чтобы одинаково работали и синхронные, и асинхронные колбэки.
 */
export function handleButtonError(
  ctx: MyContext,
  error: any,
  callback?: () => Promise<void> | void
): void {
  console.error('Button error:', error)
  if (!callback) return
  try {
    Promise.resolve(callback()).catch(console.error)
  } catch (syncError) {
    console.error('Button fallback threw synchronously:', syncError)
  }
}

/**
 * Убирает из пользовательского ввода то, чем можно навредить, и приводит его к
 * предсказуемому виду.
 *
 * Раньше здесь стоял только `input.trim()` — то есть функция с именем
 * «sanitize» не санировала ничего. При этом она вызывается на данных из
 * Telegram: wizardButtonHandlers.ts:58 передаёт сюда
 * `ctx.callbackQuery.data`. Имя обещало защиту, которой не было, и это хуже
 * отсутствия функции: вызывающий считал ввод очищенным.
 *
 * Контракт задан тестами (src/__tests__/utils/buttonMapping.test.ts), которые
 * были написаны раньше реализации и до сих пор не исполнялись — файл не
 * загружался из-за импорта пяти ненаписанных символов.
 *
 * @param maxLength обрезка ПОСЛЕ очистки, поэтому длина результата
 *   предсказуема для вызывающего.
 */
export function sanitizeInput(input: string, maxLength?: number): string {
  // null и undefined приходят реально: callbackQuery.data необязателен.
  if (!input || typeof input !== 'string') return ''

  const cleaned = input
    // Угловые скобки, кавычки и обратный слэш: ими строят разметку и ломают
    // экранирование. Символы удаляются, а не экранируются — callback_data
    // используется как ключ маршрутизации, а не как отображаемый текст.
    .replace(/[<>"'`\\]/g, '')
    // Управляющие символы: невидимы в логах и способны рвать разбор.
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // Любые последовательности пробелов схлопываются в один.
    .replace(/\s+/g, ' ')
    .trim()

  return maxLength && maxLength > 0 ? cleaned.slice(0, maxLength) : cleaned
}