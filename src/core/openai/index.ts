import OpenAI from 'openai'

// if (!process.env.DEEPSEEK_API_KEY) {
//   throw new Error('DEEPSEEK_API_KEY is not set')
// }

// export const openai = new OpenAI({
//   baseURL: 'https://api.deepseek.com',
//   apiKey: process.env.DEEPSEEK_API_KEY,
// })

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is not set')
}

export const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const model = 'deepseek/deepseek-r1:free'

export * from './getSubtitles'
export * from './getTriggerReel'
export * from './requests'
export * from './upgradePrompt'
export * from './getAinews'
export * from './getCaptionForNews'
export * from './getMeditationSteps'
export * from './getSlides'
