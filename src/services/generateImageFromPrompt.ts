/**
 * Генерирует изображение по текстовому запросу (промпту)
 * @param prompt Запрос для генерации изображения
 * @param userId ID пользователя запросившего генерацию
 * @param style Стиль изображения (опционально)
 * @param negative_prompt Негативный промпт (что исключить из генерации) (опционально)
 * @param size Размер изображения в формате WIDTHxHEIGHT (опционально)
 * @returns URL сгенерированного изображения
 */
export async function generateImageFromPrompt(
  prompt: string,
  userId: number,
  style?: string,
  negative_prompt?: string,
  size?: string
): Promise<string> {
  console.log("Генерация изображения:", {
    prompt,
    userId,
    style,
    negative_prompt,
    size,
  })

  // ✅ ИСПРАВЛЕНО: Используем локальный text-to-image сервис вместо внешнего API
  try {
    // Используем локальные AI сервисы
    const { generateFluxKontext } = await import('./generateFluxKontext')

    // Используем Flux Kontext для генерации изображений
    // Создаем минимальный контекст для вызова функции
    const mockContext = {
      telegram: null,
      botInfo: { username: 'default' },
      session: {}
    } as any

    const fluxResult = await generateFluxKontext({
      prompt,
      inputImageUrl: '', // Пустое значение для text-to-image
      modelType: 'pro',
      telegram_id: userId.toString(),
      username: 'user',
      is_ru: true,
      ctx: mockContext,
      suppressUserErrors: true // Не показываем ошибки пользователю
    })

    // GenerationResult имеет свойство image (Buffer или string)
    if (fluxResult?.image) {
      // Если image - это строка (URL), возвращаем её
      if (typeof fluxResult.image === 'string') {
        return fluxResult.image
      }
      // Если это Buffer, возвращаем заглушку (нужен URL)
      console.warn('⚠️ [generateImageFromPrompt] Received Buffer instead of URL')
    }

    // ВОЗВРАЩАТЬ ВЫДУМАННУЮ ССЫЛКУ НЕЛЬЗЯ.
    //
    // Ниже стояло `return "https://example.com/generated_image.png"` — адрес,
    // которого не существует. Вызывающий получал строку, похожую на успех, и
    // не мог отличить её от настоящей картинки.
    //
    // В этом проекте такое уже стоило денег: generateInstagramScraping
    // возвращала `success: true`, ничего не запустив, а сцены списывали за это
    // звёзды — 28 списаний, 94 звезды, ноль запусков (PR #510). И заглушки
    // ElevenLabs возвращали выдуманный адрес аудио, из-за чего отказ всплывал
    // на три шага позже и без причины.
    //
    // Честный отказ дешевле: вызывающий сразу знает, что картинки нет.
    console.warn('⚠️ [generateImageFromPrompt] All local AI services failed')
    throw new Error(
      'generateImageFromPrompt: ни один способ генерации не сработал. ' +
        'Раньше здесь возвращался выдуманный адрес — вызывающий принимал его за картинку.'
    )
  } catch (error) {
    console.error("Ошибка генерации изображения:", error)
    throw error
  }
}
