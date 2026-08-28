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
  // The one /api/video-callback/:telegramId builder that signed nothing. The
  // handler now refuses a direct send without the signature, so this URL must
  // carry it — otherwise nano-banana delivery breaks.
  'src/services/generateNanoBananaKie.ts': 'nano-banana callback address',
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
  it('the :telegramId handler checks the signature before the provider switch', () => {
    // The old check's weak spot: it only asked whether verifyCallbackToken
    // appeared SOMEWHERE in the file. It appears once, inside
    // processGenericVideoWebhook, while the kie-sora / kie-wan / kie-veed
    // branches walked past it. A forged callback with a made-up taskId missed
    // videoTaskStore and fell into those branches' direct send, delivering
    // someone else's video to another user.
    //
    // The real invariant: the signature is checked BEFORE the provider switch,
    // so every branch passes through it. Slice out the :telegramId handler
    // block and compare verifyCallbackToken's position to switch (detectedProvider).
    const file = 'src/api_server/routes/kie-ai-webhook.routes.ts'
    const full = strip(fs.readFileSync(file, 'utf8'))
    const start = full.indexOf("router.post('/video-callback/:telegramId'")
    expect(start, ':telegramId handler not found').toBeGreaterThan(-1)
    const after = full.indexOf('router.post(', start + 1)
    const block = after === -1 ? full.slice(start) : full.slice(start, after)

    const check = block.indexOf('verifyCallbackToken')
    const branch = block.indexOf('switch (detectedProvider)')
    expect(check, ':telegramId handler has no signature check').toBeGreaterThan(
      -1
    )
    expect(branch, 'provider switch not found').toBeGreaterThan(-1)
    expect(
      check < branch,
      'signature checked AFTER the switch — some branches skip it'
    ).toBe(true)
  })

  it('no :telegramId branch sends to the raw telegramId from the URL', () => {
    // After the signature check the direct send uses the verified value
    // (trustedTelegramId), not the raw telegramIdFromUrl from the URL.
    const file = 'src/api_server/routes/kie-ai-webhook.routes.ts'
    const full = strip(fs.readFileSync(file, 'utf8'))
    const start = full.indexOf("router.post('/video-callback/:telegramId'")
    const after = full.indexOf('router.post(', start + 1)
    const block = after === -1 ? full.slice(start) : full.slice(start, after)
    // Direct processor calls with the raw telegramIdFromUrl are forbidden here.
    const raw =
      /process(?:Sora|KieAi)WebhookAsync\([^)]*\btelegramIdFromUrl\b/.test(
        block
      )
    expect(
      raw,
      'a branch passes the raw telegramIdFromUrl to direct send'
    ).toBe(false)
  })
})
