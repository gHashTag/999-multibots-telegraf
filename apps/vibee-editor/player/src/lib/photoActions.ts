/**
 * ONE-TAP PHOTO ACTIONS FOR THE BLOGGER (spec photo-actions.t27).
 *
 * Owner, 2026-10-09, a client thread: "make the buttons for working with a
 * photo, like in our bot". Every poster that evening was typed out again
 * ("same style, no face, 9:16, the text from the poster") and the agent lost
 * the source photo between turns. A press sends the whole ask, with the photo
 * it is about, in one line. Which actions exist and when the row shows is the
 * spec's; the words of each ask are this host's.
 */
import * as SPEC from '../spec/photo-actions.gen'
import { showChips, sourceOf } from '../spec/photo-actions.logic'

export type PhotoActionId =
  | 'poster_plain'
  | 'poster_face'
  | 'studio'
  | 'variant'
  | 'upscale'
  | 'remove_bg'
  | 'video'
  | 'lipsync'

export const PHOTO_ACTION_IDS = SPEC.ACTION_IDS.split(',') as PhotoActionId[]
export const PHOTO_ACTION_TOOLS = SPEC.ACTION_TOOLS.split(',')

const ASPECT = SPEC.ASPECT

/** The ask each press sends; the photo line is added by `photoActionAsk`. */
export const PHOTO_ACTION_ASKS: Readonly<Record<PhotoActionId, string>> = {
  poster_plain: `Сделай афишу ${ASPECT} в том же стиле, фактуре и орнаменте, что на этом фото, но БЕЗ людей: фон, узоры и крупный читаемый текст события из нашего разговора (название, дата, время). image_edit по этому фото, сразу пришли файл.`,
  poster_face: `Сделай афишу ${ASPECT} с этим человеком (лицо с фото), в стиле фото, с крупным читаемым текстом события из нашего разговора. image_edit по этому фото, сразу пришли файл.`,
  studio: `Перерисуй это фото фотореалистично в студии, лицо то же, формат ${ASPECT}. image_edit, сразу пришли файл.`,
  variant: `Сделай ещё один вариант этой картинки: тот же стиль и текст, другая композиция, ${ASPECT}. image_edit по ней, сразу пришли файл.`,
  upscale: 'Увеличь качество этого фото: image_upscale, сразу пришли файл.',
  remove_bg:
    'Убери фон с этого фото: image_remove_background, сразу пришли файл.',
  video: `Оживи это фото в короткое видео ${ASPECT}: video_generate с этим фото. Назови цену одной строкой и сделай после моего «да».`,
  lipsync:
    'Сделай говорящее видео с этим лицом (lipsync_generate): спроси, какой текст сказать, и назови цену.',
}

const PICTURE_RE =
  /https?:\/\/[^\s<>()[\]"'`]+?\.(?:png|jpe?g|webp|gif)(?=[^A-Za-z0-9]|$)/gi

/** The last picture an assistant answer carried, or null. */
export function lastPicture(
  messages: ReadonlyArray<{ role: string; text: string }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    const found = String(m.text ?? '').match(PICTURE_RE)
    if (found?.length) return found[found.length - 1]
  }
  return null
}

/** Whether the row shows (spec show_chips). */
export function photoRowShown(
  agent: string | null | undefined,
  imageAttached: boolean,
  last: string | null
): boolean {
  return showChips(agent === SPEC.AGENT, imageAttached, last !== null)
}

/**
 * The line a press sends: the ask, and -- when the photo is the last picture
 * of the chat rather than a file attached now -- that picture's address, so
 * the tool gets its image_url (spec source_of).
 */
export function photoActionAsk(
  id: PhotoActionId,
  imageAttached: boolean,
  last: string | null
): string | null {
  const from = sourceOf(imageAttached, last !== null)
  if (from === 0) return null
  const ask = PHOTO_ACTION_ASKS[id]
  return from === 2 ? `${ask}\nФото: ${last}` : ask
}
