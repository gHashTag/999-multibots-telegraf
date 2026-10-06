/**
 * ДВА ПРИЁМА TELEGRAM, БЕЗ КОТОРЫХ ДОЛГИЙ ОТВЕТ ВЫГЛЯДИТ ПОЛОМКОЙ.
 *
 * Владелец: «изучи все лучшие фишки телеграм и сделай лучше UI/UX». Самое
 * заметное здесь — не украшения, а две особенности платформы, о которые
 * разбивается любой медленный или длинный ответ.
 *
 * 1. «ПЕЧАТАЕТ…» ЖИВЁТ ПЯТЬ СЕКУНД.
 *
 *    `sendChatAction('typing')` гаснет через ~5 с. Бот посылал его ОДИН раз,
 *    а виток агента с инструментами длится до трёх минут. Значит человек
 *    видел признак работы пять секунд, а потом — тишину, неотличимую от
 *    зависшего бота. Действие надо повторять, пока идёт работа.
 *
 * 2. СООБЩЕНИЕ ОБРЕЗАЕТСЯ НА 4096 СИМВОЛАХ.
 *
 *    Не «обрезается» даже — Telegram ОТКАЗЫВАЕТ в отправке. Развёрнутый
 *    ответ агента (разбор ленты, план на неделю, список лидов) легко
 *    перешагивает предел, и человек не получал НИЧЕГО: ни ответа, ни
 *    объяснения. Длинное надо резать на части — по границам абзацев, а не
 *    посреди слова.
 */

/** Предел Telegram на текст одного сообщения. */
export const ПРЕДЕЛ_СООБЩЕНИЯ = 4096

/**
 * Запас под служебную пометку «(1/3)» и на разницу в подсчёте длины.
 *
 * Telegram считает длину в UTF-16, и эмодзи занимают две единицы. Резать
 * ровно по 4096 значит иногда получать отказ на пустом месте.
 */
const ЗАПАС = 96

/**
 * Разбить длинный ответ на сообщения.
 *
 * Режем по абзацам, потом по строкам, и только в крайнем случае по символам:
 * разрыв посреди фразы читается как обрыв связи, а не как продолжение.
 */
export function разбитьДлинное(
  текст: string,
  предел = ПРЕДЕЛ_СООБЩЕНИЯ - ЗАПАС
): string[] {
  const целое = (текст ?? '').trim()
  if (!целое) return []
  if (целое.length <= предел) return [целое]

  const части: string[] = []
  let текущая = ''

  const выложить = () => {
    if (текущая.trim()) части.push(текущая.trim())
    текущая = ''
  }

  for (const абзац of целое.split('\n\n')) {
    // Абзац сам по себе длиннее предела — режем его по строкам.
    if (абзац.length > предел) {
      выложить()
      let кусок = ''
      for (const строка of абзац.split('\n')) {
        if ((кусок + '\n' + строка).length > предел) {
          if (кусок.trim()) части.push(кусок.trim())
          кусок = ''
          // И строка бывает длиннее предела — тогда уже по символам.
          let остаток = строка
          while (остаток.length > предел) {
            части.push(остаток.slice(0, предел))
            остаток = остаток.slice(предел)
          }
          кусок = остаток
        } else {
          кусок = кусок ? `${кусок}\n${строка}` : строка
        }
      }
      if (кусок.trim()) части.push(кусок.trim())
      continue
    }
    if ((текущая + '\n\n' + абзац).length > предел) выложить()
    текущая = текущая ? `${текущая}\n\n${абзац}` : абзац
  }
  выложить()
  return части
}

/**
 * Держать «печатает…» живым, пока идёт работа.
 *
 * Возвращает функцию остановки. Ошибки отправки действия глотаются
 * НАМЕРЕННО: если бот не может показать индикатор, это не повод не отвечать
 * — а именно так и вышло бы, брось мы исключение из фонового таймера.
 */
export function держатьПечатает(
  ctx: { sendChatAction: (a: ChatAction) => Promise<unknown> },
  каждыеМс = 4000
): StopTyping {
  // What the person sees can change while it runs: "sending a photo…" while
  // a picture tool works, back to "typing…" after it (#3665).
  let action: ChatAction = 'typing'
  const тик = () => {
    void ctx.sendChatAction(action).catch(() => {})
  }
  тик()
  const таймер = setInterval(тик, каждыеМс)
  // unref, чтобы висящий индикатор не держал процесс при остановке сервиса.
  ;(таймер as { unref?: () => void }).unref?.()
  let stopped = false
  const stop = (() => {
    stopped = true
    clearInterval(таймер)
  }) as StopTyping
  stop.setAction = next => {
    if (stopped || next === action) return
    action = next
    тик() // cyrillic-ok: pre-existing identifier
  }
  return stop
}

/** The chat actions a running agent turn shows. */
export type ChatAction =
  | 'typing'
  | 'upload_photo'
  | 'upload_video'
  | 'upload_voice'

/** Stops the indicator; `setAction` switches what it shows meanwhile. */
export type StopTyping = (() => void) & {
  setAction: (action: ChatAction) => void
}

/*
 * Which action a tool shows (#3665, #3683). Telegram's own words for the
 * work: "sending a photo…" for a picture, "sending a video…" for a clip or a
 * lip-sync, "recording a voice message…" for speech. A 70 s image_edit used
 * to look exactly like a slow text answer.
 *
 * An explicit map, not a guess from the name: `reel_analyze` only reads a
 * reel, `crm_deliver_photo` draws one. Every render tool whose name sounds
 * like media has an entry here -- a test reads the render's tool registry and
 * turns red on a new one without it. `typing` entries are deliberate: the
 * tool sounds like media but makes none (it reads, lists, or only proposes).
 */
export const TOOL_ACTIONS: Readonly<Record<string, ChatAction>> = {
  image_generate: 'upload_photo',
  image_edit: 'upload_photo',
  crm_deliver_photo: 'upload_photo',
  agent_avatars_make: 'upload_photo',
  video_generate: 'upload_video',
  lipsync_generate: 'upload_video',
  story_reel: 'upload_video',
  crm_story_reel: 'upload_video',
  my_story_reel: 'upload_video',
  split_reel: 'upload_video',
  reel_render: 'upload_video',
  audio_generate: 'upload_voice',
  voice_clone_speak: 'upload_voice',
  crm_voice_clone: 'upload_voice',
  // Sound like media, make none.
  reel_analyze: 'typing',
  crm_portrait_rescue: 'typing',
  crm_client_avatars: 'typing',
  crm_lead_media: 'typing',
  tg_fetch_media: 'typing',
  tg_media: 'typing',
  tg_send_video: 'typing',
  tg_send_voice: 'typing',
  tg_send_album: 'typing',
  my_assets: 'typing',
  my_renders: 'typing',
  render_status: 'typing',
}

export function actionForTool(name: string | null | undefined): ChatAction {
  if (!name) return 'typing'
  // hasOwn: a name like "constructor" must not read Object.prototype.
  if (Object.hasOwn(TOOL_ACTIONS, name)) return TOOL_ACTIONS[name]
  // A tool newer than this map still gets the obvious action.
  if (name.startsWith('image_')) return 'upload_photo'
  if (name.startsWith('video_')) return 'upload_video'
  return 'typing'
}

/** Latin alias for callers that must stay free of Cyrillic identifiers. */
export const splitLongAnswer = разбитьДлинное // cyrillic-ok: pre-existing helper name

/** Latin alias: keep "typing…" alive until the returned stop is called. */
export const keepTyping = держатьПечатает // cyrillic-ok: pre-existing helper name
