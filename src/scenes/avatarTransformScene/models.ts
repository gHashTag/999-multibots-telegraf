import { Markup } from 'telegraf'

/**
 * THE MODEL LIST, WRITTEN ONCE.
 *
 * Four things in index.ts each held their own idea of which models exist, and
 * they disagreed:
 *
 *   - the card TEXT described two models and ended "Both models are free in
 *     demo mode", in both languages;
 *   - the KEYBOARD under it drew three buttons;
 *   - the display name was a two-branch ternary over three models --
 *
 *         selectedModel === 'flux-kontext'
 *           ? 'FLUX Kontext Max (Google)'
 *           : 'SeeDream-4.5 (ByteDance)'
 *
 *     so anyone who pressed the third button was told, on the next card, that
 *     they had chosen SeeDream-4.5. It was written that way twice;
 *   - the fallback chain was a nested ternary that had to be re-nested for
 *     every model added.
 *
 * All four are derived from AVATAR_MODELS below now. Adding a model is one
 * entry in one array, and there is no place left for a fourth model to be
 * missing from a sentence that counts them.
 */

export type AvatarModelId =
  | 'gpt-image-25'
  | 'flux-kontext'
  | 'seedream45'
  | 'nano-banana'

export interface AvatarModel {
  id: AvatarModelId
  /** The keyboard label. Identical in both languages -- it is a brand name. */
  button: string
  /** What the next card calls it. */
  displayName: string
  bulletsRu: string[]
  bulletsEn: string[]
}

export const AVATAR_MODELS: AvatarModel[] = [
  {
    id: 'gpt-image-25',
    button: '🎨 GPT-Image-2.5 (OpenAI)',
    displayName: 'GPT-Image-2.5 (OpenAI)',
    bulletsRu: [
      'Новейшая модель OpenAI',
      'Лучшее сходство с оригиналом',
      'Вертикальный формат 9:16',
    ],
    bulletsEn: [
      'Newest OpenAI model',
      'Best likeness to the original',
      'Vertical 9:16 format',
    ],
  },
  {
    id: 'flux-kontext',
    button: '🤖 FLUX Kontext Max (Google)',
    displayName: 'FLUX Kontext Max (Google)',
    bulletsRu: [
      'Проверенная технология',
      'Стабильные результаты',
      'Классические стили',
    ],
    bulletsEn: ['Proven technology', 'Stable results', 'Classic styles'],
  },
  {
    id: 'seedream45',
    button: '🎭 SeeDream-4.5 (ByteDance)',
    displayName: 'SeeDream-4.5 (ByteDance)',
    bulletsRu: [
      'Новейшая модель 2025',
      'Креативные возможности',
      'Экспериментальные стили',
    ],
    bulletsEn: [
      'Latest 2025 model',
      'Creative capabilities',
      'Experimental styles',
    ],
  },
  {
    id: 'nano-banana',
    button: '🍌 Nano Banana (Google)',
    displayName: 'Nano Banana (Google)',
    bulletsRu: [
      'Редактирование на базе Gemini',
      'Быстрая обработка',
      'Точечные правки образа',
    ],
    bulletsEn: [
      'Gemini-powered editing',
      'Fast processing',
      'Precise touch-ups',
    ],
  },
]

/** The model a pressed button means, or null if the text is not a button. */
export function avatarModelFromButton(text: string): AvatarModelId | null {
  const hit = AVATAR_MODELS.find(m => m.button === text)
  return hit ? hit.id : null
}

/**
 * What to call the model on the next card. An unknown id falls back to the
 * default model's name rather than to whichever name happens to be second in
 * a ternary -- a session saved before this list changed still reads sensibly.
 */
export function avatarModelDisplayName(id: string | null | undefined): string {
  const hit = AVATAR_MODELS.find(m => m.id === id)
  return (hit || AVATAR_MODELS[0]).displayName
}

export function avatarModelCard(isRu: boolean, genderDisplay: string): string {
  const blocks = AVATAR_MODELS.map(m => {
    const bullets = (isRu ? m.bulletsRu : m.bulletsEn)
      .map(b => `• ${b}`)
      .join('\n')
    return `${m.button}\n${bullets}`
  }).join('\n\n')

  // Counted from the list instead of asserting "both": the sentence used to
  // say two while the keyboard offered three.
  const footer = isRu
    ? `💡 <b>Все ${AVATAR_MODELS.length} модели бесплатны в демо-режиме!</b>`
    : `💡 <b>All ${AVATAR_MODELS.length} models are free in demo mode!</b>`

  return isRu
    ? `🤖 <b>Выбор AI модели для трансформации</b>\n\n👤 <b>Выбранный стиль:</b> ${genderDisplay}\n\n🎯 <b>Выберите технологию генерации:</b>\n\n${blocks}\n\n${footer}`
    : `🤖 <b>Choose AI model for transformation</b>\n\n👤 <b>Selected style:</b> ${genderDisplay}\n\n🎯 <b>Select generation technology:</b>\n\n${blocks}\n\n${footer}`
}

/**
 * Two buttons per row. Four of these labels on one row is what Telegram does
 * with a reply keyboard when you ask it to: it shrinks each to a few
 * characters on a phone.
 */
export function avatarModelKeyboard(isRu: boolean, withCancel: boolean) {
  const rows: string[][] = []
  for (let i = 0; i < AVATAR_MODELS.length; i += 2) {
    rows.push(AVATAR_MODELS.slice(i, i + 2).map(m => m.button))
  }

  rows.push(
    withCancel
      ? [isRu ? 'Отмена' : 'Cancel', isRu ? '🔙 Назад' : '🔙 Back']
      : [isRu ? '🔙 Назад' : '🔙 Back']
  )

  return Markup.keyboard(rows).resize().reply_markup
}

/**
 * Chosen model first, then everyone else in list order. The nested ternary
 * this replaces named three models explicitly; a fourth would have had to be
 * added to three branches, and a fifth to four.
 */
export function avatarModelPriority(
  selected: string | null | undefined
): AvatarModelId[] {
  const ids = AVATAR_MODELS.map(m => m.id)
  const first = ids.find(id => id === selected)
  return first ? [first, ...ids.filter(id => id !== first)] : ids
}
