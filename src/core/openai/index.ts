import OpenAI from 'openai'

// 🔐 LAZY INITIALIZATION: клиент создается только при первом обращении
// Это позволяет Infisical загрузить секреты ПЕРЕД созданием клиента
let _openai: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!_openai) {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error(
        'DEEPSEEK_API_KEY is not set. Ensure Infisical loaded secrets.'
      )
    }
    _openai = new OpenAI({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY,
      timeout: 60 * 1000, // 60 seconds in milliseconds
    })
  }
  return _openai
}

export const openai = new Proxy({} as OpenAI, {
  get(target, prop) {
    return (getOpenAIClient() as any)[prop]
  },
})

//
export * from './getSubtitles'
export * from './getTriggerReel'
export * from './requests'
export * from './upgradePrompt'
export * from './getAinews'
export * from './getCaptionForNews'
export * from './getMeditationSteps'
export * from './getSlides'
