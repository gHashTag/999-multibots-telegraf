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
  // ctx.session.paymentAmount is deliberately NOT set here.
  //
  // It used to be, and this line was the only place in the repository that
  // ever gave it a non-zero value -- at VALIDATION time, before any charge,
  // and even before the balance check below. The one place that reads it,
  // CancelButtonService, treats it as "the amount this user was charged" and
  // refunds it. So pressing Cancel after merely picking a model credited stars
  // that were never taken, and it worked even when the balance was too low to
  // afford the model in the first place.
  //
  // The charge for this flow happens later and elsewhere -- inside
  // generateTextToImageDirect via processBalanceOperation -- and that function
  // issues its own refund on failure. The wizard tracks its own figure in
  // ctx.session.imageGenerationPrice. Nothing was relying on this write except
  // the refund that should not have happened.
  //
  // If a real charge ever needs a refund on cancel, the amount must be written
  // AFTER the debit succeeds, by the code that performed it.
  if (currentBalance < price) {
    await ctx.reply(
      isRu ? 'Недостаточно средств на балансе' : 'Insufficient balance'
    )
    return null
  }

  return price
}
