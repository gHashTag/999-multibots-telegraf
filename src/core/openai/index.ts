import OpenAI from 'openai'

// Проверяем наличие ключей API
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!DEEPSEEK_API_KEY && !OPENAI_API_KEY) {
  throw new Error('Neither DEEPSEEK_API_KEY nor OPENAI_API_KEY is set')
}

// Создаем клиент для DeepSeek (если ключ есть)
export const deepseekClient = DEEPSEEK_API_KEY ? new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: DEEPSEEK_API_KEY,
  timeout: 60 * 1000, // 60 seconds in milliseconds
}) : null

// Создаем клиент для OpenAI (если ключ есть)
export const openaiClient = OPENAI_API_KEY ? new OpenAI({
  apiKey: OPENAI_API_KEY,
  timeout: 60 * 1000, // 60 seconds in milliseconds
}) : null

// Экспортируем основной клиент для обратной совместимости
// Используем DeepSeek по умолчанию, если он доступен
export const openai = deepseekClient || openaiClient!

//
export * from './getSubtitles'
export * from './getTriggerReel'
export * from './requests'
export * from './upgradePrompt'
export * from './getAinews'
export * from './getCaptionForNews'
export * from './getMeditationSteps'
export * from './getSlides'
