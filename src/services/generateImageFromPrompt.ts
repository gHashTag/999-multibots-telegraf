/**
import { logger } from '@/utils/enhancedLogger'
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
  logger.debug("Генерация изображения:", {
    prompt,
    userId,
    style,
    negative_prompt,
    size,
  })

  const AI_SERVER_URL = process.env.SERVER_API_URL || "https://three-head-dragon.shop"
  
  try {
    const requestData = {
      prompt,
      user_id: userId,
      ...(style && { style }),
      ...(negative_prompt && { negative_prompt }),
      ...(size && { size })
    }

    const response = await fetch(`${AI_SERVER_URL}/api/generation/text-to-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData)
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data.image_url || data.url || "https://example.com/generated_image.png"
  } catch (error) {
    logger.error("Ошибка генерации изображения:", error)
    throw error
  }
}
