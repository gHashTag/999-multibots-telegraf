/**
 * Все обратные вызовы, отправляющие человеку контент, закрыты меткой.
 *
 * Класс дефекта: обработчик берёт получателя из запроса, ссылку на медиа
 * оттуда же и шлёт человеку от имени бота — не сверяясь ни с какой задачей.
 * Подписи от поставщиков нет и может не быть.
 *
 * Найдено и закрыто:
 *   /api/video-callback/:telegramId    PR #527
 *   /api/telegram/ai-reels-callback    эта итерация
 *
 * Тест статический: он следит, что у каждого такого обработчика есть проверка
 * метки, а у соответствующего построителя адреса — сама метка. Поднимать
 * сервер незачем, нужен факт «проверка на месте».
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Обработчики, которые отправляют контент человеку по данным из запроса.
 * Значение — почему проверка обязательна.
 */
const MUST_VERIFY: Record<string, string> = {
  'src/api_server/routes/ai-reels-callback.routes.ts':
    'берёт получателя из metadata.telegram_id и ссылку из тела, шлёт видео',
  'src/api_server/routes/kie-ai-webhook.routes.ts':
    'режим прямой отправки: получатель из адреса, ссылка из тела',
}

/** Места, где мы строим адрес обратного вызова и обязаны класть метку. */
const MUST_SIGN: Record<string, string> = {
  'src/inngest_app/render-server-client.ts': 'адрес обратного вызова рендера',
  'src/utils/webhookHealthCheck.ts': 'адрес обратного вызова видео',
}

describe('обратные вызовы закрыты меткой', () => {
  it('каждый опасный обработчик проверяет метку', () => {
    const missing: string[] = []
    for (const [file, why] of Object.entries(MUST_VERIFY)) {
      if (!fs.existsSync(file)) {
        missing.push(`${file}: файла нет`)
        continue
      }
      const src = strip(fs.readFileSync(file, 'utf8'))
      if (!/verifyCallbackToken\s*\(/.test(src))
        missing.push(`${file} — ${why}`)
    }
    expect(missing).toEqual([])
  })

  it('каждый построитель адреса кладёт метку', () => {
    const missing: string[] = []
    for (const [file, why] of Object.entries(MUST_SIGN)) {
      if (!fs.existsSync(file)) {
        missing.push(`${file}: файла нет`)
        continue
      }
      const src = strip(fs.readFileSync(file, 'utf8'))
      if (!/buildCallbackToken\s*\(/.test(src)) missing.push(`${file} — ${why}`)
    }
    expect(missing).toEqual([])
  })

  it('проверка стоит ДО отправки, а не после', () => {
    // Проверка, выполненная после sendVideo, бесполезна. Смотрим порядок:
    // первое упоминание verifyCallbackToken должно быть раньше первой
    // отправки медиа в том же файле.
    const wrong: string[] = []
    for (const file of Object.keys(MUST_VERIFY)) {
      if (!fs.existsSync(file)) continue
      const src = strip(fs.readFileSync(file, 'utf8'))
      const check = src.indexOf('verifyCallbackToken')
      const send = Math.min(
        ...['sendVideo(', 'sendPhoto(', 'sendDocument(']
          .map(x => src.indexOf(x))
          .filter(i => i >= 0)
          .concat([Number.MAX_SAFE_INTEGER])
      )
      if (check >= 0 && send !== Number.MAX_SAFE_INTEGER && check > send) {
        wrong.push(`${file}: проверка после отправки`)
      }
    }
    expect(wrong).toEqual([])
  })
})
