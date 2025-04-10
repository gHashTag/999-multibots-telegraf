import { TestResult } from '../../core/types'
import { supabase } from '@/core/supabase'
import { ModeEnum } from '@/types/modes'
import { logger } from '@/utils/logger'
import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { TestCategory } from '../../core/categories'

const REQUIRED_LANGUAGES = ['ru', 'en']
const REQUIRED_BOTS = [
  'neuro_blogger_bot',
  'clip_maker_neuro_bot',
  'ai_koshey_bot',
  'Gaia_Kamskaia_bot',
  'LeeSolarbot',
  'MetaMuse_Manifest_bot',
  'NeuroLenaAssistant_bot',
  'NeurostylistShtogrina_bot',
  'ZavaraBot',
]

// Все ключи, которые используются в приложении
const REQUIRED_TRANSLATION_KEYS = [
  // Общие ключи
  'help',
  'start',
  'cancel',
  'error',
  'success',

  // Системные ключи
  'maintenance',
  'rate_limit',
  'subscription_required',

  // Ключи для сцен и режимов
  'subscriptionScene',
  'digitalAvatar',
  'chat_with_avatar_start',
  'avatar_brain_description',
  'avatar_voice_description',
  'avatar_model_description',
  'avatar_greeting',
  'avatar_help',

  // Ключи из ModeEnum
  ModeEnum.Subscribe,
  ModeEnum.DigitalAvatarBody,
  ModeEnum.NeuroPhoto,
  ModeEnum.ImageToPrompt,
  ModeEnum.Avatar,
  ModeEnum.ChatWithAvatar,
  ModeEnum.SelectModel,
  ModeEnum.Voice,
  ModeEnum.TextToSpeech,
  ModeEnum.ImageToVideo,
  ModeEnum.TextToVideo,
  ModeEnum.TextToImage,
]

interface MissingTranslation {
  bot: string
  key: string
  language: string
}

// Константы для путей и конфигурации
const LOCALES_PATH = resolve(process.cwd(), 'locales')
const REQUIRED_KEYS = [
  'common',
  'chats',
  'features',
  'bot',
  'errors',
  'userBotChat',
  'userServerChat',
]

// Исправленный путь к локализациям, учитывая возможный запуск из src/
const LOCALIZATIONS_PATH = (() => {
  const basePath = process.cwd()
  const relativePath = 'localizations'
  
  // Проверяем, находимся ли мы в 'src'
  if (basePath.endsWith('/src')) {
    return resolve(basePath, relativePath)
  }
  
  // Иначе используем полный путь с /src/
  return resolve(basePath, 'src', relativePath)
})()

/**
 * Проверяет переводы для указанного языка
 * @param language язык для проверки
 * @returns результат теста
 */
export function checkLocalizationFiles(language: string): TestResult {
  logger.info(`Checking ${language} translations...`)
  
  try {
    const langPath = join(LOCALIZATIONS_PATH, language)
    
    // Проверка существования директории с переводами
    try {
      readdirSync(langPath)
    } catch (e) {
      return {
        name: `${language} translations check`,
        success: false,
        message: `Directory for ${language} translations not found at ${langPath}`,
        category: TestCategory.Translations
      }
    }
    
    // Проверка обязательных файлов переводов
    for (const key of REQUIRED_KEYS) {
      const filePath = join(langPath, `${key}.json`)
      try {
        readFileSync(filePath, 'utf8')
      } catch (e) {
        return {
          name: `${language} translations check`,
          success: false,
          message: `Required translation file ${key}.json not found for ${language}`,
          category: TestCategory.Translations
        }
      }
    }
    
    return {
      name: `${language} translations check`,
      success: true,
      message: `All required ${language} translation files exist`,
      category: TestCategory.Translations
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Error checking ${language} translations:`, errorMessage)
    return {
      name: `${language} translations check`,
      success: false,
      message: `Error checking ${language} translations: ${errorMessage}`,
      category: TestCategory.Translations
    }
  }
}

/**
 * Тестирует русские переводы
 * @returns результат теста
 */
export function testRussianTranslations(): TestResult {
  logger.info('Starting Russian translations test...')
  return checkLocalizationFiles('ru')
}

/**
 * Тестирует английские переводы
 * @returns результат теста
 */
export function testEnglishTranslations(): TestResult {
  logger.info('Starting English translations test...')
  return checkLocalizationFiles('en')
}

/**
 * Проверяет согласованность ключей локализации между русским и английским языками
 * @returns результат теста
 */
export function testLocalizationKeysConsistency(): TestResult {
  logger.info('Checking localization keys consistency...')
  
  try {
    const results: {[key: string]: {ru: object, en: object}} = {}
    
    // Загружаем все файлы переводов
    for (const key of REQUIRED_KEYS) {
      results[key] = { ru: {}, en: {} }
      
      for (const lang of REQUIRED_LANGUAGES) {
        const filePath = join(LOCALIZATIONS_PATH, lang, `${key}.json`)
        try {
          const content = readFileSync(filePath, 'utf8')
          results[key][lang as 'ru' | 'en'] = JSON.parse(content)
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e)
          return {
            name: 'Localization keys consistency check',
            success: false,
            message: `Could not read or parse ${lang}/${key}.json file: ${errorMessage}`,
            category: TestCategory.Translations
          }
        }
      }
    }
    
    // Проверяем согласованность ключей
    const missingKeys: string[] = []
    
    for (const fileKey of REQUIRED_KEYS) {
      const ruKeys = Object.keys(results[fileKey].ru)
      const enKeys = Object.keys(results[fileKey].en)
      
      // Проверяем, что все ключи из русской локализации есть в английской
      for (const key of ruKeys) {
        if (!enKeys.includes(key)) {
          missingKeys.push(`Missing in EN: ${fileKey}.${key}`)
        }
      }
      
      // Проверяем, что все ключи из английской локализации есть в русской
      for (const key of enKeys) {
        if (!ruKeys.includes(key)) {
          missingKeys.push(`Missing in RU: ${fileKey}.${key}`)
        }
      }
    }
    
    if (missingKeys.length > 0) {
      return {
        name: 'Localization keys consistency check',
        success: false,
        message: `Found ${missingKeys.length} inconsistent localization keys:\n${missingKeys.join('\n')}`,
        category: TestCategory.Translations
      }
    }
    
    return {
      name: 'Localization keys consistency check',
      success: true,
      message: 'All localization keys are consistent between Russian and English translations',
      category: TestCategory.Translations
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Error checking localization keys consistency:', errorMessage)
    return {
      name: 'Localization keys consistency check',
      success: false,
      message: `Error checking localization keys consistency: ${errorMessage}`,
      category: TestCategory.Translations
    }
  }
}

/**
 * Выполняет проверку переводов на наличие всех необходимых файлов и ключей
 */
export function checkTranslations(): TestResult {
  try {
    logger.info({
      message: '🧪 Запуск тестов локализации',
      description: 'Running localization tests'
    })

    // Проверяем существование директории locales
    if (!readdirSync(LOCALES_PATH)) {
      throw new Error(`Директория ${LOCALES_PATH} не найдена`)
    }

    // Проверяем каждый язык
    for (const lang of REQUIRED_LANGUAGES) {
      const langPath = join(LOCALES_PATH, lang)
      
      // Проверяем существование директории языка
      try {
        readdirSync(langPath)
      } catch (error) {
        throw new Error(`Директория для языка "${lang}" не найдена в ${langPath}`)
      }

      // Проверяем каждого бота
      for (const bot of REQUIRED_BOTS) {
        const botPath = join(langPath, bot)
        
        // Проверяем существование директории бота
        try {
          readdirSync(botPath)
        } catch (error) {
          throw new Error(`Директория для бота "${bot}" не найдена в ${botPath}`)
        }

        // Проверяем наличие всех необходимых ключей
        for (const key of REQUIRED_KEYS) {
          const keyPath = join(botPath, `${key}.json`)
          
          try {
            // Пытаемся прочитать и спарсить файл перевода
            const translationFile = readFileSync(keyPath, 'utf-8')
            JSON.parse(translationFile)
          } catch (error) {
            throw new Error(`Ошибка при чтении или парсинге файла перевода: ${keyPath}`)
          }
        }
      }
    }

    return {
      name: 'Translation files check',
      success: true,
      message: 'Все файлы локализации найдены и корректны',
      category: TestCategory.Translations
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    logger.error({
      message: '❌ Ошибка в тестах локализации',
      description: 'Localization test failed',
      error: errorMessage
    })
    
    return {
      name: 'Translation files check',
      success: false,
      message: errorMessage,
      category: TestCategory.Translations
    }
  }
}

/**
 * Проверяет полноту перевода для данного объекта локализации
 */
function validateTranslationCompleteness(obj: any, path: string, lang: string): void {
  if (typeof obj === 'object' && obj !== null) {
    Object.entries(obj).forEach(([key, value]) => {
      const currentPath = path ? `${path}.${key}` : key
      
      if (typeof value === 'object' && value !== null) {
        validateTranslationCompleteness(value, currentPath, lang)
      } else if (value === '' || value === null || value === undefined) {
        throw new Error(`Пустой перевод для ключа "${currentPath}" в языке "${lang}"`)
      }
    })
  }
}

/**
 * Извлекает все ключи локализации для указанного языка
 */
function extractAllTranslationKeys(lang: string): string[] {
  const allKeys: string[] = []
  const langPath = join(LOCALES_PATH, lang)
  
  for (const bot of REQUIRED_BOTS) {
    const botPath = join(langPath, bot)
    
    for (const key of REQUIRED_KEYS) {
      const keyPath = join(botPath, `${key}.json`)
      
      try {
        const translationFile = readFileSync(keyPath, 'utf-8')
        const translationData = JSON.parse(translationFile)
        
        // Извлекаем все пути ключей из объекта перевода
        const keyPaths = extractKeyPaths(translationData, `${bot}.${key}`)
        allKeys.push(...keyPaths)
      } catch (error) {
        throw new Error(`Ошибка при извлечении ключей из файла перевода: ${keyPath}`)
      }
    }
  }
  
  return allKeys
}

/**
 * Извлекает все пути ключей из объекта перевода
 */
function extractKeyPaths(obj: any, basePath: string = ''): string[] {
  let paths: string[] = []
  
  if (typeof obj === 'object' && obj !== null) {
    Object.entries(obj).forEach(([key, value]) => {
      const currentPath = basePath ? `${basePath}.${key}` : key
      
      if (typeof value === 'object' && value !== null) {
        paths = paths.concat(extractKeyPaths(value, currentPath))
      } else {
        paths.push(currentPath)
      }
    })
  }
  
  return paths
}

/**
 * Находит ключи, которые отсутствуют во втором наборе
 */
function findMissingKeys(sourceKeys: string[], targetKeys: string[]): string[] {
  return sourceKeys.filter(key => !targetKeys.includes(key))
}
