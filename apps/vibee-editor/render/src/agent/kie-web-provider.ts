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
