import { MyContext } from '@/interfaces'
import { processDigitalAvatarBody } from './services/digitalAvatarBodyService'
import { DigitalAvatarBodyDependencies } from './interfaces/DigitalAvatarBodyDependencies'

/**
 * Основной файл модуля digitalAvatarBody.
 * Этот модуль отвечает за создание и управление цифровым телом аватара.
 */

export const createDigitalAvatarBody = async (
  ctx: MyContext,
  inputData: any,
  dependencies: DigitalAvatarBodyDependencies
): Promise<void> => {
  console.log(
    `Creating digital avatar body for user: ${ctx.from?.username || 'unknown'}`
  )
  await processDigitalAvatarBody(ctx, dependencies, inputData)
}
