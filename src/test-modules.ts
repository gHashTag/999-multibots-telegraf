/**
 * Файл для тестирования доступности встроенных модулей Node.js
 * Запуск: pnpm vite-node src/test-modules.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { Buffer } from 'node:buffer'
import { logger } from './utils/logger'

// Зеленым цветом
const GREEN = '\x1b[32m'
// Красным цветом
const RED = '\x1b[31m'
// Жёлтым цветом
const YELLOW = '\x1b[33m'
// Сброс цвета
const RESET = '\x1b[0m'

// Успешно
const SUCCESS = `${GREEN}✓${RESET}`
// Ошибка
const ERROR = `${RED}✗${RESET}`
// Предупреждение
const WARNING = `${YELLOW}!${RESET}`

/**
 * Функция для обработки ошибок с выводом отладочной информации
 */
function handleError(error: unknown, context: string): void {
  console.error(`${ERROR} Ошибка в контексте "${context}":`)

  if (error instanceof Error) {
    console.error(`   Тип: ${error.name}`)
    console.error(`   Сообщение: ${error.message}`)
    console.error(`   Стек вызовов:`)
    console.error(`   ${error.stack?.split('\n').slice(1).join('\n   ')}`)
  } else {
    console.error(`   Необработанная ошибка: ${String(error)}`)
  }

  console.error(`${WARNING} Информация о среде выполнения:`)
  console.error(`   Node.js: ${process.version}`)
  console.error(`   Платформа: ${process.platform}`)
  console.error(`   ESM модули: ${!!process.env.USE_ESM || 'не определено'}`)
  console.error(`   Директория: ${process.cwd()}`)
  console.error(
    `   NODE_OPTIONS: ${process.env.NODE_OPTIONS || 'не установлено'}`
  )
}

async function testModules() {
  console.log('🧪 Тестирование модулей Node.js')
  console.log('------------------------------')

  const tempDir = path.join(process.cwd(), 'temp')
  const tempFile = path.join(tempDir, 'test.json')

  try {
    // Проверяем доступность модуля fs
    console.log('📂 Тестирование fs...')
    console.log(`   Тип объекта fs: ${typeof fs}`)
    console.log(
      `   Свойства: ${Object.keys(fs).join(', ').substring(0, 100)}...`
    )

    // Проверка существования директории
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
      console.log(`${SUCCESS} Директория создана: ${tempDir}`)
    } else {
      console.log(`${SUCCESS} Директория существует: ${tempDir}`)
    }

    // Запись тестового файла
    const testData = { test: true, timestamp: Date.now() }
    fs.writeFileSync(tempFile, JSON.stringify(testData, null, 2))
    console.log(`${SUCCESS} Файл записан: ${tempFile}`)

    // Чтение тестового файла
    const fileContent = fs.readFileSync(tempFile, 'utf-8')
    const parsedData = JSON.parse(fileContent)
    console.log(`${SUCCESS} Файл прочитан: ${JSON.stringify(parsedData)}`)

    // Тестируем Buffer
    console.log('\n📦 Тестирование Buffer...')
    console.log(`   Тип объекта Buffer: ${typeof Buffer}`)
    const buffer = Buffer.from('Привет, мир!')
    console.log(`${SUCCESS} Buffer создан: ${buffer.toString()}`)

    // Тестируем path
    console.log('\n🔄 Тестирование path...')
    console.log(`   Тип объекта path: ${typeof path}`)
    console.log(`   Свойства: ${Object.keys(path).join(', ')}`)
    const resolvedPath = path.resolve('./src')
    console.log(`${SUCCESS} path.resolve: ${resolvedPath}`)

    // Тестируем логгер
    console.log('\n📝 Тестирование логгера...')
    try {
      console.log(`   Тип объекта logger: ${typeof logger}`)
      console.log(`   Свойства: ${Object.keys(logger).join(', ')}`)
      logger.info('Тестовое сообщение логгера')
      console.log(`${SUCCESS} Логгер работает`)
    } catch (error) {
      console.log(`${ERROR} Ошибка логгера:`)
      handleError(error, 'logger')
    }

    console.log('\n✅ Все тесты пройдены успешно!')
  } catch (error) {
    console.error(`\n${ERROR} Ошибка:`)
    handleError(error, 'global')
  }
}

testModules().catch(error => {
  console.error(`\n${ERROR} Необработанная ошибка:`)
  handleError(error, 'promise')
})
