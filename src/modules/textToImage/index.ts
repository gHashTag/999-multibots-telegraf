import { MyContext } from '@/interfaces'
import { generateImageFromText } from './adapters/textToImageAdapter'
import { formatTextForImage } from './helpers'

/**
 * Основной файл модуля textToImage.
 * Этот модуль отвечает за преобразование текста в изображение.
 */

export const createTextToImage = async (
  ctx: MyContext,
  inputData: any,
  dependencies: any
): Promise<void> => {
  console.log(
    `Creating image from text for user: ${ctx.from?.username || 'unknown'}`
  )
  const formattedText = formatTextForImage(inputData.text || '')
  const imageUrl = await generateImageFromText(formattedText)
  await ctx.reply(`Generated image: ${imageUrl}`)
}
