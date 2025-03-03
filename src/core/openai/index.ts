import OpenAI from 'openai'

if (!process.env.DEEPSEEK_API_KEY) {
  throw new Error('DEEPSEEK_API_KEY is not set')
}

export const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
})

export const model = 'deepseek-chat'

export * from './getSubtitles'
export * from './getTriggerReel'
export * from './requests'
export * from './upgradePrompt'
export * from './getAinews'
export * from './getCaptionForNews'
export * from './getMeditationSteps'
export * from './getSlides'
