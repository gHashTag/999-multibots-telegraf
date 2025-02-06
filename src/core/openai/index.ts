import OpenAI from 'openai'

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set')
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export * from './getSubtitles'
export * from './getTriggerReel'
export * from './requests'
export * from './upgradePrompt'
export * from './getAinews'
export * from './getCaptionForNews'
export * from './getMeditationSteps'
export * from './getSlides'
