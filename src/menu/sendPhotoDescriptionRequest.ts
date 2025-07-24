import { MyContext } from '../interfaces'
import { createHelpCancelKeyboard } from '@/menu/'
// ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ ЯЗЫКОВ!
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export const sendPhotoDescriptionRequest = async (
  ctx: MyContext,
  isRu: boolean, // Deprecated параметр, игнорируем его
  mode: string
): Promise<void> => {
  // ✅ ИСПОЛЬЗУЕМ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
  const isRuFromState = isRussianFromState(ctx)

  const type =
    mode === 'neuro_photo'
      ? isRuFromState
        ? 'нейрофотографию'
        : 'neurophoto'
      : isRuFromState
        ? 'фотографию'
        : 'photo'

  const message = isRuFromState
    ? `📸 Опишите на английском, какую ${type} вы хотите сгенерировать.`
    : `📸 Describe what kind of ${type} you want to generate in English.`

  await ctx.reply(message, {
    reply_markup: createHelpCancelKeyboard(isRuFromState).reply_markup,
  })
}
