import { ApiResponse } from '@/interfaces/api.interface'
import { logger } from '@/utils/logger' // Предполагаем, что логгер доступен

export const processApiResponse = async (
  apiOutput: ApiResponse
): Promise<string | null> => {
  logger.info({
    message: '[DIAGNOSTIC_PROCESS_API] Начало processApiResponse',
    apiOutput_type: typeof apiOutput,
    apiOutput_is_null: apiOutput === null,
    apiOutput_is_undefined: apiOutput === undefined,
  })
  // Расширенное логирование самого apiOutput
  if (apiOutput && typeof apiOutput === 'object') {
    logger.info({
      message: '[DIAGNOSTIC_PROCESS_API] Содержимое apiOutput (object)',
      keys: Object.keys(apiOutput),
    })
  } else {
    logger.info({
      message: '[DIAGNOSTIC_PROCESS_API] apiOutput (primitive)',
      value: apiOutput,
    })
  }

  try {
    if (!apiOutput) {
      logger.error({
        message: '[DIAGNOSTIC_PROCESS_API] Пустой ответ от API Replicate',
        apiOutput,
      })
      return null
    }

    // Обработка, если apiOutput - это массив URL (наиболее частый случай для Replicate)
    if (Array.isArray(apiOutput) && apiOutput.length > 0) {
      const firstUrl = apiOutput[0]
      if (typeof firstUrl === 'string' && firstUrl.startsWith('http')) {
        logger.info({
          message: '[DIAGNOSTIC_PROCESS_API] Возвращаем первый URL из массива',
          firstUrl,
        })
        return firstUrl
      }
    }

    // Обработка, если apiOutput - это одиночный URL-строка
    if (typeof apiOutput === 'string' && apiOutput.startsWith('http')) {
      logger.info({
        message: '[DIAGNOSTIC_PROCESS_API] Возвращаем одиночный URL-строку',
        apiOutput,
      })
      return apiOutput
    }

    // Обработка случая, когда ответ - объект с полем 'output' или 'data' (менее вероятно для текущего replicate.run, но для полноты)
    if (typeof apiOutput === 'object' && apiOutput !== null) {
      const potentialOutput =
        (apiOutput as any).output || (apiOutput as any).data
      if (Array.isArray(potentialOutput) && potentialOutput.length > 0) {
        const firstUrl = potentialOutput[0]
        if (typeof firstUrl === 'string' && firstUrl.startsWith('http')) {
          logger.info({
            message:
              '[DIAGNOSTIC_PROCESS_API] Возвращаем первый URL из object.output/data',
            firstUrl,
          })
          return firstUrl
        }
      }
      if (
        typeof potentialOutput === 'string' &&
        potentialOutput.startsWith('http')
      ) {
        logger.info({
          message:
            '[DIAGNOSTIC_PROCESS_API] Возвращаем одиночный URL из object.output/data',
          potentialOutput,
        })
        return potentialOutput
      }
    }

    logger.warn({
      message:
        '[DIAGNOSTIC_PROCESS_API] Не удалось извлечь URL из ответа API Replicate',
      apiOutput: JSON.stringify(apiOutput), // Логируем полный ответ, если он не содержит URL
    })
    return null
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error({
      message: '[DIAGNOSTIC_PROCESS_API] Ошибка внутри processApiResponse',
      error: errorMessage,
      apiOutput_str: JSON.stringify(apiOutput), // Логируем, что пытались обработать
    })
    return null // Возвращаем null в случае любой ошибки внутри
  }
}
