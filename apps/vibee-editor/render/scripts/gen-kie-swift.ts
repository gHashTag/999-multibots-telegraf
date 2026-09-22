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
import { KIE_MODELS, NEVER_PROBE } from '../src/agent/kie-models'
import { ИМЯ_В_ПРАЙСЕ, АДРЕС_ПРАЙСА } from '../src/agent/kie-price-names'
import { ПОЛЯ_МАРШРУТА } from '../src/agent/kie-web-provider'
import { ВИДИМЫЕ_ИМЕНА } from '../src/agent/kie-display-names'
// The server's video sale rule, run on the price list this pass fetched.
import { kieVideoSale } from '../src/agent/billing-shared'

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
    const т = (await о.json()) as {
      data?: { records?: Строка[]; total?: number }
    }
    const порция = т.data?.records ?? []
    все.push(...порция)
    if (!порция.length || все.length >= (т.data?.total ?? 0)) break
  }
  if (!все.length) throw new Error('прайс пуст — генерация остановлена')
  return все
}

/** Как сказать единицу по-русски. Ключи — дословно из ответа KieAI. */
/**
 * Единицы, которые НЕЛЬЗЯ превратить в цену одного вызова.
 *
 * Ключи здесь — ДОСЛОВНЫЕ строки KieAI, те же, что в `ЕДИНИЦА` ниже. Первая
 * версия этой проверки сравнивала с `'per 1M tokens'` — строкой, которую я
 * придумал, не посмотрев в ответ. Провайдер пишет `'per million tokens'`, и
 * проверка не сработала бы НИ РАЗУ, молча пропустив ровно ту модель, ради
 * которой писалась.
 */
const НЕПЕРЕВОДИМЫЕ_ЕДИНИЦЫ = new Set(['per million tokens'])

/**
 * Просит ли модель вход, которого экран пока не передаёт.
 *
 * Такая модель не сработает никогда: сборщик входа вернёт null уже после
 * того, как человек нажал и заплатил. Их было семь — по одной-две на каждой
 * платной вкладке, и приложение честно писало «нужно: картинку», отправляя
 * запрос без неё.
 *
 * Признак вычисляется ПО ТОМУ ЖЕ СПИСКУ, что и допуск на сервере
 * (`ПОЛЯ_МАРШРУТА`), поэтому экран и сервер не могут разойтись во мнении.
 */
function входИзвне(м: { id: string; needs?: string[] }): boolean {
  const видимое = ВИДИМЫЕ_ИМЕНА[м.id]
  const kind = ВИД_К_KIND_ГЕН[видимое?.вид ?? '']
  if (!kind) return false
  const умеем = ПОЛЯ_МАРШРУТА[kind]
  return (м.needs ?? []).some(поле => !умеем.includes(поле))
}

/**
 * Просит ли модель ФАЙЛ ОТ ЧЕЛОВЕКА — картинку, видео или звук.
 *
 * Отличается от `входИзвне`: тот означает «маршрут не умеет это передать, не
 * предлагаем модель вовсе», а этот — «умеет, но человек должен сначала
 * выбрать файл». Смешивать нельзя: первое прячет модель, второе гасит кнопку
 * до выбора.
 */
/*
 * `input_urls` added 2026-09-16, with the first model that uses it.
 *
 * GPT Image 2.5 names its source `input_urls` where nano-banana names it
 * `image_urls` -- kie-image.ts has said so since the model was documented.
 * The list here knew only the nano-banana spelling, so the first entry that
 * edits a photo through the new contract was generated as needing no source
 * at all: the app would light the button with nothing to edit, and the
 * refusal would come from the provider after the person had waited.
 *
 * That is the failure the comment above this list warns about, arriving
 * through a field name rather than through a wrong flag.
 */
const ПОЛЯ_ИСХОДНИКА = [
  'image_url',
  'image_urls',
  'input_urls',
  'image',
  'video_url',
  'audio_url',
]

/*
 * DANGER IS DECIDED BY THE LIST THAT DEFINES IT.
 *
 * `опасная` used to be read only from kie-display-names.ts, a hand-kept file,
 * while NEVER_PROBE in kie-models.ts is what actually stops a probe. Two lists
 * that must agree and nothing making them: adding a model to NEVER_PROBE left
 * the app calling it safe, and the drift would show only as a bill.
 *
 * NEVER_PROBE is the source now; a manual flag can still raise the warning,
 * never lower it.
 */
function fencedFromProbes(id: string): boolean {
  return (NEVER_PROBE as readonly string[]).includes(id)
}

function нуженИсходник(м: { needs?: string[] }): boolean {
  return (м.needs ?? []).some(поле => ПОЛЯ_ИСХОДНИКА.includes(поле))
}

/**
 * КАКОЙ файл просит модель. Экран выбирает картинку или видео по этому полю.
 *
 * Показать выбор фотографий там, где нужен ролик, — предложить работу, которая
 * не сработает: `topaz/video-upscale` увеличивает готовое ВИДЕО, а
 * `kling/v2-1-pro` оживляет КАРТИНКУ, и обе живут на одной вкладке.
 */
function видИсходника(м: { needs?: string[] }): string {
  const н = м.needs ?? []
  if (н.includes('video_url')) return '"видео"'
  if (
    н.some(п => ['image_url', 'image_urls', 'input_urls', 'image'].includes(п))
  )
    return '"фото"'
  if (н.includes('audio_url')) return '"звук"'
  return 'nil'
}

const ВИД_К_KIND_ГЕН: Record<string, keyof typeof ПОЛЯ_МАРШРУТА | undefined> = {
  картинка: 'image',
  видео: 'video',
  звук: 'audio',
  липсинк: 'lipsync',
}

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

/*
 * The names this block reads, once in English: the guard that keeps code in
 * English cannot mark every line that would otherwise use them.
 */
type PriceRow = Строка // cyrillic-ok: existing type name
const kindOf = (id: string) => ВИД_К_KIND_ГЕН[ВИДИМЫЕ_ИМЕНА[id]?.вид ?? ''] // cyrillic-ok: existing tables
const unitWord = (unit: string) => ЕДИНИЦА[unit] ?? unit // cyrillic-ok: existing table

/**
 * Does the server refuse to sell this model as a video?
 *
 * The SAME rule the route and the charge apply (`kieVideoSale`,
 * billing-shared.ts), run on the price-list row this pass chose -- so the app
 * hides exactly what the server refuses, before the press rather than after.
 * Computed here and not copied into Swift: a copy of a money rule in a second
 * language is the drift this generator exists to prevent.
 */
function notSold(
  model: { id: string; needs?: string[] },
  row: PriceRow | null,
  // The dearest same-unit row this pass found (`DEAREST_VARIANT_USD`): the
  // rule refuses a clip whose name matches rows at different prices.
  dearest: number | null
): boolean {
  if (kindOf(model.id) !== 'video') return false
  return !kieVideoSale({
    cost: row ? +row.usdPrice : null,
    unit: row ? unitWord(row.creditUnit) : null,
    needs: model.needs,
    dearest,
  }).sold
}

async function main() {
  const строки = await прайс()
  /*
   * СОПОСТАВЛЕНИЕ ПОСЕГМЕНТНОЕ, А НЕ ПО ЧАСТИ ДО ПЕРВОЙ ЗАПЯТОЙ.
   *
   * Прежнее правило отбрасывало всё, что отличает строки внутри семейства, и
   * «самый дешёвый вариант» разрешал неоднозначность в пользу покупателя.
   * Замер по живому прайсу — пять имён собирали одиннадцать наших моделей:
   *
   *   google imagen4             Fast $0.02, default $0.04, Ultra $0.06
   *                              — все три модели получали $0.02
   *   Elevenlabs Text to Speech  turbo $0.03, multilingual $0.06
   *                              — обе получали $0.03
   *
   * То есть Imagen 4 Ultra продавался ВТРОЕ ниже себестоимости, Imagen 4 —
   * вдвое, multilingual — вдвое.
   *
   * Почему СЕГМЕНТЫ, а не начало строки: имя «Qwen image 3.0» оказалось бы
   * началом и для «Qwen image 3.0 Pro» — другой модели. По сегментам это
   * разные первые части, и подмены не происходит.
   */
  const сегменты = (s: string) =>
    s
      .split(',')
      .map(ч => ч.trim().toLowerCase())
      .filter(ч => ч.length > 0)

  /** Строки прайса, чьё описание начинается ТЕМИ ЖЕ сегментами, что имя. */
  const подходящие = (имя: string) => {
    const ждём = сегменты(имя)
    return строки.filter(р => {
      const есть = сегменты(р.modelDescription)
      return есть.length >= ждём.length && ждём.every((ч, i) => есть[i] === ч)
    })
  }

  /** Model id -> the dearest same-unit variant its price-list name matches. */
  const dearestById = new Map<string, number>()
  const записи = KIE_MODELS.map(м => {
    const видимое = ВИДИМЫЕ_ИМЕНА[м.id]
    if (!видимое)
      throw new Error(`${м.id} без названия — правьте kie-display-names.ts`)
    const имя = ИМЯ_В_ПРАЙСЕ[м.id]
    if (имя === undefined) {
      throw new Error(
        `${м.id} не сопоставлен с прайсом — правьте kie-price-names.ts`
      )
    }
    if (имя === null) {
      // Модели нет в прайсе вовсе: ни цены, ни единицы. Написать единицу
      // здесь значило бы её выдумать.
      return {
        м,
        видимое,
        цена: null as null | Строка,
        единицаБезЦены: null as null | Строка,
      }
    }
    const rs = подходящие(имя)
    if (!rs.length) throw new Error(`имени «${имя}» нет в прайсе (${м.id})`)
    /*
     * САМЫЙ ДЕШЁВЫЙ вариант — но НЕ АКЦИОННЫЙ.
     *
     * В прайсе KieAI есть строка «seedream 5 Pro, input image, First image
     * free» ценой $0.0025 при настоящих $0.035–0.07 за ту же модель. Правило
     * «бери минимум» уверенно выбирало её, и обе наши модели Seedream 5 Pro
     * стоили 1 токен вместо 14 — то есть продавались ВЧЕТЫРНАДЦАТЕРО ниже
     * себестоимости, и каждая генерация была убытком.
     *
     * Строка такого рода в прайсе сейчас ровно одна, поэтому отсев узкий и
     * проверяемый: он меняет цену двум моделям и не трогает остальные 41.
     * `recraft/crisp-upscale` и `qwen3/text-to-image` стоят $0.0025 по-
     * настоящему — они проверены по своим строкам и остаются как есть.
     */
    const условная = (r: Строка) =>
      /\bfree\b|first image|trial|promo/i.test(r.modelDescription)
    const годные = rs.filter(r => !условная(r))
    if (!годные.length) {
      throw new Error(
        `у «${имя}» в прайсе только акционные строки — цену назвать нечем (${м.id})`
      )
    }
    const min = годные.reduce((a, b) => (+a.usdPrice <= +b.usdPrice ? a : b))
    /*
     * THE DEAREST VARIANT OF THE SAME UNIT, KEPT BESIDE THE CHEAPEST.
     *
     * The cheapest row is what the model is quoted at, and for a model whose
     * name matches several variants it is a row we may never be billed at:
     * `hailuo 02` was priced by "image-to-video, Standard-6.0s-512p" ($0.06)
     * while ours is the Pro text-to-video model, whose only row is $0.285.
     * The margin report (`tri margin`) shows both, so a spread that could
     * put a sale under cost is visible without fetching the price list.
     */
    const sameUnit = годные.filter(r => r.creditUnit === min.creditUnit) // cyrillic-ok: existing local name
    const dearest = sameUnit.reduce((a, b) =>
      +a.usdPrice >= +b.usdPrice ? a : b
    )
    dearestById.set(м.id, +dearest.usdPrice) // cyrillic-ok: existing loop variable
    /*
     * ЕДИНИЦА, КОТОРУЮ НЕЛЬЗЯ ПЕРЕВЕСТИ В ЦЕНУ ЗА ВЫЗОВ.
     *
     * «$0.7 за млн токенов» — не цена одной озвучки. Взятая как плоская, она
     * давала 280 токенов там, где работа стоит доли цента, и модель
     * `google/gemini-3-1-flash-tts` стояла в приложении рядом с ElevenLabs
     * по 12 — в двадцать три раза дороже без всякого основания.
     *
     * Считать её нечем: числа токенов провайдера мы не знаем ни до вызова,
     * ни после. Поэтому цена здесь ОТСУТСТВУЕТ — как если бы провайдер её не
     * назвал. Следствие ровно то, какое нужно: сервер не допускает модель без
     * цены к оплате, а приложение показывает её неактивной. Продавать то,
     * чему нельзя назвать сумму до нажатия, мы не станем.
     *
     * Сценарии этим не задеты: они не тарифицируются вовсе, и в списке у них
     * стоит «бесплатно», а не цена.
     */
    if (НЕПЕРЕВОДИМЫЕ_ЕДИНИЦЫ.has(min.creditUnit)) {
      /*
       * ЦЕНЫ НЕТ, А ЕДИНИЦА ЕСТЬ — И ЭТО РАЗНЫЕ ФАКТЫ.
       *
       * Сначала здесь обнулялось и то и другое, потому что обе таблицы
       * писались из одного поля. Единица при этом ПРОПАДАЛА — вместе с ней
       * пропадала причина, по которой модель не продаётся.
       *
       * Цена этого: тест «модель, чью единицу не перевести в вызов, НЕ
       * ПРОДАЁТСЯ» отбирает записи по `ЕДИНИЦА_ЦЕНЫ === 'за млн токенов'`.
       * Обнули единицу — отбор пуст, тест зелен и не проверяет НИЧЕГО. То
       * есть перегенерация молча снимала сторожа, поставленного ради
       * конкретного убытка: Gemini TTS за 280 токенов вместо долей цента.
       *
       * Поэтому строка прайса возвращается отдельным полем: цена из неё не
       * берётся, единица берётся.
       */
      return { м, видимое, цена: null as null | Строка, единицаБезЦены: min }
    }
    return { м, видимое, цена: min, единицаБезЦены: null as null | Строка }
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
  /**
   * Просит вход, которого экран пока не передаёт (картинку, видео, звук).
   *
   * Такая модель не сработает НИКОГДА: сервер соберёт заявку и получит null
   * уже после того, как человек нажал и заплатил. Их было семь — по одной-две
   * на каждой платной вкладке, и строка честно писала «нужно: картинку»,
   * отправляя запрос без неё.
   *
   * Значение считает генератор по тому же списку полей, что и допуск на
   * сервере, поэтому экран и сервер не могут разойтись. Появится загрузка —
   * признак сам станет \`false\`, без правки экрана.
   */
  var входИзвне: Bool = false
  /**
   * Просит ФАЙЛ ОТ ЧЕЛОВЕКА: картинку, видео или звук.
   *
   * Не путать с \`входИзвне\`. Тот означает «маршрут это передать не умеет,
   * модель не показываем». Этот — «умеет, но сначала выберите файл»: модель
   * видна, а кнопка ждёт выбора, как ждёт непустого описания.
   */
  var нуженИсходник: Bool = false
  /// Какой файл просит: «фото», «видео» или «звук». Показать выбор фотографий
  /// там, где нужен ролик, — предложить работу, которая не сработает.
  var видИсходника: String? = nil
  /**
   * The server does not sell this video: the provider picks the length the
   * request does not carry, or its price names no unit a clip is billed in.
   * The rule is the server's own (\`kieVideoSale\`, billing-shared.ts), run by
   * the generator -- the app hides the model instead of taking a press the
   * server will refuse.
   */
  var notSold: Bool = false

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
    const е = цена
      ? `"${экр(ЕДИНИЦА[цена.creditUnit] ?? цена.creditUnit)}"`
      : 'nil'
    /**
     * «Нужно» ВЫВОДИТСЯ ИЗ ЗАМЕРЕННОГО КОНТРАКТА, а не пишется руками.
     *
     * `требует` в `kie-display-names.ts` заполнялся отдельно от `needs`, и они
     * разошлись: на экране у трёх моделей Seedream стояло «нужно: —», при том
     * что контракт у них `prompt + aspect_ratio + quality`. Два описания
     * одного факта — один замеренный, другой написанный по памяти — и экран
     * повторял второй.
     *
     * Человеческие имена полей нужны, потому что `aspect_ratio` в строке
     * выбора модели ничего не говорит тому, кто выбирает не по API. Поля, за
     * которые человек НЕ отвечает (их подставляет приложение), из подписи
     * убраны: обещать ввод там, где его не просят, — то же враньё, только
     * наоборот.
     *
     * Если контракт неизвестен, остаётся ручная подпись — она честнее пустой.
     */
    const поЧеловечески: Record<string, string> = {
      prompt: 'описание',
      text: 'текст',
      image_url: 'фото',
      image_urls: 'фото',
      audio_url: 'звук',
      video_url: 'видео',
    }
    const отЧеловека = (м.needs ?? [])
      .map(п => поЧеловечески[п])
      .filter(Boolean)
    const требует = отЧеловека.length
      ? [...new Set(отЧеловека)].join(' + ')
      : видимое.требует
    return `    Модель(id: "${экр(м.id)}", название: "${экр(видимое.название)}", вид: .${видимое.вид}, живая: ${м.state === 'live'}, требует: "${экр(требует)}", опасная: ${fencedFromProbes(м.id) || видимое.опасная === true}, ценаUSD: ${ц}, единица: ${е}, входИзвне: ${входИзвне(м)}, нуженИсходник: ${нуженИсходник(м)}, видИсходника: ${видИсходника(м)}, notSold: ${notSold(м, цена, dearestById.get(м.id) ?? null)}), // cyrillic-ok: generated UI catalogue`
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
  /*
   * The DEAREST_VARIANT_USD rows, built here under English names so the
   * template below only splices a string.
   */
  const escapeQuoted = экр // cyrillic-ok: existing helper
  const catalogue = записи // cyrillic-ok: existing local name
  const dearestTable = catalogue
    .map(entry => {
      const id = entry.м.id // cyrillic-ok: existing field
      const priced = Boolean(entry.цена) // cyrillic-ok: existing field
      const dearest = priced ? (dearestById.get(id) ?? null) : null
      return `  '${escapeQuoted(id)}': ${dearest},`
    })
    .join('\n')
  const ценыTS = `/**
 * Себестоимость моделей KieAI, $ — СГЕНЕРИРОВАНО.
 *
 * НЕ ПРАВИТЬ РУКАМИ: правка исчезнет при следующем запуске
 * \`scripts/gen-kie-swift.ts\`. Источник — прайс KieAI (POST
 * model-pricing/page), тот же проход, что собирает Swift-каталог.
 *
 * Значение — САМЫЙ ДЕШЁВЫЙ вариант модели (у одной модели бывает восемь цен
 * на разные разрешения), поэтому в интерфейсе оно показано со словом «от».
 * \`null\` — цену за ВЫЗОВ назвать нечем. Два случая: провайдер не назвал её
 * вовсе, ИЛИ назвал в единице, которую в один вызов не перевести («за млн
 * токенов» — не цена одной озвучки; взятая плоско, она давала 280 токенов за
 * работу в доли цента). Такую модель к оплате не допускаем: сумму до нажатия
 * мы назвать не сможем. Единица при этом СОХРАНЯЕТСЯ в \`ЕДИНИЦА_ЦЕНЫ\` —
 * она и есть причина отказа, и по ней сторожит тест.
 */
export const СЕБЕСТОИМОСТЬ_USD: Record<string, number | null> = {
${записи
  .map(({ м, цена }) => `  '${экр(м.id)}': ${цена ? +цена.usdPrice : null},`)
  .join('\n')}
}

/** Единица измерения цены: «за секунду», «за картинку» и т. п. */
export const ЕДИНИЦА_ЦЕНЫ: Record<string, string | null> = {
${записи
  .map(({ м, цена, единицаБезЦены }) => {
    // Единица берётся у ЛЮБОЙ найденной строки прайса — и когда цена годится,
    // и когда нет. Отсутствие цены и отсутствие единицы — разные факты.
    const строка = цена ?? единицаБезЦены
    return `  '${экр(м.id)}': ${строка ? `'${экр(ЕДИНИЦА[строка.creditUnit] ?? строка.creditUnit)}'` : null},`
  })
  .join('\n')}
}

/**
 * The DEAREST variant of the same unit that the model's price-list name
 * matches, $. The first table above holds the cheapest one; where the two
 * differ the provider bills one of several variants, and which one is its
 * choice. Read by \`tri margin\` to show the spread; \`null\` where the model
 * has no price.
 */
export const DEAREST_VARIANT_USD: Record<string, number | null> = {
${dearestTable}
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
