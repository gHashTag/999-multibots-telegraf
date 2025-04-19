import md5 from 'md5'

/**
 * Рассчитывает подпись для параметров Robokassa.
 * @param params - Параметры запроса (например, { OutSum: '100.00', InvId: '123' }). Должны быть строками или числами.
 * @param password - Пароль №1 или №2 Robokassa.
 * @returns Строка с MD5 подписью в верхнем регистре.
 */
export function calculateRobokassaSignature(
  params: Record<string, string | number>,
  password: string
): string {
  // Исключаем параметры, которых не должно быть в подписи (например, сама подпись)
  const paramsForSignature = { ...params }
  delete paramsForSignature.SignatureValue // Удаляем SignatureValue, если он есть
  // Можно добавить другие специфичные для Robokassa исключения, если они нужны

  // Сортируем параметры по имени ключа в алфавитном порядке
  const sortedKeys = Object.keys(paramsForSignature).sort((a, b) =>
    a.localeCompare(b)
  )

  // Формируем строку для хеширования: value1:value2:...:password (Внимание: формат Robokassa для Result URL)
  // Robokassa использует формат OutSum:InvId:Пароль2[:доп.параметры]
  // Уточняем формат согласно документации Robokassa для Result URL:
  // Это OutSum:InvId:Password2[:Shp_]*
  // Где Shp_ параметры сортируются по имени.

  const outSum = paramsForSignature.OutSum || ''
  const invId = paramsForSignature.InvId || ''

  // Собираем пользовательские параметры (Shp_)
  const shpKeys = sortedKeys.filter(key => key.startsWith('shp'))
  const shpPart = shpKeys
    .map(key => `${key}=${paramsForSignature[key]}`)
    .join(':')

  // Формируем строку подписи согласно документации для Result URL
  const signatureString =
    `${outSum}:${invId}:${password}` + (shpPart ? `:${shpPart}` : '')

  return md5(signatureString).toUpperCase()
}
