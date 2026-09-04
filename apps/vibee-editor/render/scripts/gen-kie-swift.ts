/**
 * Порождает `apps/vibee-ios/Vibee/KieModels.swift` из двух замеров.
 *
 * ПОЧЕМУ ЭТО СКРИПТ, А НЕ РАЗОВАЯ ПРАВКА. Swift-файл был помечен
 * «СГЕНЕРИРОВАН», когда генератора не существовало — его собрали руками
 * один раз. Пометка без скрипта хуже, чем её отсутствие: она уверяет
 * следующего автора, что правка руками пропадёт, и одновременно не даёт
 * способа перегенерировать. Теперь способ есть.
 *
 * ДВА ИСТОЧНИКА, ОБА ДОБЫТЫ ЗАМЕРОМ, А НЕ ПАМЯТЬЮ:
 *   1. `kie-models.ts` — что модель умеет и жива ли (ответы createTask).
 *   2. прайс KieAI — сколько стоит (POST model-pricing/page).
 * Сшиваются по `kie-price-names.ts` — списку, составленному руками
 * намеренно: см. пояснение в самом файле.
 *
 * Запуск: npx tsx apps/vibee-editor/render/scripts/gen-kie-swift.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { KIE_MODELS } from '../src/agent/kie-models'
import { ИМЯ_В_ПРАЙСЕ, АДРЕС_ПРАЙСА } from '../src/agent/kie-price-names'
import { ВИДИМЫЕ_ИМЕНА } from '../src/agent/kie-display-names'

type Строка = {
  modelDescription: string
  interfaceType: string
  creditPrice: string
  creditUnit: string
  usdPrice: string
}

/** Весь прайс: страницами по 100 — больше сервер не отдаёт (422). */
async function прайс(): Promise<Строка[]> {
  const все: Строка[] = []
  for (let стр = 1; стр <= 20; стр++) {
    const о = await fetch(АДРЕС_ПРАЙСА, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageNum: стр, pageSize: 100 }),
    })
    const т = (await о.json()) as { data?: { records?: Строка[]; total?: number } }
    const порция = т.data?.records ?? []
    все.push(...порция)
    if (!порция.length || все.length >= (т.data?.total ?? 0)) break
  }
  if (!все.length) throw new Error('прайс пуст — генерация остановлена')
  return все
}

/** Как сказать единицу по-русски. Ключи — дословно из ответа KieAI. */
const ЕДИНИЦА: Record<string, string> = {
  'per image': 'за картинку',
  'per video': 'за ролик',
  'per request': 'за запрос',
  'per second': 'за секунду',
  'per megapixel': 'за мегапиксель',
  'per 1000 characters': 'за 1000 знаков',
  'per million tokens': 'за млн токенов',
}

const экр = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

async function main() {
  const строки = await прайс()
  const поИмени = new Map<string, Строка[]>()
  for (const р of строки) {
    const имя = р.modelDescription.split(',')[0].trim()
    поИмени.set(имя, [...(поИмени.get(имя) ?? []), р])
  }

  const записи = KIE_MODELS.map(м => {
    const видимое = ВИДИМЫЕ_ИМЕНА[м.id]
    if (!видимое) throw new Error(`${м.id} без названия — правьте kie-display-names.ts`)
    const имя = ИМЯ_В_ПРАЙСЕ[м.id]
    if (имя === undefined) {
      throw new Error(`${м.id} не сопоставлен с прайсом — правьте kie-price-names.ts`)
    }
    if (имя === null) return { м, видимое, цена: null as null | Строка }
    const rs = поИмени.get(имя)
    if (!rs?.length) throw new Error(`имени «${имя}» нет в прайсе (${м.id})`)
    // САМЫЙ ДЕШЁВЫЙ вариант, и показан он будет со словом «от». Модель с
    // восемью разрешениями не имеет одной цены; назвать дорогую — отпугнуть,
    // назвать любую без «от» — соврать.
    const min = rs.reduce((a, b) => (+a.usdPrice <= +b.usdPrice ? a : b))
    return { м, видимое, цена: min }
  })

  const без = записи.filter(з => !з.цена).length
  const свифт = `import SwiftUI

/**
 * Каталог KieAI на устройстве — ${KIE_MODELS.length} моделей, СГЕНЕРИРОВАН.
 *
 * НЕ ПРАВИТЬ РУКАМИ: правка исчезнет при следующем запуске
 * \`apps/vibee-editor/render/scripts/gen-kie-swift.ts\`.
 *
 * ТРИ ИСТОЧНИКА, ВСЕ ДОБЫТЫ ЗАМЕРОМ:
 *   • умения и живость — \`kie-models.ts\` (дословные ответы createTask);
 *   • цена — прайс KieAI (POST model-pricing/page), снят при генерации;
 *   • связь между ними — \`kie-price-names.ts\`, список составлен руками.
 *
 * ПРО ЦЕНУ. Показан САМЫЙ ДЕШЁВЫЙ вариант модели, поэтому в интерфейсе он
 * идёт со словом «от»: у одной модели бывает восемь цен на разные
 * разрешения и длительности. Единица важна не меньше суммы — «$0.09 за
 * секунду» и «$0.09 за ролик» отличаются в разы. Для ${без} моделей цены в
 * прайсе KieAI нет вовсе (все приостановлены), и там стоит nil — это
 * «провайдер не назвал», а не «мы не нашли».
 *
 * ПРО \`опасная\`. grok-imagine/image-to-video не проверяет вход и СОЗДАЁТ
 * задание даже на пустой запрос. Разведка по ней стоила денег дважды.
 */

struct Модель: Identifiable, Hashable {
  let id: String
  let название: String
  let вид: Вид
  let живая: Bool
  /// Что нужно на вход — словами самого API, переведёнными для человека.
  let требует: String
  /// Принимает пустой вход и берёт деньги. Не пробовать автоматически.
  let опасная: Bool
  /// Цена самого дешёвого варианта в долларах. nil — прайс её не называет.
  let ценаUSD: Double?
  /// За что берут: «за ролик», «за секунду», «за 1000 знаков».
  let единица: String?

  enum Вид: String, CaseIterable { case картинка, видео, звук, липсинк, сценарий }

  var почемуНельзя: String? {
    живая ? nil : "Приостановлена у провайдера — не в вашем аккаунте. Появится сама."
  }

  /// Готовая подпись для экрана. «от» — потому что показан минимум.
  var ценник: String? {
    guard let ценаUSD, let единица else { return nil }
    let сумма = ценаUSD < 0.01
      ? String(format: "%.4f", ценаUSD)
      : String(format: "%.2f", ценаUSD)
    return "от $\\(сумма) \\(единица)"
  }
}

enum КаталогKie {
  static let все: [Модель] = [
${записи
  .map(({ м, видимое, цена }) => {
    const ц = цена ? `${+цена.usdPrice}` : 'nil'
    const е = цена ? `"${экр(ЕДИНИЦА[цена.creditUnit] ?? цена.creditUnit)}"` : 'nil'
    return `    Модель(id: "${экр(м.id)}", название: "${экр(видимое.название)}", вид: .${видимое.вид}, живая: ${м.state === 'live'}, требует: "${экр(видимое.требует)}", опасная: ${видимое.опасная === true}, ценаUSD: ${ц}, единица: ${е}),`
  })
  .join('\n')}
  ]

  static func поВиду(_ в: Модель.Вид) -> [Модель] { все.filter { $0.вид == в } }
  static var живые: [Модель] { все.filter { $0.живая } }
}
`
  const куда = path.join(__dirname, '../../../vibee-ios/Vibee/KieModels.swift')
  fs.writeFileSync(куда, свифт)

  /**
   * ВТОРОЙ ВЫХОД: цены для сервера, из ТОГО ЖЕ прохода.
   *
   * Биллинг знал одну цену на вид — `OPERATION_COST_USD.lipsync_generate` и
   * так далее. Пока к оплате допускалась одна модель на вид, это совпадало с
   * правдой. Как только допускаются все, одна константа начинает врать: у
   * липсинка себестоимость расходится в девять раз (0.015 против 0.135), и
   * общая цена означала бы либо переплату человека, либо убыток владельца.
   *
   * Таблица ГЕНЕРИРУЕТСЯ здесь, а не пишется руками рядом: иначе появится
   * третья копия прайса (Swift-каталог, эта таблица, чьи-то правки) и
   * разойдётся на первом же обновлении цен у провайдера.
   */
  const ценыTS = `/**
 * Себестоимость моделей KieAI, $ — СГЕНЕРИРОВАНО.
 *
 * НЕ ПРАВИТЬ РУКАМИ: правка исчезнет при следующем запуске
 * \`scripts/gen-kie-swift.ts\`. Источник — прайс KieAI (POST
 * model-pricing/page), тот же проход, что собирает Swift-каталог.
 *
 * Значение — САМЫЙ ДЕШЁВЫЙ вариант модели (у одной модели бывает восемь цен
 * на разные разрешения), поэтому в интерфейсе оно показано со словом «от».
 * \`null\` — провайдер цены не назвал; такую модель к оплате не допускаем:
 * назвать сумму до нажатия мы не сможем.
 */
export const СЕБЕСТОИМОСТЬ_USD: Record<string, number | null> = {
${записи
  .map(({ м, цена }) => `  '${экр(м.id)}': ${цена ? +цена.usdPrice : null},`)
  .join('\n')}
}

/** Единица измерения цены: «за секунду», «за картинку» и т. п. */
export const ЕДИНИЦА_ЦЕНЫ: Record<string, string | null> = {
${записи
  .map(
    ({ м, цена }) =>
      `  '${экр(м.id)}': ${цена ? `'${экр(ЕДИНИЦА[цена.creditUnit] ?? цена.creditUnit)}'` : null},`
  )
  .join('\n')}
}
`
  const кудаЦены = path.join(__dirname, '../src/agent/kie-prices.generated.ts')
  fs.writeFileSync(кудаЦены, ценыTS)

  console.log(`записано ${записи.length} моделей, из них без цены ${без}`)
}

main().catch(e => {
  console.error(String(e))
  process.exit(1)
})
