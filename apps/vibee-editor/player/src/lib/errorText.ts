/**
 * Одна дверь для текста ошибки, который увидит человек.
 *
 * Замерено обходом `src`: в 31 месте пойманная ошибка кладётся в состояние
 * как `error.message`, и это значение рисуется напрямую. Для ошибки сервера
 * так и надо — там осмысленный текст. Но при обрыве связи `fetch` бросает
 * `TypeError` с сообщением, которое пишем не мы: в русском интерфейсе на
 * экране появлялось английское «Failed to fetch» (замерено живьём в ленте).
 *
 * Перевести его нельзя: этот текст даёт браузер, и он ещё и разный в разных
 * движках — «Failed to fetch», «NetworkError…», «Load failed».
 *
 * Поэтому здесь не «перевод ошибок», а РАЗДЕЛЕНИЕ двух случаев:
 *
 *   обрыв связи      -> ключ перевода, вид покажет человеческий текст
 *   ответ сервера    -> его собственное сообщение, оно информативно
 *
 * Ключ разворачивается в компоненте: `{t(error)}`. Это работает для обоих
 * случаев без ветвления, потому что `t()` возвращает свой аргумент, если
 * такого ключа нет, — то есть текст сервера проходит насквозь.
 */

/** Ключи объявлены в atoms/language.ts в обеих локалях. */
export const ERROR_NETWORK = 'feed.errorNetwork'
export const ERROR_GENERIC = 'feed.errorGeneric'

/**
 * Обрыв связи опознаём по типу, а не по тексту.
 *
 * `fetch` бросает `TypeError`, когда запрос не ушёл вовсе — DNS, отсутствие
 * сети, CORS-отказ до ответа. Ошибки 4xx/5xx сюда НЕ попадают: их код
 * бросает сам обычным `Error`.
 *
 * Проверка по тексту оставлена ВТОРЫМ слоем и намеренно: часть движков
 * оборачивает сетевой сбой в свой класс, и тогда instanceof не сработает.
 * Полагаться только на текст было бы той же ошибкой, что ловить «Недостаточно
 * звёзд» сравнением строки, — но как страховка поверх типа он уместен.
 */
export function isOfflineError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof Error) {
    return /failed to fetch|networkerror|load failed|network request failed/i.test(
      error.message
    )
  }
  return false
}

/**
 * Что положить в состояние ошибки.
 *
 * Возвращает либо ключ перевода, либо готовое сообщение сервера — вид
 * разворачивает и то и другое одним `t(...)`.
 *
 * @param fallbackKey ключ на случай, когда брошено вообще не `Error`
 */
export function toErrorText(
  error: unknown,
  fallbackKey: string = ERROR_GENERIC
): string {
  if (isOfflineError(error)) return ERROR_NETWORK
  if (error instanceof Error && error.message) return error.message
  return fallbackKey
}
