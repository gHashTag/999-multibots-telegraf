import { MyContext } from '@/interfaces'
import { generateAvatarFace } from './adapters/avatarFaceGenerator'
import { formatInputForAvatarFace } from './helpers'

/**
 * Основной файл модуля digitalAvatarFace.
 * Этот модуль отвечает за создание и управление лицом цифрового аватара.
 */

export const createDigitalAvatarFace = async (
  ctx: MyContext,
  inputData: any,
  dependencies: any
): Promise<void> => {
  console.log(
    `Creating digital avatar face for user: ${ctx.from?.username || 'unknown'}`
  )
  const formattedInput = formatInputForAvatarFace(inputData)
  const avatarFaceUrl = await generateAvatarFace(formattedInput)
  await ctx.reply(`Generated avatar face: ${avatarFaceUrl}`)
}
