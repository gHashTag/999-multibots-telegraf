import { MyContext } from '@/interfaces'
import { imageModelPrices } from '@/price/models/imageModelPrices'

export async function validateAndCalculateImageModelPrice(
  imageModel: string,
  availableModels: string[],
  currentBalance: number,
  isRu: boolean,
  ctx: MyContext
): Promise<number | null> {
  if (!imageModel || !availableModels.includes(imageModel)) {
    await ctx.reply(
      isRu
        ? 'Пожалуйста, выберите корректную модель'
        : 'Please choose a valid model'
    )
    return null
  }

  const modelInfo = imageModelPrices[imageModel]
  console.log('modelInfo', modelInfo)
  if (!modelInfo) {
    await ctx.reply(
      isRu
        ? 'Ошибка: неверная модель изображения.'
        : 'Error: invalid image model.'
    )
    return null
  }

  const price = modelInfo.costPerImage
  ctx.session.paymentAmount = price
  if (currentBalance < price) {
    await ctx.reply(
      isRu ? 'Недостаточно средств на балансе' : 'Insufficient balance'
    )
    return null
  }

  return price
}
