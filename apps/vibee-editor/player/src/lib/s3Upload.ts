// ===============================

import { authHeaders } from './apiFetch'
// S3 Upload Utility
// ===============================

// Render server URL
const RENDER_SERVER_URL =
  import.meta.env.VITE_RENDER_SERVER_URL || 'http://localhost:3333'

/**
 * Upload a file or blob to S3 via the render server
 * @param file - File or Blob to upload
 * @param filename - Target filename
 * @param serverUrl - Optional custom server URL
 * @returns URL of uploaded file, or null on error
 */
export async function uploadToS3(
  file: File | Blob,
  filename: string,
  serverUrl = RENDER_SERVER_URL
): Promise<string | null> {
  try {
    const response = await fetch(`${serverUrl}/upload`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': file instanceof File ? file.type : 'audio/webm',
        /*
         * ИМЯ ФАЙЛА КОДИРУЕТСЯ, ИНАЧЕ КИРИЛЛИЦА ЛОМАЕТ ЗАГРУЗКУ ДО СЕТИ.
         *
         * Значение заголовка обязано быть Latin-1: `Headers.set` на «фото.jpg»
         * бросает «parameter 2 is not a valid ByteString». Прежний код ловил
         * это своим catch и возвращал null — то есть у русскоязычного
         * пользователя любой файл с русским именем не грузился ВООБЩЕ, а
         * человек читал «загрузка не удалась» и не мог знать, что дело в
         * имени. Запроса при этом даже не возникало, поэтому в журнале
         * сервера такой отказ не виден.
         *
         * Нашлось при написании проверки на этот файл: я подставил кириллицу
         * в значение заголовка, и упал не сервер, а браузерный Headers.
         */
        'X-Filename': encodeURIComponent(filename),
      }),
      body: file,
    })

    /*
     * ПРИЧИНА ОТКАЗА ДОЕЗЖАЕТ ДО ЧЕЛОВЕКА.
     *
     * Раньше любая ошибка — отказ в доступе, слишком большой файл, занятая
     * очередь — превращалась в `null`, а человек читал «загрузка не удалась».
     * Диагностировать по такому сообщению нечего: оно одинаково для отказа
     * аутентификации и для лопнувшей сети. Настоящую причину знал только
     * журнал сервера, куда человек не смотрит.
     *
     * Тело читается ТЕКСТОМ, а не сразу json: на 502 от прокси там HTML, и
     * `.json()` падал бы своей ошибкой поверх настоящей, подменяя её.
     */
    const сырое = await response.text()
    let result: { success?: boolean; url?: string; error?: string } = {}
    try {
      result = JSON.parse(сырое)
    } catch {
      throw new Error(
        `сервер ответил ${response.status}: ${сырое.slice(0, 200) || 'пустой ответ'}`
      )
    }
    if (result.success && result.url) {
      return result.url
    }
    throw new Error(
      result.error
        ? `${result.error} (HTTP ${response.status})`
        : `сервер ответил ${response.status}`
    )
  } catch (error) {
    console.error('[S3 Upload] Error:', error)
    // Бросаем дальше, а не возвращаем null: все вызывающие уже стоят внутри
    // try, и им нужна причина, а не пустота.
    throw error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * Upload with progress tracking (for future use)
 */
export async function uploadToS3WithProgress(
  file: File | Blob,
  filename: string,
  onProgress?: (percent: number) => void,
  serverUrl = RENDER_SERVER_URL
): Promise<string | null> {
  // For now, just delegate to the simple upload
  // XHR with progress can be added later if needed
  return uploadToS3(file, filename, serverUrl)
}
