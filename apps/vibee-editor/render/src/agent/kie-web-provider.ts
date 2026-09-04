import { KIE_MODELS } from './kie-models'
import { ВИДИМЫЕ_ИМЕНА } from './kie-display-names'
import { priceForKieModel } from './billing-shared'

export type KieWebMediaKind = 'image' | 'video' | 'audio' | 'lipsync'

const ВИД_К_KIND: Record<string, KieWebMediaKind> = {
  картинка: 'image',
  видео: 'video',
  звук: 'audio',
  липсинк: 'lipsync',
}

/**
 * ВСЕ модели KieAI, допущенные к оплате — а не одна на вид.
 *
 * Здесь стояла ровно одна проверенная модель на каждый вид. Это защищало от
 * траты на непроверенном пути, но ценой продукта: каталог показывал 45 живых
 * моделей, сервер выполнял 4, и выбор был обещанием, которого никто не
 * собирался исполнять.
 *
 * Теперь допущено всё, что удовлетворяет ТРЁМ условиям, и каждое из них —
 * про деньги или про честность, а не про вкус:
 *
 *   1. `live` у провайдера. Приостановленная модель заберёт деньги и не
 *      вернёт результат.
 *   2. ЦЕНА ИЗВЕСТНА. Пять моделей из сорока восьми провайдер не оценил
 *      вовсе; взять с человека неизвестно сколько нельзя, а назвать сумму до
 *      нажатия — нечем.
 *   3. НЕ помечена опасной. `grok-imagine/image-to-video` создаёт ПЛАТНОЕ
 *      задание даже на пустой запрос — разведка по ней стоила денег дважды.
 *      Такую нельзя допускать к оплате ни при каком балансе.
 */
export const KIE_WEB_MODELS: Record<KieWebMediaKind, ReadonlySet<string>> =
  (() => {
    const из: Record<KieWebMediaKind, Set<string>> = {
      image: new Set(),
      video: new Set(),
      audio: new Set(),
      lipsync: new Set(),
    }
    for (const м of KIE_MODELS) {
      if (м.state !== 'live') continue
      const видимое = ВИДИМЫЕ_ИМЕНА[м.id]
      if (!видимое || видимое.опасная === true) continue
      const kind = ВИД_К_KIND[видимое.вид]
      if (!kind) continue
      if (priceForKieModel(м.id) == null) continue
      из[kind].add(м.id)
    }
    return из
  })()

export function reviewedKieModel(
  kind: KieWebMediaKind,
  requested: unknown
): string | null {
  if (typeof requested !== 'string' || !requested.startsWith('kie/')) {
    return null
  }
  const model = requested.slice(4)
  if (!KIE_WEB_MODELS[kind].has(model)) {
    throw new Error(`Kie.ai model is not enabled for ${kind}`)
  }
  return model
}

/**
 * Вход для KieAI, собранный ПО КОНТРАКТУ КОНКРЕТНОЙ МОДЕЛИ.
 *
 * Раньше на весь вид шла одна форма — та, что подходит одной допущенной
 * модели. Пока модель была одна, это работало. Как только допущены все,
 * форма начала не совпадать: `google/imagen4` отвечает
 * «aspect_ratio cannot be empty», а мы слали только `prompt`; человек видел
 * отказ там, где модель исправна и готова работать.
 *
 * Контракт берётся из `needs` каталога — это ДОСЛОВНЫЕ ответы KieAI на пробу,
 * а не наши догадки о том, что модель хочет. Поле, которого модель не просила,
 * не отправляется: лишнее поле у части моделей само по себе повод для отказа.
 *
 * Чего эта функция НЕ делает: не выдумывает значения. Если контракт требует
 * поле, которого у нас нет (`speakers` у многоголосого TTS), заявка не
 * собирается и вызывающий получает null — отказать до траты честнее, чем
 * послать заведомо неполный запрос и заплатить за отказ.
 */
export function kieInputFor(
  modelId: string,
  доступно: Record<string, unknown>
): Record<string, unknown> | null {
  const м = KIE_MODELS.find(x => x.id === modelId)
  const контракт = м?.needs ?? []
  // Контракт неизвестен (проба не назвала полей) — шлём то, что есть, и
  // позволяем провайдеру ответить. Пустая заявка хуже: она точно не сработает.
  if (!контракт.length) return { ...доступно }

  const вход: Record<string, unknown> = {}
  for (const поле of контракт) {
    const v = доступно[поле]
    if (v === undefined || v === null || v === '') return null
    вход[поле] = v
  }
  // Необязательные, но осмысленные для вида: отправляем только те, что
  // модель уже назвала в контракте, — см. выше про лишние поля.
  return вход
}
