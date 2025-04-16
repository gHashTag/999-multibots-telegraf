/**
 * Модуль для снапшот-тестирования в функциональном стиле
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// Конфигурация модуля
const config = {
  rootDir: process.cwd(),
  snapshotDir: '__snapshots__',
  updateSnapshot: process.env.UPDATE_SNAPSHOT === 'true',
}

/**
 * Создает хеш на основе данных для использования в имени файла
 */
function createHash(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex').substring(0, 8)
}

/**
 * Преобразует значение в строковое представление для сравнения
 */
function serializeValue(value: any): string {
  if (value === undefined) {
    return 'undefined'
  }

  if (value === null) {
    return 'null'
  }

  if (typeof value === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`
  }

  if (typeof value === 'object') {
    try {
      // Попытка сериализовать с сохранением читаемости
      return JSON.stringify(value, null, 2)
    } catch (e) {
      return `[Object: Circular or Unable to Serialize]`
    }
  }

  return String(value)
}

/**
 * Создает путь к директории для хранения снапшотов
 */
function getSnapshotDir(testFile: string): string {
  const testDir = path.dirname(testFile)
  return path.join(testDir, config.snapshotDir)
}

/**
 * Создает путь к файлу снапшота
 */
function getSnapshotFilename(testFile: string, testName: string): string {
  const hash = createHash(testName)
  const testFilename = path.basename(testFile, path.extname(testFile))
  return path.join(getSnapshotDir(testFile), `${testFilename}.${hash}.snap`)
}

/**
 * Создает директорию для снапшотов, если она не существует
 */
function ensureSnapshotDirExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Читает существующий снапшот из файла
 */
function readSnapshot(snapshotFile: string): string | null {
  try {
    if (fs.existsSync(snapshotFile)) {
      return fs.readFileSync(snapshotFile, 'utf8')
    }
  } catch (error) {
    console.error(`Error reading snapshot file: ${snapshotFile}`, error)
  }
  return null
}

/**
 * Записывает новый снапшот в файл
 */
function writeSnapshot(snapshotFile: string, content: string): void {
  try {
    ensureSnapshotDirExists(path.dirname(snapshotFile))
    fs.writeFileSync(snapshotFile, content, 'utf8')
  } catch (error) {
    console.error(`Error writing snapshot file: ${snapshotFile}`, error)
  }
}

/**
 * Сравнивает текущее значение с снапшотом
 */
function matchSnapshot(
  currentValue: any,
  testFile: string,
  testName: string
): boolean {
  const snapshotFile = getSnapshotFilename(testFile, testName)
  const serializedValue = serializeValue(currentValue)

  // Получаем существующий снапшот
  const existingSnapshot = readSnapshot(snapshotFile)

  // Если нужно обновить снапшот или его нет, записываем новый
  if (config.updateSnapshot || !existingSnapshot) {
    writeSnapshot(snapshotFile, serializedValue)
    if (existingSnapshot !== serializedValue) {
      console.log(`Updated snapshot for "${testName}" in ${testFile}`)
    }
    return true
  }

  // Сравниваем значения
  const matches = existingSnapshot === serializedValue

  if (!matches) {
    console.error(`Snapshot mismatch for "${testName}" in ${testFile}`)
    console.error('Expected:')
    console.error(existingSnapshot)
    console.error('Received:')
    console.error(serializedValue)
  }

  return matches
}

/**
 * Обновляет конфигурацию снапшот-тестирования
 */
function configure(options: Partial<typeof config>): void {
  Object.assign(config, options)
}

/**
 * Проверяет соответствие значения сохраненному снапшоту
 */
function toMatchSnapshot(
  value: any,
  testFile: string,
  testName: string
): boolean {
  return matchSnapshot(value, testFile, testName)
}

// Экспортируем все функции через один объект для совместимости
const snapshot = {
  toMatchSnapshot,
  configure,
}

export default snapshot
