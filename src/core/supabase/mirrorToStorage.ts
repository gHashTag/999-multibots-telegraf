import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Перекладывает файл по чужой ссылке в собственное хранилище и возвращает
 * СВОЮ ссылку. При любой неудаче возвращает исходную — терять запись хуже,
 * чем хранить ссылку, которая протухнет.
 *
 * ЗАЧЕМ ЭТО ЕСТЬ. Мы годами сохраняли адрес у провайдера вместо файла. Живой
 * замер по всей базе:
 *
 *   чужих ссылок  29 813
 *   своих          1 418
 *
 * Из проверенных выборками: `replicate.delivery`, `replicate.com`,
 * `tempfile.aiquickdraw.com`, `api.telegram.org`, `via.placeholder.com`,  telegram-api-root-ok
 * бывшие адреса нашего же ai-server и dev-туннели ngrok — ВСЁ отдаёт 404.
 * Живы только fal, страницы instagram.com и наши собственные ссылки.
 *
 * Самая крупная течь — `prompts_history.media_url`: 26 791 чужая ссылка.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ. Первую версию зеркалирования я написал внутри
 * saveVideoUrlToSupabase, и она не закрыла вторую дверь — прямую вставку в
 * `assets` из videoGenerator. Копия логики разъезжается молча. Поэтому теперь
 * одно место, и все, кому нужно зеркало, зовут его.
 *
 * ПОЧЕМУ SUPABASE STORAGE, А НЕ S3. Прежний код писал в S3 и всегда падал:
 * регион не совпадал с endpoint, а после исправления приходил Access Denied.
 * Supabase Storage работает теми же ключами, что уже есть у бота — проверено
 * сквозным прогоном: скачано 3 302 608 байт, загружено, прочитано обратно,
 * длина совпала.
 *
 * @param sourceUrl ссылка провайдера
 * @param telegramId владелец — попадает в путь, чтобы файлы были разложены
 * @param folder корневая папка внутри бакета
 * @returns своя ссылка либо исходная, если переложить не удалось
 */
export async function mirrorToOwnStorage(
  sourceUrl: string,
  telegramId: string | number,
  folder = 'assets'
): Promise<string> {
  if (typeof sourceUrl !== 'string' || !/^https?:\/\//.test(sourceUrl)) {
    return sourceUrl
  }

  // Уже своё — второй раз перекладывать незачем.
  try {
    const ourHost = new URL(process.env.SUPABASE_URL || '').host
    if (ourHost && new URL(sourceUrl).host === ourHost) return sourceUrl
  } catch {
    /* пусто: если SUPABASE_URL кривой, просто попробуем переложить */
  }

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`источник отдал HTTP ${res.status}`)

    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('источник отдал пустой ответ')

    const contentType =
      res.headers.get('content-type') || 'application/octet-stream'
    const ext =
      sourceUrl
        .split('?')[0]
        .match(/\.([a-z0-9]{2,4})$/i)?.[1]
        ?.toLowerCase() ||
      (contentType.startsWith('image/')
        ? contentType.slice(6).split(';')[0]
        : contentType.startsWith('video/')
          ? contentType.slice(6).split(';')[0]
          : 'bin')

    // Дата в пути: файлы не сваливаются в один каталог, и по объекту видно
    // время появления даже без обращения к базе.
    const day = new Date().toISOString().slice(0, 10)
    const key = `${folder}/${day}/${telegramId}/${Date.now()}-${Math.floor(buf.length % 100000)}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('images')
      .upload(key, buf, { contentType, upsert: false })
    if (upErr) throw new Error(`storage: ${upErr.message}`)

    const { data } = supabase.storage.from('images').getPublicUrl(key)
    if (!data?.publicUrl || !/^https?:\/\//.test(data.publicUrl)) {
      throw new Error('storage не вернул ссылку')
    }

    logger.info('✅ [mirror] Файл переложен в своё хранилище', {
      telegramId: String(telegramId),
      key,
      bytes: buf.length,
    })
    return data.publicUrl
  } catch (e) {
    logger.warn(
      '⚠️ [mirror] Не удалось переложить файл — сохраняем чужую ссылку',
      {
        telegramId: String(telegramId),
        source: sourceUrl.slice(0, 80),
        error: e instanceof Error ? e.message : String(e),
      }
    )
    return sourceUrl
  }
}
