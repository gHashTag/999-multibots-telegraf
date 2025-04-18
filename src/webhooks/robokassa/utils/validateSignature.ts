import { calculateRobokassaSignature } from './calculateSignature'

/**
 * Проверяет валидность подписи в запросе от Robokassa.
 * @param receivedParams - Параметры, полученные от Robokassa (req.body или req.query).
 * @param password - Пароль №2 Robokassa.
 * @returns true, если подпись верна, иначе false.
 */
export function validateRobokassaSignature(
  receivedParams: Record<string, string | number>,
  password: string
): boolean {
  // Убедимся, что SignatureValue - это строка
  const receivedSignatureValue = receivedParams.SignatureValue
  if (typeof receivedSignatureValue !== 'string') {
    console.error(
      '[Validate Signature] Received SignatureValue is not a string:',
      receivedSignatureValue
    )
    return false // Если подписи нет или она не строка - она невалидна
  }
  const receivedSignature = receivedSignatureValue.toUpperCase()

  // Копируем параметры, чтобы не изменять оригинал
  const paramsToCheck = { ...receivedParams }
  // Удаляем саму подпись из параметров для расчета
  delete paramsToCheck.SignatureValue

  // Рассчитываем ожидаемую подпись
  const expectedSignature = calculateRobokassaSignature(paramsToCheck, password)

  return expectedSignature === receivedSignature
}
