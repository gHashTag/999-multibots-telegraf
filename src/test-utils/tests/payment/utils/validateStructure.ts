import fs from 'fs'
import path from 'path'
import { logger } from '@/utils/logger'

const PAYMENT_TESTS_DIR = path.join(__dirname, '..')

const ALLOWED_DIRS = ['core', 'features', 'integrations', 'utils']
const REQUIRED_FILES = ['index.ts', 'README.md']
const REQUIRED_ROOT_FILES = ['index.ts', 'README.md']

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export function validateTestStructure(): ValidationResult {
  const errors: string[] = []

  try {
    // 1. Проверяем наличие обязательных файлов в корне
    logger.info('🔍 Проверка корневых файлов...', {
      description: 'Checking root files',
      files: REQUIRED_ROOT_FILES,
    })

    REQUIRED_ROOT_FILES.forEach(file => {
      const filePath = path.join(PAYMENT_TESTS_DIR, file)
      if (!fs.existsSync(filePath)) {
        errors.push(`❌ Отсутствует обязательный файл: ${file}`)
      }
    })

    // 2. Проверяем, что в корне нет лишних файлов
    logger.info('🔍 Проверка структуры корневой директории...', {
      description: 'Checking root directory structure',
    })

    const rootFiles = fs.readdirSync(PAYMENT_TESTS_DIR)
    rootFiles.forEach(file => {
      const filePath = path.join(PAYMENT_TESTS_DIR, file)
      const isDirectory = fs.statSync(filePath).isDirectory()

      if (isDirectory && !ALLOWED_DIRS.includes(file)) {
        errors.push(`❌ Недопустимая директория в корне: ${file}`)
      } else if (!isDirectory && !REQUIRED_ROOT_FILES.includes(file)) {
        errors.push(`❌ Недопустимый файл в корне: ${file}`)
      }
    })

    // 3. Проверяем структуру каждой разрешенной директории
    logger.info('🔍 Проверка структуры поддиректорий...', {
      description: 'Checking subdirectories structure',
    })

    ALLOWED_DIRS.forEach(dir => {
      const dirPath = path.join(PAYMENT_TESTS_DIR, dir)
      if (!fs.existsSync(dirPath)) {
        errors.push(`❌ Отсутствует обязательная директория: ${dir}`)
        return
      }

      // Проверяем наличие обязательных файлов в директории
      REQUIRED_FILES.forEach(file => {
        const filePath = path.join(dirPath, file)
        if (!fs.existsSync(filePath)) {
          errors.push(
            `❌ Отсутствует обязательный файл в директории ${dir}: ${file}`
          )
        }
      })

      // Проверяем расширения файлов
      const files = fs.readdirSync(dirPath)
      files.forEach(file => {
        if (file === 'index.ts' || file === 'README.md') return

        if (!file.endsWith('.test.ts')) {
          errors.push(
            `❌ Неправильное расширение файла в ${dir}: ${file}. Должно быть .test.ts`
          )
        }
      })
    })

    if (errors.length === 0) {
      logger.info('✅ Структура тестов валидна', {
        description: 'Test structure is valid',
      })
    } else {
      logger.error('❌ Найдены проблемы в структуре тестов:', {
        description: 'Test structure validation failed',
        errors,
      })
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('❌ Ошибка при валидации структуры:', {
      description: 'Structure validation error',
      error: errorMessage,
    })

    return {
      isValid: false,
      errors: [`Ошибка при валидации: ${errorMessage}`],
    }
  }
}
