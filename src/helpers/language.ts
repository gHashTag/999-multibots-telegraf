import { MyContext } from '@/interfaces'

export const isRussian = (ctx: MyContext) => {
  const languageCode = ctx.from?.language_code
  return languageCode === 'ru'
}
