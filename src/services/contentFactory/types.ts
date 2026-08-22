/**
 * Контент-завод: типы и контракт стадий.
 *
 * Завод собирает рилс из текста за один проход, каждая стадия — чистая
 * функция `(вход, ctx) => артефакт`, результат кладётся в манифест. Манифест
 * лежит рядом с артефактами в storage, поэтому прогон возобновляем: повтор с
 * тем же входом не тратит деньги заново.
 *
 * Почему стадии, а не один скрипт: каждая внешняя стадия платная и падает
 * по-разному (omni-human отдаёт транзиентные InvalidTimestamp и «Failed to
 * upload», whisperx иногда возвращает пустые слова). Возобновление по стадиям —
 * единственный способ не платить дважды за уже сделанное.
 */

/** Канон рилса. Каждый — свой шаблон Remotion, свои цвета и свой звук. */
export type CanonId = 'noir' | 'promo' | 'blog'

export interface CanonSpec {
  id: CanonId
  /** Точка входа Remotion (относительно apps/vibee-editor/render). */
  entry: string
  /** id композиции внутри этой точки входа. */
  composition: string
  /** Референс лица для img2img: ключ в storage (без базового URL). */
  faceRef: string
  /** Промпты планов: ключ → законченный промпт для flux-kontext-pro. */
  shots: Record<string, string>
  /** Фоновая музыка: ключ в storage либо null, если канон без музыки. */
  music: string | null
  musicVolume: number
  /** Эмоция голоса MiniMax: блог говорит calm, промо и клуб — happy. */
  voiceEmotion: 'calm' | 'happy' | 'neutral'
}

/** Заказ на рилс — единственное, что пишет человек. */
export interface ReelOrder {
  canon: CanonId
  /** Текст озвучки. Из него же считается хэш прогона. */
  script: string
  language: 'ru' | 'en'
  /** Порядок планов в монтаже; имена берутся из CanonSpec.shots. */
  shotPlan?: string[]
  /** Подписи финальной карточки/бренда — перекрывают дефолт канона. */
  brand?: Record<string, string>
  /** Кому отдать готовый файл (Telegram chat_id). Пусто — не отправлять. */
  deliverTo?: string
}

/** Артефакт стадии: всегда публичный URL, потому что дальше его тянет Chrome. */
export interface Artifact {
  url: string
  /** Локальный путь, если файл ещё лежит в рабочем каталоге прогона. */
  localPath?: string
  meta?: Record<string, unknown>
}

export interface Caption {
  text: string
  startMs: number
  endMs: number
}

/** Отрезок монтажа: план + границы по времени исходной дорожки. */
export interface Cut {
  shot: string
  startSec: number
  endSec: number
}

export type StageName =
  | 'voice'
  | 'scenes'
  | 'lipsync'
  | 'captions'
  | 'compose'
  | 'render'
  | 'deliver'

/** Состояние прогона. Пишется в storage после КАЖДОЙ стадии. */
export interface Manifest {
  runId: string
  /** sha256 от канона + текста + языка: тот же вход → тот же прогон. */
  inputHash: string
  order: ReelOrder
  createdAt: string
  updatedAt: string
  stages: Partial<{
    voice: { audio: Artifact; durationSec: number }
    scenes: Record<string, Artifact>
    lipsync: Record<string, Artifact>
    captions: { words: Caption[] }
    compose: { track: Artifact; cuts: Cut[] }
    render: { video: Artifact }
    deliver: { chatId: string; messageId: number }
  }>
  /** Что стадия сделать не смогла. Пустой массив — не то же, что отсутствие. */
  failures: { stage: StageName; message: string; at: string }[]
}

/** Контекст прогона: всё, что стадии нужно знать о внешнем мире. */
export interface FactoryContext {
  runId: string
  canon: CanonSpec
  order: ReelOrder
  /** Рабочий каталог прогона на диске. */
  workDir: string
  /** Префикс в бакете images, куда кладутся артефакты прогона. */
  storagePrefix: string
  /** Публичная база storage — сюда Chrome ходит за медиа при рендере. */
  publicBase: string
  log: (msg: string, extra?: Record<string, unknown>) => void
}

export class StageError extends Error {
  constructor(
    public stage: StageName,
    message: string,
    public retryable = false
  ) {
    super(message)
    this.name = 'StageError'
  }
}
