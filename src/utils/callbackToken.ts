import crypto from 'crypto'
import { SECRET_API_KEY } from '@/config'

/**
 * Метка, которой мы подписываем СОБСТВЕННЫЙ адрес обратного вызова.
 *
 * ЗАЧЕМ. Обработчик `/api/video-callback/:telegramId` в режиме прямой отправки
 * берёт номер получателя ИЗ АДРЕСА, ссылку на видео ИЗ ТЕЛА и отправляет
 * человеку — не сверяясь ни с какой задачей. Проверено живым запросом: POST с
 * пустым телом принимается (202), подписи не проверяется никакой.
 *
 * То есть посторонний мог заставить бота прислать любому пользователю любое
 * видео и текст — от имени бота, которому человек доверяет.
 *
 * Подписи от поставщика у нас нет и может не быть. Но адрес обратного вызова
 * СОСТАВЛЯЕМ МЫ САМИ — значит, можем положить в него метку и проверить её на
 * входе.
 *
 * Метка привязана к номеру получателя: подсмотрев чужую, нельзя отправить
 * что-то другому человеку.
 */
export function buildCallbackToken(telegramId: string | number): string | null {
  if (!SECRET_API_KEY) return null
  return crypto
    .createHmac('sha256', SECRET_API_KEY)
    .update(`video-callback:${telegramId}`)
    .digest('hex')
    .slice(0, 16)
}

/**
 * Совпадает ли метка. Сравнение постоянного времени — чтобы по скорости
 * ответа нельзя было подбирать посимвольно.
 */
export function verifyCallbackToken(
  telegramId: string | number,
  provided: unknown
): boolean {
  const expected = buildCallbackToken(telegramId)
  if (!expected) return false
  if (typeof provided !== 'string' || provided.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}
