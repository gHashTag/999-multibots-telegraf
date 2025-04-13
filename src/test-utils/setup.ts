import dotenv from 'dotenv'
import path from 'path'
import mockApi from './core/mock'
import * as database from '@/libs/database'
import { logger } from '@/utils/logger'

// Импортируем типы
import './types/global'

// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test'

// Загружаем переменные окружения для тестов
dotenv.config({ 
  path: path.resolve(process.cwd(), '.env.test'),
  override: true
})

// Устанавливаем мок-ключ для ElevenLabs API
process.env.ELEVENLABS_API_KEY = 'mock_key'

// Мокаем ElevenLabs API
const { elevenlabs } = require('./mocks/elevenlabs.mock')

// Устанавливаем моки в глобальное пространство
;(global as any).elevenlabs = elevenlabs

// Configure logger for testing
logger.level = process.env.LOG_LEVEL || 'error'

// Mock database functions
Object.defineProperty(database, 'getUserSub', {
  value: mockApi.create(),
  configurable: true,
})

Object.defineProperty(database, 'getUserBalance', {
  value: mockApi.create(),
  configurable: true,
})

Object.defineProperty(database, 'getUser', {
  value: mockApi.create(),
  configurable: true,
})

Object.defineProperty(database, 'updateUserSettings', {
  value: mockApi.create(),
  configurable: true,
})

Object.defineProperty(database, 'getUserBalanceNotificationSettings', {
  value: mockApi.create(),
  configurable: true,
})

Object.defineProperty(database, 'updateUserBalanceNotificationSettings', {
  value: mockApi.create(),
  configurable: true,
})

// Add more mocks as needed

logger.info('🛠 Тестовое окружение настроено')

console.log('🔧 Test environment setup complete')
