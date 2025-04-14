import { logger } from '@/utils/logger'

/**
 * Обрабатывает ответ от API Replicate и возвращает URL изображения
 * @param output Ответ от API Replicate
 * @returns URL изображения
 */
export async function processApiResponse(output: unknown): Promise<string> {
  logger.info({
    message: '🔍 Обработка ответа API',
    description: 'Processing API response',
    output_type: typeof output,
    output_is_array: Array.isArray(output),
    output_preview: JSON.stringify(output).substring(0, 200) + '...',
  })

  // Случай 1: ответ - строка (прямой URL)
  if (typeof output === 'string') {
    logger.info({
      message: '✅ Ответ API - строка URL',
      description: 'API response is a string URL',
      url: output,
    })
    return output
  }

  // Случай 2: ответ - массив строк
  if (Array.isArray(output)) {
    logger.info({
      message: '✅ Ответ API - массив',
      description: 'API response is an array',
      array_length: output.length,
      first_element_type: output.length > 0 ? typeof output[0] : 'none',
    })

    if (output.length > 0 && typeof output[0] === 'string') {
      logger.info({
        message: '✅ Извлечен URL из массива',
        description: 'Extracted URL from array',
        url: output[0],
      })
      return output[0]
    }
  }

  // Случай 3: ответ - объект с полем output
  if (output && typeof output === 'object') {
    logger.info({
      message: '✅ Ответ API - объект',
      description: 'API response is an object',
      has_output_field: 'output' in output,
      keys: Object.keys(output),
    })

    if ('output' in output) {
      const outputField = (output as { output: unknown }).output

      // Если поле output - строка
      if (typeof outputField === 'string') {
        logger.info({
          message: '✅ Извлечен URL из поля output (строка)',
          description: 'Extracted URL from output field (string)',
          url: outputField,
        })
        return outputField
      }

      // Если поле output - массив
      if (Array.isArray(outputField) && outputField.length > 0) {
        if (typeof outputField[0] === 'string') {
          logger.info({
            message: '✅ Извлечен URL из поля output (массив)',
            description: 'Extracted URL from output field (array)',
            url: outputField[0],
          })
          return outputField[0]
        }
      }
    }

    // Проверка на другие распространенные поля API ответов
    const possibleFields = ['url', 'image', 'image_url', 'result', 'prediction']
    for (const field of possibleFields) {
      if (field in output) {
        const value = (output as Record<string, unknown>)[field]
        if (typeof value === 'string') {
          logger.info({
            message: `✅ Извлечен URL из поля ${field}`,
            description: `Extracted URL from ${field} field`,
            url: value,
          })
          return value
        }

        if (
          Array.isArray(value) &&
          value.length > 0 &&
          typeof value[0] === 'string'
        ) {
          logger.info({
            message: `✅ Извлечен URL из массива в поле ${field}`,
            description: `Extracted URL from array in ${field} field`,
            url: value[0],
          })
          return value[0]
        }
      }
    }
  }

  // Если мы дошли до этого места, значит не смогли найти URL
  logger.error({
    message: '❌ Не удалось извлечь URL из ответа API',
    description: 'Failed to extract URL from API response',
    output_type: typeof output,
    output_preview: JSON.stringify(output).substring(0, 500) + '...',
    output_full: JSON.stringify(output),
  })

  throw new Error(
    `Некорректный ответ от API: ${JSON.stringify(output).substring(0, 200)}...`
  )
}
