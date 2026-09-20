/**
 * THE CLIENT REPORT, AS THE OWNER READS IT.
 *
 * Owner: who went where and where they got stuck, so the agent can tell how to
 * work with that client next. So the report answers exactly three questions
 * and nothing else: where people went, where they stopped, who went quiet.
 *
 * Rules this file keeps, inherited from the daily-report skill:
 *  - no advice the agent did not derive from these numbers ("run a broadcast"
 *    is a category, not a proposal, so it is not here);
 *  - an empty section prints a dash, it does not disappear, so the owner can
 *    tell "nothing happened" from "not measured";
 *  - a scene with no Russian label prints its raw id. A guessed label reads
 *    like a fact.
 */

import type { ClientEventRow } from '@/core/telemetry/clientEvents'

/**
 * Human names for the scenes the owner asks about most. Deliberately partial:
 * `SCENE_RU` is a courtesy, `sceneLabel` falls back to the id.
 */
export const SCENE_RU: Record<string, string> = {
  main_menu: 'Главное меню',
  menuScene: 'Главное меню',
  startScene: 'Старт',
  subscribe: 'Подписка',
  subscription_scene: 'Подписка',
  balance: 'Баланс',
  balance_scene: 'Баланс',
  top_up_balance: 'Пополнение',
  payment_scene: 'Оплата',
  starPaymentScene: 'Оплата звёздами',
  rublePaymentScene: 'Оплата рублями',
  cryptoPaymentScene: 'Оплата криптой',
  get_ru_bill_wizard: 'Счёт в рублях',
  neuro_photo: 'Нейрофото',
  neuro_photo_v2: 'Нейрофото 2',
  text_to_image: 'Текст в картинку',
  flux_kontext: 'Flux Kontext',
  image_to_video: 'Картинка в видео',
  text_to_video: 'Текст в видео',
  text_to_speech: 'Озвучка',
  neuro_audio: 'Аудио',
  lip_sync_model_selection: 'Липсинк: выбор модели',
  veed_fabric_lipsync: 'Липсинк',
  ai_reels_wizard: 'Рилсы',
  ai_reels_entry: 'Рилсы: вход',
  morphing_wizard: 'Морфинг',
  ai_photoshop_scene: 'Фотошоп',
  faceSwapWizard: 'Замена лица',
  avatar: 'Аватар',
  chat_with_avatar: 'Чат с аватаром',
  trainFluxModelWizard: 'Обучение модели',
  uploadTrainFluxModelScene: 'Загрузка для обучения',
  select_model_wizard: 'Выбор модели',
  select_ai_text_model: 'Выбор текстовой модели',
  inviteScene: 'Приглашения',
  helpScene: 'Помощь',
  techSupportScene: 'Поддержка',
  changeLanguageScene: 'Смена языка',
  price: 'Цены',
  stats: 'Статистика',
}

const MONTHS_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

/** Scenes that are a resting place, not a place someone got stuck in. */
const NOT_A_STALL = new Set([
  'main_menu',
  'menuScene',
  'startScene',
  'helpScene',
])

export function sceneLabel(id: string | null): string {
  if (!id) return 'вне сцен'
  return SCENE_RU[id] || id
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function personLabel(row: {
  username: string | null
  telegramId: string
}): string {
  return row.username ? `@${row.username}` : `id ${row.telegramId}`
}

function dateLineRu(now: number, tz: string): string {
  let key: string
  try {
    key = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(now))
  } catch {
    key = new Date(now).toISOString().slice(0, 10)
  }
  const [, m, d] = key.split('-').map(Number)
  return `${d} ${MONTHS_RU[(m || 1) - 1]}`
}

/** "12 мин назад" / "4 ч назад" / "2 дн назад". */
export function agoRu(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return `${min} мин назад`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} ч назад`
  return `${Math.round(h / 24)} дн назад`
}

export interface PersonTrack {
  telegramId: string
  username: string | null
  steps: number
  scenes: string[]
  lastScene: string | null
  lastAt: number
}

/** One track per person: what they touched, in order, and where they ended. */
export function trackPeople(rows: ClientEventRow[]): PersonTrack[] {
  const byId = new Map<string, PersonTrack>()
  for (const r of rows) {
    let t = byId.get(r.telegramId)
    if (!t) {
      t = {
        telegramId: r.telegramId,
        username: r.username,
        steps: 0,
        scenes: [],
        lastScene: null,
        lastAt: 0,
      }
      byId.set(r.telegramId, t)
    }
    if (r.username) t.username = r.username
    t.steps += 1
    if (r.toScene && t.scenes[t.scenes.length - 1] !== r.toScene) {
      t.scenes.push(r.toScene)
    }
    if (r.at >= t.lastAt) {
      t.lastAt = r.at
      t.lastScene = r.toScene
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.steps - a.steps)
}

export interface TelemetryWindow {
  /** Events in the reported day, oldest first. */
  rows: ClientEventRow[]
  /** Events in the day before it — used for "new" and "went quiet". */
  previousRows: ClientEventRow[]
  now: number
  tz: string
  /** A person idle at least this long in a working scene counts as stalled. */
  stallMinutes?: number
}

export function buildClientTelemetryReport(w: TelemetryWindow): string {
  const stallMs = (w.stallMinutes ?? 30) * 60000
  const today = trackPeople(w.rows)
  const before = trackPeople(w.previousRows)
  const beforeIds = new Set(before.map(t => t.telegramId))
  const todayIds = new Set(today.map(t => t.telegramId))

  const fresh = today.filter(t => !beforeIds.has(t.telegramId))
  const gone = before.filter(t => !todayIds.has(t.telegramId))

  const lines: string[] = [
    `👣 <b>Клиенты · ${esc(dateLineRu(w.now, w.tz))}</b>`,
    `За сутки: ${today.length} чел. · ${w.rows.length} шагов · новых ${fresh.length}`,
  ]

  // Where people went.
  const visits = new Map<string, { hits: number; people: Set<string> }>()
  for (const r of w.rows) {
    if (!r.toScene) continue
    let v = visits.get(r.toScene)
    if (!v) visits.set(r.toScene, (v = { hits: 0, people: new Set() }))
    v.hits += 1
    v.people.add(r.telegramId)
  }
  const top = Array.from(visits.entries())
    .sort(
      (a, b) => b[1].people.size - a[1].people.size || b[1].hits - a[1].hits
    )
    .slice(0, 8)
  lines.push('', '<b>Куда заходили:</b>')
  if (!top.length) lines.push('—')
  top.forEach(([id, v], i) => {
    lines.push(
      `${i + 1}. ${esc(sceneLabel(id))} — ${v.people.size} чел. · ${v.hits} входов`
    )
  })

  // Where they stopped.
  const stalled = today
    .filter(
      t =>
        t.lastScene &&
        !NOT_A_STALL.has(t.lastScene) &&
        w.now - t.lastAt >= stallMs
    )
    .sort((a, b) => a.lastAt - b.lastAt)
    .slice(0, 10)
  lines.push('', '<b>На чём встали:</b>')
  if (!stalled.length) lines.push('—')
  stalled.forEach((t, i) => {
    lines.push(
      `${i + 1}. ${esc(personLabel(t))} · ${esc(sceneLabel(t.lastScene))} · ${esc(agoRu(w.now - t.lastAt))}`
    )
  })

  // The per-person picture the agent works from.
  lines.push('', '<b>Кто чем занимался:</b>')
  if (!today.length) lines.push('—')
  today.slice(0, 10).forEach(t => {
    const path = t.scenes.slice(-4).map(sceneLabel).join(' → ') || 'вне сцен'
    const mark = beforeIds.has(t.telegramId) ? '' : ' · новый'
    lines.push(
      `• ${esc(personLabel(t))} · ${t.steps} шагов${mark}\n  ${esc(path)}`
    )
  })
  if (today.length > 10) {
    lines.push(`…и ещё ${today.length - 10} чел.`)
  }

  // Who was here yesterday and is not here today.
  lines.push('', '<b>Замолчали (были вчера, сегодня нет):</b>')
  if (!gone.length) lines.push('—')
  else {
    lines.push(
      gone
        .slice(0, 12)
        .map(t => esc(personLabel(t)))
        .join(', ') + (gone.length > 12 ? ` …и ещё ${gone.length - 12}` : '')
    )
  }

  lines.push(
    '',
    'Считается по переходам между сценами: одна строка на переход, не на сообщение.'
  )
  return lines.join('\n')
}

/** What the owner gets when the telemetry database cannot answer. */
export function unavailableReport(
  now: number,
  tz: string,
  why: string
): string {
  return [
    `👣 <b>Клиенты · ${esc(dateLineRu(now, tz))}</b>`,
    'Не посчитано: база телеметрии недоступна.',
    `Причина: ${esc(why)}`,
    'Цифры не показываю — ноль здесь означал бы «никто не заходил», а это не так.',
  ].join('\n')
}
