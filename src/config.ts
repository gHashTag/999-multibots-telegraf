/**
 * Основной файл конфигурации приложения
 */
import dotenv from 'dotenv'

// Загружаем переменные окружения из .env файла
dotenv.config()

// Базовая конфигурация для Inngest
export const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY || ''
export const INNGEST_BASE_URL =
  process.env.INNGEST_BASE_URL || 'http://localhost:8288'
export const INNGEST_SIGNING_KEY = process.env.INNGEST_SIGNING_KEY || ''

// Конфигурация Supabase
export const SUPABASE_URL = process.env.SUPABASE_URL || ''
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Конфигурация API и URL
export const ELESTIO_URL = process.env.ELESTIO_URL || ''
export const SECRET_API_KEY = process.env.SECRET_API_KEY || ''
export const LOCAL_SERVER_URL = process.env.LOCAL_SERVER_URL || ''
export const API_URL = process.env.API_URL || process.env.ELESTIO_URL || ''
export const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads'
export const RESULT_URL2 = process.env.RESULT_URL2 || ''

// Конфигурация платежей Robokassa
export const MERCHANT_LOGIN = process.env.MERCHANT_LOGIN || ''
export const PASSWORD1 = process.env.PASSWORD1 || ''
export const TEST_PASSWORD1 = process.env.TEST_PASSWORD1 || ''
export const PASSWORD2 = process.env.PASSWORD2 || ''
export const TEST_PASSWORD2 = process.env.TEST_PASSWORD2 || ''

// Конфигурация Pinata IPFS
export const PINATA_JWT = process.env.PINATA_JWT || ''
export const PINATA_GATEWAY = process.env.PINATA_GATEWAY || ''

// Конфигурация Glama
export const GLAMA_API_KEY = process.env.GLAMA_API_KEY || ''

// Конфигурация для различных окружений
export const isProduction = process.env.NODE_ENV === 'production'
export const isDevelopment = process.env.NODE_ENV === 'development'
export const isTest = process.env.NODE_ENV === 'test'
// Для обратной совместимости
export const isDev = isDevelopment

// Логирование статуса загрузки конфигурации
console.log('📝 Конфигурация загружена:', {
  NODE_ENV: process.env.NODE_ENV,
  INNGEST_KEYS_AVAILABLE: !!INNGEST_EVENT_KEY,
  SUPABASE_KEYS_AVAILABLE: !!SUPABASE_URL && !!SUPABASE_SERVICE_KEY,
  GLAMA_API_KEY_AVAILABLE: !!GLAMA_API_KEY,
})

// Экспорт основной конфигурации
export default {
  INNGEST_EVENT_KEY,
  INNGEST_BASE_URL,
  INNGEST_SIGNING_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  GLAMA_API_KEY,
  ELESTIO_URL,
  SECRET_API_KEY,
  LOCAL_SERVER_URL,
  API_URL,
  UPLOAD_DIR,
  RESULT_URL2,
  MERCHANT_LOGIN,
  PASSWORD1,
  TEST_PASSWORD1,
  PASSWORD2,
  TEST_PASSWORD2,
  PINATA_JWT,
  PINATA_GATEWAY,
  isProduction,
  isDevelopment,
  isDev,
  isTest,
}
