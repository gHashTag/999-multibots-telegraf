import dotenv from 'dotenv'
dotenv.config()

// Мокаем глобальные зависимости
jest.mock('@/core/elevenlabs', () => require('./mocks/elevenlabs.mock'))

// Устанавливаем тайм-аут для тестов
jest.setTimeout(30000)
