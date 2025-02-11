import { starCost } from '@/price'
import { MyContext } from '../../interfaces'
import {
  conversionRates,
  promptGenerationCost,
  minCost,
  maxCost,
  imageNeuroGenerationCost,
  textToVideoCost,
  speechGenerationCost,
  textToSpeechCost,
  imageToVideoCost,
} from '@/scenes/checkBalanceScene'

export async function priceCommand(ctx: MyContext) {
  console.log('CASE: priceCommand')
  const isRu = ctx.from?.language_code === 'ru'

  const message = isRu
    ? `
    <b>💰 Стоимость всех услуг:</b>
    - 🧠 Обучение модели за 1 шаг: ${conversionRates.costPerStepInStars.toFixed(
      2
    )} ⭐️
    - ✍️ Генерация промпта: ${promptGenerationCost.toFixed(2)} ⭐️
    - 🖼️ Генерация изображения: от ${minCost.toFixed(2)} до ${maxCost.toFixed(
        2
      )} ⭐️
    - 🤖 Нейро-генерация изображения: ${imageNeuroGenerationCost.toFixed(2)} ⭐️
    - 🎥 Текст в видео: ${textToVideoCost.toFixed(2)} ⭐️
    - 🎤 Голос: ${speechGenerationCost.toFixed(2)} ⭐️
    - 🗣️ Текст в речь: ${textToSpeechCost.toFixed(2)} ⭐️
    - 📽️ Изображение в видео: ${imageToVideoCost.toFixed(2)} ⭐️

    <b>💵 Стоимость звезды:</b> ${(starCost * 99).toFixed(2)} руб
    💵 Пополнение баланса /buy
    `
    : `
    <b>💰 Price of all services:</b>
    - 🧠 Training model: ${conversionRates.costPerStepInStars.toFixed(2)} ⭐️
    - ✍️ Prompt generation: ${promptGenerationCost.toFixed(2)} ⭐️
    - 🖼️ Image generation: from ${minCost.toFixed(2)} to ${maxCost.toFixed(
        2
      )} ⭐️
    - 🤖 Neuro-image generation: ${imageNeuroGenerationCost.toFixed(2)} ⭐️
    - 🎥 Text to video: ${textToVideoCost.toFixed(2)} ⭐️
    - 🎤 Voice: ${speechGenerationCost.toFixed(2)} ⭐️
    - 🗣️ Text to speech: ${textToSpeechCost.toFixed(2)} ⭐️
    - 📽️ Image to video: ${imageToVideoCost.toFixed(2)} ⭐️

    <b>💵 Star cost:</b> ${starCost.toFixed(2)} $
    💵 Top up balance /buy
    `
  //
  await ctx.reply(message, { parse_mode: 'HTML' })
}
