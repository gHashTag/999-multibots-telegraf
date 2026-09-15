import { Markup } from 'telegraf'

/**
 * ONE PROMPT, NOT SIX COPIES.
 *
 * The "choose an action" card was written out six times inside index.ts --
 * three times in the wizard's photo step (photo caption, no-photo fallback,
 * catch-block fallback) and three more in the identical re-prompt further
 * down. All six carried the same keyboard, and the keyboard always offered
 *
 *     🎨 Использовать мой аватар  (cyrillic-ok: the button's own label)
 *
 * whether or not the account HAD an avatar. `getUserPhotoUrl` returns
 * `string | null`; with "strict": false in tsconfig.json the null travelled on
 * silently. Pressing the button then handed that null to the generator, which
 * refused it -- so the bot advertised an action it could not perform, and the
 * person found that out only after choosing it.
 *
 * `hasPhoto` decides here instead. Without a photo the button is not drawn at
 * all, and the caption says why, so the missing option is explained rather
 * than mysteriously absent. Six copies could not be kept in step by hand;
 * this is the one place either of them is written.
 */

export interface AvatarActionCard {
  isRu: boolean
  genderDisplay: string
  modelDisplayName: string
  /** Does the person actually have a usable photo right now? */
  hasPhoto: boolean
}

export const AVATAR_BUTTON_RU = '🎨 Использовать мой аватар'
export const AVATAR_BUTTON_EN = '🎨 Use my avatar'
export const UPLOAD_BUTTON_RU = '📸 Загрузить своё фото'
export const UPLOAD_BUTTON_EN = '📸 Upload my photo'

export function avatarActionKeyboard(isRu: boolean, hasPhoto: boolean) {
  const first = hasPhoto
    ? [
        isRu ? AVATAR_BUTTON_RU : AVATAR_BUTTON_EN,
        isRu ? UPLOAD_BUTTON_RU : UPLOAD_BUTTON_EN,
      ]
    : [isRu ? UPLOAD_BUTTON_RU : UPLOAD_BUTTON_EN]

  return Markup.keyboard([
    first,
    [isRu ? '🔙 Назад к выбору модели' : '🔙 Back to model selection'],
  ]).resize().reply_markup
}

export function avatarActionCaption({
  isRu,
  genderDisplay,
  modelDisplayName,
  hasPhoto,
}: AvatarActionCard): string {
  // The one line that differs: with a photo the card is describing the image
  // attached above it; without one there is nothing to describe, and the
  // person needs to know an upload is the only way forward.
  const photoLine = hasPhoto
    ? isRu
      ? '📸 <b>Ваше фото для трансформации</b>\n🎨 Я беру ваше фото и трансформирую его в любой стиль!'
      : '📸 <b>Your photo for transformation</b>\n🎨 I take your photo and transform it into any style!'
    : isRu
      ? '📸 <b>Фото профиля не найдено</b>\nВ вашем аккаунте Telegram нет открытой фотографии, поэтому взять её я не могу.\n🎨 Пришлите любой снимок — и я трансформирую его в любой стиль!'
      : '📸 <b>No profile photo found</b>\nYour Telegram account has no visible photo, so I cannot take one from it.\n🎨 Send me any picture and I will transform it into any style!'

  return isRu
    ? `🤖 <b>AI-трансформация готова к запуску!</b>\n\n👤 <b>Выбранный стиль:</b> ${genderDisplay}\n🎯 <b>Выбранная модель:</b> ${modelDisplayName}\n\n${photoLine}\n\n🌟 <b>Демо возможностей бота:</b>\n• Трансформация в стиле популярных персонажей\n• Кинематографическое качество обработки\n• Любые образы на ваш выбор (в полной версии)\n\n🎁 <b>Это БЕСПЛАТНАЯ демонстрация возможностей!</b>\n💰 <b>Полный доступ ко всем функциям бота - после покупки</b>\n\n🎯 Выберите действие:`
    : `🤖 <b>AI transformation ready to start!</b>\n\n👤 <b>Selected style:</b> ${genderDisplay}\n🎯 <b>Selected model:</b> ${modelDisplayName}\n\n${photoLine}\n\n🌟 <b>Bot capabilities demo:</b>\n• Transformation in popular character styles\n• Cinematic quality processing\n• Any styles of your choice (in full version)\n\n🎁 <b>This is a FREE demonstration of capabilities!</b>\n💰 <b>Full access to all bot functions - after purchase</b>\n\n🎯 Choose action:`
}
