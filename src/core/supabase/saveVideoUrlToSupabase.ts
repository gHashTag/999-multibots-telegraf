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
  // Раньше сюда клалась ссылка ПРОВАЙДЕРА, и это уже стоило данных: из 1496
  // ассетов 171 указывает на tempfile.aiquickdraw.com, и ВСЕ 171 отдают 404 —
  // проверено. Это временный файлохостинг KIE, а не хранилище. Replicate свой
  // CDN держит долго (1214 ссылок живы, включая самую старую), поэтому проблема
  // выглядела несуществующей.
  //
  // Полагаться на срок жизни чужой ссылки нельзя ни у одного провайдера.
  //
  // Отказ зеркалирования НЕ должен ломать сохранение: лучше записать ссылку
  // провайдера, чем не записать ничего. Поэтому весь блок в try, а при любой
  // неудаче остаётся исходный URL и предупреждение в лог.
  let urlToStore = publicUrl
  try {
    const { S3Service } = await import(
      '@/inngest_app/functions/render/helpers/s3.service'
    )
    const s3 = new S3Service()
    const res = await fetch(publicUrl, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`источник отдал HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const ext = (publicUrl.split('?')[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] || 'mp4').toLowerCase()
    const key = `assets/${telegramId}/${Date.now()}.${ext}`
    await s3.uploadFile(key, res.headers.get('content-type') || 'video/mp4', buf)
    const mirrored = await s3.generateGetUrl(key, 604800)
    if (isPlayableUrl(mirrored)) urlToStore = mirrored
  } catch (e) {
    logger.warn('⚠️ [assets] Не удалось зеркалировать в своё хранилище', {
      telegramId,
      error: e instanceof Error ? e.message : String(e),
      // Ссылка провайдера сохранится как есть — она может протухнуть, и это
      // повод посмотреть логи, а не потерять запись.
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
