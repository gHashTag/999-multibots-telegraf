/**
 * TEMPLATE: FunctionName
 *
 * Описание назначения функции
 *
 * Создано автоматически с помощью Claude Code Inngest Specialist
 * Дата: {{DATE}}
 * Категория: {{CATEGORY}}
 */

import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { z } from 'zod'

// ===== ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ =====

/**
 * Схема валидации входных данных
 */
const {{SCHEMA_NAME}} = z.object({
  // Добавьте поля схемы здесь
  // exampleField: z.string().min(1, 'Поле обязательно'),
  // numericField: z.number().positive('Число должно быть положительным'),
})

/**
 * Тип входных данных функции
 */
export type {{TYPE_NAME}}Input = z.infer<typeof {{SCHEMA_NAME}}>

/**
 * Интерфейс результата функции
 */
export interface {{TYPE_NAME}}Result {
  success: boolean
  data?: unknown
  error?: string
}

// ===== ОСНОВНАЯ ФУНКЦИЯ =====

/**
 * {{PASCAL_FUNCTION_NAME}} - {{DESCRIPTION}}
 *
 * Детальное описание функциональности
 */
export const {{CAMEL_FUNCTION_NAME}} = inngest.createFunction(
  {
    id: '{{KEBAB_FUNCTION_NAME}}',
    name: '{{PASCAL_FUNCTION_NAME}}',
    retries: {
      attempts: 3,
      delay: '1s',
    },
    concurrency: 10,
  },
  { event: '{{KEBAB_EVENT_NAME}}' },
  async ({ event, step }) => {
    const logger = new Logger('{{PASCAL_FUNCTION_NAME}}')

    try {
      // Валидация входных данных
      const input = {{SCHEMA_NAME}}.parse(event.data)

      logger.info('Функция запущена', {
        eventName: event.name,
        {{#INPUT_FIELDS}}
        {{this}}: input.{{this}},
        {{/INPUT_FIELDS}}
      })

      // ===== ОСНОВНАЯ ЛОГИКА =====

      // Шаг 1: Первая операция
      const step1Result = await step.run('operation-name-1', async () => {
        logger.info('Выполнение операции 1')

        // ЗДЕСЬ ДОБАВЬТЕ ЛОГИКУ ОПЕРАЦИИ 1
        // Пример:
        // const data = await someService.process(input.field)
        // return { processed: true, data }

        return { success: true }
      })

      // Шаг 2: Вторая операция
      const step2Result = await step.run('operation-name-2', async () => {
        logger.info('Выполнение операции 2', { step1Result })

        // ЗДЕСЬ ДОБАВЬТЕ ЛОГИКУ ОПЕРАЦИИ 2
        // Пример:
        // return await anotherService.process(step1Result.data)

        return { success: true }
      })

      // ===== ФИНАЛИЗАЦИЯ =====

      logger.info('Функция успешно завершена', {
        step1Result: step1Result.success,
        step2Result: step2Result.success,
      })

      return {
        success: true,
        data: {
          step1: step1Result,
          step2: step2Result,
        },
      } satisfies {{TYPE_NAME}}Result

    } catch (error) {
      logger.error('Ошибка в функции', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        eventData: event.data,
      })
      throw error
    }
  }
)

// ===== ЭКСПОРТЫ =====

/**
 * Альтернативное имя функции (если нужно)
 */
export const {{ALTERNATIVE_NAME}} = {{CAMEL_FUNCTION_NAME}}

/**
 * Типы для экспорта
 */
export type {
  {{TYPE_NAME}}Input as {{ALTERNATIVE_TYPE_NAME}}Input,
  {{TYPE_NAME}}Result as {{ALTERNATIVE_TYPE_NAME}}Result,
}
