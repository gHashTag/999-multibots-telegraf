import { isDev, API_SERVER_URL, LOCAL_SERVER_URL } from '@/config'

/**
 * Отдельный AI-сервер, которому бот шлёт `/generate/*`.
 *
 * Зачем эта функция вообще нужна. В проде переменная `API_SERVER_URL` НЕ
 * ЗАДАНА, и два живых пути собирали из неё адрес по-разному, оба — мимо:
 *
 *   generateNeuroPhotoMulti   `${API_SERVER_URL}/generate/neuro-photo-multi`
 *                             -> строка "undefined/generate/..."
 *                             -> axios падает с ERR_INVALID_URL за 4 мс
 *
 *   generateNeuroPhotoHybrid  `${API_SERVER_URL_FINAL}/generate/neuro-photo`
 *                             где API_SERVER_URL_FINAL откатывается на
 *                             BASE_WEBHOOK_URL, то есть на САМ БОТ
 *                             -> проверено живым запросом: 404
 *
 * В обоих случаях дальше срабатывает План Б (локальная обработка), поэтому
 * человек результат получает. Плата — гарантированно неудачная попытка на
 * каждый запрос и строка ошибки, которая выглядит как сетевая проблема, хотя
 * сервер просто не настроен. При разборе инцидентов это уводит в сторону.
 *
 * Откат на собственный адрес особенно коварен: он превращает «не настроено» в
 * «настроено неправильно». Запрос уходит, отвечает наш же express, отдаёт 404 —
 * и по логам не отличить от «сервер лежит».
 *
 * @returns базовый адрес AI-сервера или `null`, если его нет. `null` означает
 *   «Плана А не существует», а не «сервер недоступен» — разница важна для
 *   сообщений и для метрик.
 */
export function getAiServerUrl(): string | null {
  const raw = isDev ? LOCAL_SERVER_URL || API_SERVER_URL : API_SERVER_URL

  if (!raw || typeof raw !== 'string') return null

  const url = raw.trim().replace(/\/$/, '')
  if (!url) return null

  // Голое имя переменной, попавшее в строку через шаблон — самый частый способ
  // получить "undefined/generate/...". Проверяем явно, а не полагаемся на то,
  // что axios потом упадёт.
  if (url === 'undefined' || url === 'null') return null

  if (!/^https?:\/\//i.test(url)) return null

  return url
}

/**
 * Настроен ли отдельный AI-сервер.
 *
 * Отдельная функция, чтобы вызывающему не приходилось помнить, что `null`
 * значит «не настроен», и чтобы условие читалось как предложение.
 */
export function isAiServerConfigured(): boolean {
  return getAiServerUrl() !== null
}
