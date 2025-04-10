import dotenv from 'dotenv'
import { logger } from '@/utils/logger'

// Импортируем типы
import './types/global'

// Устанавливаем тестовое окружение
process.env.NODE_ENV = 'test'

// Загружаем переменные окружения для тестов
dotenv.config({ path: '.env.test' })

// Устанавливаем мок-ключ для ElevenLabs API
process.env.ELEVENLABS_API_KEY = 'mock_key'

// Мокаем ElevenLabs API
const { elevenlabs } = require('./mocks/elevenlabs.mock')

// Устанавливаем моки в глобальное пространство
;(global as any).elevenlabs = elevenlabs

logger.info('🛠 Тестовое окружение настроено')
