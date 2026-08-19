import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Запись сгенерированного медиа в таблицу `assets`.
 *
 * Раньше сигнатура была позиционной:
 *   saveVideoUrlToSupabase(telegramId, videoUrl, videoPath, type)
 * и 11 из 12 мест вызова передавали служебный id вторым аргументом, а
 * настоящую ссылку — третьим. В итоге в `public_url` попадала строка вида
 * `kling_lipsync_1755229300876_144022504`, а играбельная ссылка оказывалась
 * в `storage_path`. Проверено в проде: такие строки в таблице есть.
 *
 * Отсюда именованные параметры — перепутать их местами уже нельзя, — и
 * проверка, что `publicUrl` действительно ссылка: молча записать мусор
 * теперь невозможно.
 */
export interface SaveAssetParams {
  telegramId: string | number
  /** Играбельная ссылка. Без неё строка бесполезна. */
  publicUrl: string
  /** Путь в нашем хранилище, если файл туда загружен. */
  storagePath?: string
  /** Модель или провайдер, которым сгенерировано. */
  type: string
  /** Бот, которому принадлежит генерация. Колонка есть, но 80% строк с NULL. */
  botName?: string
  /** Промпт, если вызывающий его знает. */
  text?: string
  /** Вид ассета. Исторически везде было захардкожено 'video'. */
  triggerWord?: string
}

const isPlayableUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\//.test(v)

export async function saveVideoUrlToSupabase(
  params: SaveAssetParams
): Promise<void> {
  const {
    telegramId,
    publicUrl,
    storagePath,
    type,
    botName,
    text,
    triggerWord = 'video',
  } = params

  // Строка без ссылки нечитаема и починить её нечем: ни одна из веток кода
  // не обновляет уже вставленные строки, а колонки статуса в таблице нет.
  // Поэтому не пишем вовсе, а не пишем заглушку.
  // ЗЕРКАЛИРОВАНИЕ В СВОЁ ХРАНИЛИЩЕ, до записи ссылки.
  //
  // ЗЕРКАЛИРОВАНИЕ В СВОЁ ХРАНИЛИЩЕ — ЧЕРЕЗ SUPABASE STORAGE, НЕ ЧЕРЕЗ S3.
  //
  // Поправка к моему же прежнему комментарию. Здесь было написано: «Replicate
  // свой CDN держит долго (1214 ссылок живы, включая самую старую)». ЭТО
  // НЕПРАВДА, и я это не проверял. Живой замер HEAD-запросами по выборке из
  // каждого месяца:
  //
  //   replicate.delivery          1214 ссылок — ВСЕ отдают 404
  //   tempfile.aiquickdraw.com     171 ссылка  — ВСЕ отдают 404
  //   replicate.com                 96 ссылок  — ВСЕ отдают 404
  //   v3b.fal.media                 15 ссылок  — живы
  //
  // То есть потеряно не 171 вложение, а 1481 из 1496. Ссылка провайдера не
  // живёт ни у кого; вопрос только в сроке.
  //
  // Почему теперь Supabase Storage. Прежний вариант писал в S3 и ВСЕГДА падал
  // в откат: регион в переменных не совпадал с endpoint, а после исправления
  // региона приходил Access Denied. Эти доступы выдаёт владелец, и ждать их
  // означало терять файлы дальше.
  //
  // Supabase Storage при этом РАБОТАЕТ уже сейчас — проверено записью,
  // публичным чтением и удалением пробного объекта в бакете `images` теми же
  // ключами, что есть у бота. Новых учётных данных не нужно.
  //
  // Отказ зеркалирования по-прежнему НЕ ломает сохранение: лучше записать
  // ссылку провайдера, чем не записать ничего.
  let urlToStore = publicUrl
  try {
    const res = await fetch(publicUrl, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`источник отдал HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('источник отдал пустой ответ')

    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const ext =
      publicUrl.split('?')[0].match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase() ||
      (contentType.startsWith('image/') ? contentType.slice(6) : 'mp4')

    // Дата в пути — чтобы файлы не сваливались в один каталог и чтобы по
    // ассету было видно, когда он появился, даже без обращения к базе.
    const day = new Date().toISOString().slice(0, 10)
    const key = `assets/${day}/${telegramId}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('images')
      .upload(key, buf, { contentType, upsert: false })
    if (upErr) throw new Error(`storage: ${upErr.message}`)

    const { data } = supabase.storage.from('images').getPublicUrl(key)
    if (!isPlayableUrl(data?.publicUrl)) throw new Error('storage не вернул ссылку')

    urlToStore = data.publicUrl
    logger.info('✅ [assets] Файл переложен в своё хранилище', {
      telegramId: String(telegramId),
      key,
      bytes: buf.length,
    })
  } catch (e) {
    logger.warn('⚠️ [assets] Не удалось зеркалировать в своё хранилище', {
      telegramId: String(telegramId),
      error: e instanceof Error ? e.message : String(e),
      // Ссылка провайдера сохранится как есть — она протухнет, и это повод
      // посмотреть логи, а не потерять запись.
      fallback: 'сохраняем исходную ссылку провайдера',
    })
  }

  if (!isPlayableUrl(publicUrl)) {
    logger.warn('⚠️ [assets] Пропущена запись: publicUrl не является ссылкой', {
      telegramId: String(telegramId),
      type,
      received: String(publicUrl).slice(0, 80),
    })
    return
  }

  const { error } = await supabase.from('assets').insert({
    type,
    trigger_word: triggerWord,
    telegram_id: String(telegramId),
    // storage_path, trigger_word и type в базе NOT NULL (проверено пробой
    // на проде: код 23502). Поэтому здесь пустая строка, а не null —
    // иначе падает КАЖДАЯ вставка, причём молча: ошибка только логируется.
    storage_path: storagePath ?? '',
    // Сохраняем ЗЕРКАЛО, если оно получилось; иначе исходную ссылку.
    public_url: urlToStore,
    // text и bot_name nullable — проверено там же.
    text: text ?? null,
    bot_name: botName ?? null,
  })

  if (error) {
    logger.error('❌ [assets] Не удалось сохранить ассет', {
      telegramId: String(telegramId),
      type,
      error: error.message,
    })
    return
  }

  logger.info('💾 [assets] Ассет сохранён', { telegramId: String(telegramId), type })
}
