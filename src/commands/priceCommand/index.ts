import { SYSTEM_CONFIG } from '@/price/constants/index'
import { type MyContext } from '../../interfaces'
import { minCost, maxCost, modeCosts } from '@/price/helpers/modelsCost'
import { conversionRates } from '@/price/priceCalculator'

// Helper function to handle potential function types in modeCosts
const getCost = (cost: number | ((param?: any) => number)): string => {
  if (typeof cost === 'function') {
    // Assuming the function doesn't need parameters for this general display
    // If parameters are needed, this logic might need adjustment based on context
    return cost().toFixed(2)
  }
  return cost.toFixed(2)
}

export async function priceCommand(ctx: MyContext) {
  console.log('CASE: priceCommand')
  const isRu = ctx.from?.language_code === 'ru'

  const message = isRu
    ? `
    <b>💰 Стоимость всех услуг:</b>
    - 🧠 Обучение модели за 1 шаг: ${conversionRates.costPerStepInStars} ⭐️
    - ✍️ Генерация промпта: ${getCost(modeCosts.text_to_image)} ⭐️
    - 🖼️ Генерация изображения: от ${minCost} до ${maxCost} ⭐️
    - 🤖 Нейро-генерация изображения: ${getCost(modeCosts.image_to_prompt)} ⭐️
    - 🎥 Текст в видео: ${getCost(modeCosts.text_to_video)} ⭐️
    - 🎤 Голос: ${getCost(modeCosts.voice)} ⭐️
    - 🗣️ Текст в речь: ${getCost(modeCosts.text_to_speech)} ⭐️
    - 📽️ Изображение в видео: ${getCost(modeCosts.image_to_video)} ⭐️

    <b>💵 Стоимость звезды:</b> ${(SYSTEM_CONFIG.starCost * 99).toFixed(2)} руб
    💵 Пополнение баланса /buy
    `
    : `
    <b>💰 Price of all services:</b>
    - 🧠 Training model: ${conversionRates.costPerStepInStars} ⭐️
    - ✍️ Prompt generation: ${getCost(modeCosts.text_to_image)} ⭐️
    - 🖼️ Image generation: from ${minCost} до ${maxCost} ⭐️
    - 🤖 Neuro-image generation: ${getCost(modeCosts.image_to_prompt)} ⭐️
    - 🎥 Text to video: ${getCost(modeCosts.text_to_video)} ⭐️
    - 🎤 Voice: ${getCost(modeCosts.voice)} ⭐️
    - 🗣️ Text to speech: ${getCost(modeCosts.text_to_speech)} ⭐️
    - 📽️ Image to video: ${getCost(modeCosts.image_to_video)} ⭐️

    <b>💵 Star cost:</b> ${SYSTEM_CONFIG.starCost.toFixed(2)} $
    💵 Top up balance /buy
    `

  await ctx.reply(message, { parse_mode: 'HTML' })
}
