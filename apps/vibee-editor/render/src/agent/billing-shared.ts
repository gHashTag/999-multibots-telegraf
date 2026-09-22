import { СЕБЕСТОИМОСТЬ_USD, ЕДИНИЦА_ЦЕНЫ } from './kie-prices.generated'
// Контракты моделей: `needs` решает, задаём ли длину МЫ. Модуль без импортов,
// цикла не создаёт.
import { KIE_MODELS } from './kie-models'
// Which models the route sells as VIDEO. A module without imports, like the two above.
import { ВИДИМЫЕ_ИМЕНА } from './kie-display-names' // cyrillic-ok: existing export name
import { moveTokens, grantWelcomeIfNew } from '../token-ledger'

/**
 * THE REPLICATE LEG OF /api/generate/video, AND WHAT ONE SECOND OF IT COSTS.
 *
 * Every video that is not an explicit `kie/` model -- the agent's
 * `video_generate`, the web's default video tab -- is drawn by Replicate
 * bytedance/seedance-1-lite at 720p, 5 or 10 seconds (render-server.ts,
 * generateVideoViaReplicate). It was sold at ONE price, 40 tokens, set for a
 * cost of $0.10 per clip.
 *
 * The provider bills by the second of output. Read 2026-09-22 from the model
 * page, https://replicate.com/bytedance/seedance-1-lite (its billingConfig):
 * 480p $0.018, 720p $0.036, 1080p $0.072 per second of output video. So the
 * 5-second clip costs $0.18 and the 10-second one $0.36 -- the flat 40 tokens
 * covered neither at the owner's markup, and the 10-second clip not even at
 * cost: 40 x $0.005 = $0.20 against $0.36.
 *
 * The quality stays 720p (owner, 2026-09-22: the price moves, the picture does
 * not); the resolution is a named constant so the route and the price read it
 * from one place.
 */
export const REPLICATE_VIDEO_MODEL = 'replicate/bytedance/seedance-1-lite'
export const REPLICATE_VIDEO_RESOLUTION = '720p'
export const REPLICATE_VIDEO_USD_PER_SECOND = 0.036
/** The only lengths the Replicate leg makes. */
export const REPLICATE_VIDEO_LENGTHS = [5, 10] as const
export type ReplicateVideoLength = (typeof REPLICATE_VIDEO_LENGTHS)[number]
/** What a caller gets when it names no length. */
export const REPLICATE_VIDEO_DEFAULT_LENGTH: ReplicateVideoLength = 5

/**
 * The length the Replicate leg will make for a requested `duration`.
 *
 * ONE function for the charge and for the order: the route used to read the
 * body a second time inside the fallback (`parseInt(b.duration || '5') >= 8 ?
 * 10 : 5`), the charge never read it at all, and a 10-second clip was billed
 * as a 5-second one. Same rule as before -- 8 and above is ten seconds,
 * anything else, garbage included, is five.
 */
export function replicateVideoSeconds(duration: unknown): ReplicateVideoLength {
  const n = parseInt(String(duration ?? ''), 10)
  return Number.isFinite(n) && n >= 8 ? 10 : REPLICATE_VIDEO_DEFAULT_LENGTH
}

/** The model id a Replicate clip of this length is priced and charged under. */
export function replicateClipModel(seconds: ReplicateVideoLength): string {
  return `${REPLICATE_VIDEO_MODEL}:${seconds}s`
}
/**
 * Тарификация — ЕДИНЫЙ источник для двух путей генерации.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ. Генерацию зовут ДВА пути:
 *   1. агент-инструменты (tools.ts) — через selfFetch с X-Api-Key, списывают
 *      токены ДО вызова провайдера;
 *   2. клиент мини-аппа (generateApi.ts) — напрямую в /api/generate/* с
 *      подписью initData, и до сих пор НЕ списывал ничего.
 *
 * То есть любой пользователь мини-аппа генерил бесплатно, мимо цены и лимита —
 * блокер монетизации, найден разведкой 2026-08-28. Чтобы закрыть дыру на
 * ресурсном слое (в render-server.ts) и не разойтись в ценах с tools.ts,
 * цены и атомарное списание вынесены сюда. Оба модуля берут прайс отсюда —
 * дрейфа быть не может.
 *
 * ДВОЙНОГО СПИСАНИЯ НЕТ. Ресурсный слой списывает ТОЛЬКО с пользовательского
 * пути (по verifiedTelegramId). Серверный путь (X-Api-Key) там пропускается:
 * он уже оплачен на слое инструментов.
 */

export const COST_PER_TOKEN_USD = 0.005
/** Себестоимость операций, $ (оценки Replicate/рынка — см. PRICING.md). */
export const OPERATION_COST_USD: Record<string, number> = {
  image_generate: 0.003,
  /**
   * GPT Image 2.5 image-to-image at 1K on Kie: 6 credits = $0.03 per image.
   * Read 2026-09-13 from the Kie price list (POST
   * api.kie.ai/client/v1/model-pricing/page, rows "gpt-image-2-5-flare,
   * image-to-image, 1K" and the sunburst twin -- same price). This is the
   * model the CRM lead magnet is drawn with (kie-image.ts LEAD_MAGNET_MODEL);
   * the flat `image_generate` rate would sell it below cost.
   */
  gpt_image_edit: 0.03,
  /**
   * The DEFAULT clip of the Replicate leg: 5 seconds at 720p. It read 0.1, an
   * estimate nobody had checked against the provider's page; the measured
   * number is above, and a 10-second clip is priced by `replicateClipTokens`.
   */
  video_generate:
    REPLICATE_VIDEO_USD_PER_SECOND * REPLICATE_VIDEO_DEFAULT_LENGTH,
  audio_generate: 0.03,
  /**
   * Kie infinitalk/from-audio: $0.015 за секунду звука (прайс KieAI).
   *
   * БЫЛО 0.09 — себестоимость `veed/fabric-1`, 18 кредитов провайдера в
   * секунду. Модель сменилась (она отвечала `internal error`), и цена обязана
   * была смениться вместе с ней: 0.09 при новой себестоимости 0.015 означало
   * бы брать вшестеро больше, чем операция стоит. Цена здесь ВЫВОДИТСЯ из
   * себестоимости, а не назначается, — значит источник обязан быть тем же
   * провайдером, что стоит в KIE_WEB_MODEL.lipsync.
   *
   * Price = ceil(cost x markup / base) = 6 tokens instead of 36. This line
   * said "3 instead of 18" -- the same arithmetic WITHOUT the markup that the
   * skill page carried. The comment outlived the constant's arrival while
   * standing two lines away from it.
   */
  lipsync_generate: 0.015,
  reel_render: 0.005,
}
/**
 * НАЦЕНКА. Цена продажи = себестоимость × 2 (200% от себестоимости).
 *
 * Назначена владельцем и вынесена ОДНОЙ константой: наценка, размазанная по
 * таблице готовых чисел, не пересчитывается при смене прайса провайдера и
 * тихо превращается в убыток.
 */
export const НАЦЕНКА = 2.0

/**
 * Цена КОНКРЕТНОЙ модели в токенах, а не одна на весь вид.
 *
 * Пока к оплате допускалась одна модель на вид, `OPERATION_COST_USD` совпадал
 * с правдой. Как только допускаются все, одна константа начинает врать: у
 * липсинка себестоимость расходится ВДЕВЯТЕРО (0.015 у InfiniTalk против
 * 0.135 у OmniHuman). Общая цена означала бы либо переплату человека на
 * дешёвой модели, либо убыток владельца на дорогой.
 *
 * `null` — провайдер цены не назвал (таких 5 из 48). Такую модель к оплате не
 * допускаем совсем: назвать сумму до нажатия мы не можем, а брать неизвестно
 * сколько нельзя.
 */
export function priceForKieModel(modelId: string): number | null {
  const cost = СЕБЕСТОИМОСТЬ_USD[modelId]
  if (cost == null) return null
  // A video whose bill cannot be named before the press has no price either,
  // for the same reason as the line above (see `kieVideoSale`). Every list
  // that admits a model by its price -- the catalogue, /api/balance -- drops
  // it with this one check.
  if (isKieVideoModel(modelId) && !kieVideoSaleOf(modelId).sold) return null
  return вТокены(cost) // cyrillic-ok: existing helper name
}

/** Единица, за которую берётся цена: «за секунду», «за картинку». */
export function unitForKieModel(modelId: string): string | null {
  return ЕДИНИЦА_ЦЕНЫ[modelId] ?? null
}

/**
 * Цена операции = ceil(себестоимость × НАЦЕНКА / база).
 *
 * НАЦЕНКА ЗДЕСЬ ОТСУТСТВОВАЛА, и это была не мелочь: `priceForKieModel` её
 * применял, а `priceFor` — нет. Пути, идущие мимо KieAI (запасной провайдер),
 * продавали РОВНО ПО СЕБЕСТОИМОСТИ — то есть наценка, назначенная владельцем,
 * молча не действовала ни на одну из этих операций.
 */
/**
 * Себестоимость → токены. ОКРУГЛЕНИЕ ДО `ceil`, И ЭТО НЕ ПРИДИРКА.
 *
 * `0.035 * 2 / 0.005` в двоичной арифметике даёт 14.000000000000002, и
 * `Math.ceil` честно поднимает это до 15. Замер по таблице: лишний токен
 * брали с ЧЕТЫРЁХ моделей — обеих Seedream 5 Pro (15 вместо 14),
 * Ideogram v3 (8 вместо 7) и ElevenLabs audio-isolation (29 вместо 28).
 *
 * Округление до шестого знака снимает мусор двоичного представления, не
 * трогая настоящие дроби: для базы в полцента шестой знак недостижим никакой
 * реальной ценой.
 */
function вТокены(cost: number): number {
  return Math.ceil(Number(((cost * НАЦЕНКА) / COST_PER_TOKEN_USD).toFixed(6)))
}

export function priceFor(op: string): number {
  const cost = OPERATION_COST_USD[op]
  if (cost == null) return 0
  return вТокены(cost)
}

/**
 * Цены ВСЕХ моделей в токенах — для клиента, который должен назвать сумму
 * до нажатия.
 *
 * Списание идёт ПО МОДЕЛИ (`chargeMiniAppUser` берёт `priceForKieModel`), а
 * `/api/balance` отдавал только цены по ОПЕРАЦИИ. Замер расхождения:
 *
 *   картинка  показывали 1  — списывали 8   (отказ после нажатия)
 *   липсинк   показывали 3  — списывали 6   (отказ после нажатия)
 *   видео     показывали 20 — списывали 5   (отказ в том, что по карману)
 *
 * Неверно в обе стороны: то обещаем невозможное, то запрещаем оплаченное.
 * Клиенту нужна цена ТОЙ модели, которую он выбрал, а не средняя по виду.
 */
export function модельныеЦены(): Record<string, number> {
  const из: Record<string, number> = {}
  for (const id of Object.keys(СЕБЕСТОИМОСТЬ_USD)) {
    const ц = priceForKieModel(id)
    if (ц != null) из[`kie/${id}`] = ц
  }
  return из
}
/**
 * Операции, у которых цена умножается на секунды звука.
 *
 * Список живёт РЯДОМ С ЦЕНАМИ и отдаётся клиенту вместе с ними
 * (`GET /api/balance`), потому что вторая копия уже завелась: в iOS-приложении
 * стоял свой набор `посекундные`. Сегодня он верен — липсинк единственный, кто
 * считает `billedSeconds`, остальные списывают `quantity = 1`, — но верен он
 * СЛУЧАЙНО: сделай видео посекундным, и приложение продолжит обещать плоскую
 * цену, а сервер откажет уже после нажатия. Ровно эта форма расхождения стоила
 * отдельного разбора с ценой липсинка.
 *
 * Здесь список ведётся руками — вывести его из кода нельзя: посекундность
 * задаётся тем, что вызывающий передаёт `billedSeconds` вместо единицы. Но
 * место у него одно, и оно то же, где меняют цену.
 */
export const PER_SECOND_OPS: readonly string[] = ['lipsync_generate']

/**
 * ПОСЕКУНДНОСТЬ — СВОЙСТВО МОДЕЛИ, А НЕ ВИДА РАБОТЫ.
 *
 * Комментарий выше утверждал, что вывести список из кода нельзя. Это было
 * неверно: единица цены приходит от KieAI и лежит рядом, в `ЕДИНИЦА_ЦЕНЫ`.
 *
 * Замер по каталогу, ради которого всё и переделано:
 *
 *     видео    8 моделей «за секунду», 4 «за ролик»
 *     липсинк  4 модели «за секунду»
 *
 * То есть внутри ОДНОГО вида единицы разные, и признак на виде не может быть
 * верным в принципе. У липсинка он верен лишь потому, что там все четыре
 * посекундные — то самое «верно случайно», которое уже разбирали.
 *
 * Цена этой ошибки односторонняя и денежная: ролик `kling/v3-turbo` стоит
 * $0.09 ЗА СЕКУНДУ, десятисекундный обходится нам в $0.90, а списывали мы за
 * него 36 токенов как за один вызов. Каждое такое видео — убыток.
 */
const ПОСЕКУНДНАЯ_ЕДИНИЦА = 'за секунду'

/** Считать ли эту модель посекундно. Принимает и `kie/<id>`, и голый id. */
export function посекунднаяМодель(modelId: string | undefined): boolean {
  if (!modelId) return false
  const id = modelId.startsWith('kie/') ? modelId.slice(4) : modelId
  return ЕДИНИЦА_ЦЕНЫ[id] === ПОСЕКУНДНАЯ_ЕДИНИЦА
}

/**
 * ПОЗНАКОВЫЕ МОДЕЛИ. Провайдер берёт за 1000 знаков, а не за вызов.
 *
 * Обе живые TTS-модели тарифицируются так: multilingual v2 — 24 токена за
 * 1000 знаков, turbo — 12. Списывалось же плоско, `quantity = 1`, и предела
 * длины на маршруте не было НИ ОДНОГО (`grep` на `text.length` пуст). То есть
 * текст в 20 000 знаков стоил нам двадцать цен, а приносил одну: расход
 * $1.20 против выручки $0.12, и потолка у этого нет.
 *
 * Это тот же класс, что посекундные модели, и лечится так же: единица цены
 * известна из прайса, количество считается из запроса.
 */
const ПОЗНАКОВАЯ_ЕДИНИЦА = 'за 1000 знаков'

export function познаковаяМодель(modelId: string | undefined): boolean {
  if (!modelId) return false
  const id = modelId.startsWith('kie/') ? modelId.slice(4) : modelId
  return ЕДИНИЦА_ЦЕНЫ[id] === ПОЗНАКОВАЯ_ЕДИНИЦА
}

export function познаковыеМодели(): string[] {
  return Object.keys(ЕДИНИЦА_ЦЕНЫ)
    .filter(id => ЕДИНИЦА_ЦЕНЫ[id] === ПОЗНАКОВАЯ_ЕДИНИЦА)
    .map(id => `kie/${id}`)
}

/**
 * Сколько тысяч знаков оплачивать. Округление ВВЕРХ: провайдер берёт за
 * начатую тысячу, и брать за неё меньше — снова продавать ниже себестоимости.
 *
 * Ноль знаков даёт единицу, а не ноль: пустой текст до провайдера не дойдёт,
 * но если дойдёт — работа сделана, и она не бесплатна. Потолок тот же 3600,
 * что и у `chargeMiniAppUser`, иначе мегабайтная вставка вернула бы
 * «invalid billing quantity» вместо счёта.
 */
export function тысячиЗнаковКОплате(text: unknown): number {
  const длина = typeof text === 'string' ? text.length : 0
  return Math.min(Math.max(1, Math.ceil(длина / 1000)), 3600)
}

/**
 * ПЛАТИМ ЗА СЕКУНДЫ ТОЛЬКО ТАМ, ГДЕ САМИ ИХ ЗАДАЁМ.
 *
 * Четыре видеомодели тарифицируются провайдером за секунду, но их контракт
 * просит ОДИН `prompt`: длительность до провайдера не доходит, длину он
 * выбирает сам. Мы же умножали счёт на запрошенные секунды — то есть брали
 * деньги за то, чего не заказывали:
 *
 *   bytedance/seedance-2, seedance-2-fast, v1-pro-text-to-video, wan/3-0-video
 *
 * У липсинка иначе и правильно: длину задаёт присланный ЗВУК, провайдер
 * получает файл и считает по нему. Поэтому проверка не на «есть ли duration в
 * контракте», а на «управляем ли мы длиной» — звук и видео на входе тоже
 * управляют.
 */
const ЗАДАЁТ_ДЛИНУ = ['duration', 'audio_url', 'video_url']

export function длинойУправляемМы(needs: string[] | undefined): boolean {
  return (needs ?? []).some(поле => ЗАДАЁТ_ДЛИНУ.includes(поле))
}

/**
 * ДЛИНУ НАЗЫВАЕТ ЧЕЛОВЕК — чипом на экране, и она же уходит провайдеру.
 *
 * Разделение появилось из-за `topaz/video-upscale`. Его контракт просит один
 * `video_url`, значит `длинойУправляемМы` истинно — и счёт умножался на чип
 * «6с/10с», который до провайдера НЕ ДОХОДИТ: сборщик входа оставляет только
 * поля контракта. Один и тот же файл стоил 96 или 160 токенов в зависимости
 * от чипа, не менявшего ничего, а KieAI выставлял счёт за настоящую длину
 * ролика. Выше минуты это убыток без предела.
 *
 * «Мы задаём длину» и «длину задаёт присланный файл» — разные вещи, и общее
 * имя их скрывало.
 */
export function длинуЗадаётЧеловек(needs: string[] | undefined): boolean {
  return (needs ?? []).includes('duration')
}

/**
 * ДЛИНУ ЗАДАЁТ ПРИСЛАННЫЙ ФАЙЛ. Считать её надо ЗАМЕРОМ, а не чипом.
 *
 * Так давно устроен липсинк: `measuredRemoteDuration(audio_url)` до списания,
 * потолок, счёт по замеру. Маршрут видео этого не делал, хотя единственная
 * его модель с таким контрактом продаётся посекундно.
 */
export function длинуЗадаётФайл(needs: string[] | undefined): boolean {
  return (needs ?? []).some(
    поле => поле === 'audio_url' || поле === 'video_url'
  )
}

/**
 * Модели, счёт за которые МЫ САМИ умножаем на длину. Для `/api/balance`.
 *
 * Раньше список фильтровался ТОЛЬКО по единице цены — и расходился с тем, как
 * этот же файл списывает. Проверка `длинойУправляемМы` появилась в списании
 * (маршрут видео), но не здесь, и восемь моделей уезжали клиентам с пометкой
 * «за секунду», хотя счёт за них плоский:
 *
 *   grok-imagine/text-to-video, grok-imagine/image-to-video, kling/ai-avatar-
 *   standard, bytedance/seedance-2, seedance-2-fast, v1-pro-text-to-video,
 *   wan/3-0-video, infinitalk/from-audio
 *
 * Цена расхождения — ЗАПРЕТ РАБОТЫ, которую сервер сделал бы. Замер: остаток
 * 20, `grok-imagine/text-to-video` (5), 6 с. Приложение множило 5 × 6 = 30 и
 * гасило кнопку «нужно 30, есть 20»; сервер за то же нажатие берёт 5. Веб
 * подписывал «· 5/с» — единицу, которой не существует для этой модели.
 *
 * Липсинк из списка уходит и не должен в нём быть: его длину задаёт присланный
 * ЗВУК, а не выбор в интерфейсе. Он и так помечен целиком видом работы —
 * `PER_SECOND_OPS`, — и клиент обязан спрашивать вид, когда модели в списке
 * нет. Это ровно та развилка, из-за которой признак не может жить на одном
 * уровне: посекундность здесь — свойство ПАРЫ «модель + маршрут».
 */
/**
 * Модели, счёт за которые считается ПО ЗАМЕРУ присланного файла. Для
 * `/api/balance`.
 *
 * Клиенту это нужно, чтобы не обещать сумму, которой не знает: длину задаёт
 * файл, и до замера точного числа нет. Приложение на липсинке уже так и
 * поступает — называет цену секунды, а не выдуманный итог.
 */
export function посекундныеПоФайлу(): string[] {
  return посекундныеМодели().filter(полное =>
    длинуЗадаётФайл(
      KIE_MODELS.find(
        (м: { id: string; needs?: string[] }) => м.id === полное.slice(4)
      )?.needs
    )
  )
}

export function посекундныеМодели(): string[] {
  return Object.keys(ЕДИНИЦА_ЦЕНЫ)
    .filter(id => ЕДИНИЦА_ЦЕНЫ[id] === ПОСЕКУНДНАЯ_ЕДИНИЦА)
    .filter(id =>
      длинойУправляемМы(
        KIE_MODELS.find((м: { id: string; needs?: string[] }) => м.id === id)
          ?.needs
      )
    )
    .map(id => `kie/${id}`)
}

/**
 * Сколько секунд оплачивать. `duration` приходит от клиента как «6s»/«10s».
 *
 * Ноль и мусор дают 1, а не 0: списать ничего за сделанную работу хуже, чем
 * списать минимум. Потолок в 3600 совпадает с проверкой в `chargeMiniAppUser`
 * — иначе кривая длительность вернула бы «invalid billing quantity» вместо
 * счёта.
 */
export function секундыКОплате(duration: unknown): number {
  // `parseFloat`, а НЕ вырезание нецифр: срезая всё лишнее, я срезал и минус,
  // и «-5» становилось пятью секундами к оплате. Поймано собственным тестом.
  const n = Math.ceil(parseFloat(String(duration ?? '')))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 3600)
}

export const TOKEN_PRICES: Record<string, number> = {
  image_generate: priceFor('image_generate'), // 2
  gpt_image_edit: priceFor('gpt_image_edit'), // 12
  audio_generate: priceFor('audio_generate'), // 12
  lipsync_generate: priceFor('lipsync_generate'), // 6 per audio second
  reel_render: priceFor('reel_render'), // 2
  video_generate: priceFor('video_generate'), // 72: the default 5-second clip
}

/**
 * Cost in USD to tokens, by the rule every price here uses: ceil(cost x markup
 * / base), with the binary-rounding guard. Exported so the video floor and the
 * margin report use THIS rule instead of writing a second one.
 */
export function tokensForCostUsd(costUsd: number): number {
  return вТокены(costUsd) // cyrillic-ok: existing helper name
}

/**
 * THE VIDEO FLOOR: NO CLIP IS SOLD BELOW WHAT IT COSTS US, TIMES THE MARKUP.
 *
 * price = max(the price the video already had, ceil(cost of THIS clip x markup
 * / base)). "Already had" is the op's own price for the Replicate leg and the
 * model's per-unit price times the units for a Kie model. The floor only ever
 * raises: a provider that gets cheaper does not make the clip cheaper, it
 * makes the margin wider.
 *
 * WHY A FLOOR AND NOT A LOWER RESOLUTION. The owner was offered both on
 * 2026-09-22 (raise the price, or drop to 480p) and did not pick; the lead
 * picked the floor, because a person who pays for a clip should get the clip
 * that was shown, and the loss was in the price, not in the picture.
 */
export function videoFloorTokens(
  currentTokens: number,
  costUsd: number
): number {
  return Math.max(currentTokens, tokensForCostUsd(costUsd))
}

/** What a Replicate clip of this length costs us, USD. */
export function replicateClipCostUsd(seconds: ReplicateVideoLength): number {
  return Number((REPLICATE_VIDEO_USD_PER_SECOND * seconds).toFixed(6))
}

/**
 * What a Replicate clip of this length is sold for: 72 tokens for 5 seconds,
 * 144 for 10, at today's page price. The quote, the charge and the refund all
 * read this one number (through `priceForModel`).
 */
export function replicateClipTokens(seconds: ReplicateVideoLength): number {
  return videoFloorTokens(
    TOKEN_PRICES.video_generate,
    replicateClipCostUsd(seconds)
  )
}

/** Every length of the Replicate leg with its price -- for /api/balance. */
export function replicateClipPrices(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of REPLICATE_VIDEO_LENGTHS)
    out[String(s)] = replicateClipTokens(s)
  return out
}

/*
 * The generated tables under English names, once. The guard that keeps code
 * in English cannot mark every line that reads them, and a rename of a
 * generated export is a generator change, not this one.
 */
const KIE_COST_USD = СЕБЕСТОИМОСТЬ_USD // cyrillic-ok: alias of the generated table
const KIE_PRICE_UNIT = ЕДИНИЦА_ЦЕНЫ // cyrillic-ok: alias of the generated table
const VIDEO_LABEL = 'видео' // the UI kind label in kie-display-names.ts
const UNIT_PER_SECOND = 'за секунду'
const UNIT_PER_CLIP = 'за ролик'
// The two helpers below this file already has, under the names this block reads.
const lengthSetByPerson = (needs: string[] | undefined) =>
  длинуЗадаётЧеловек(needs) // cyrillic-ok: existing helper name
const lengthSetByFile = (needs: string[] | undefined) => длинуЗадаётФайл(needs) // cyrillic-ok: existing helper name

/** How a Kie VIDEO model is sold, or why it is not. */
export type KieVideoSale =
  | {
      sold: true
      /** What one unit of the price list is: a second of video, or a clip. */
      per: 'second' | 'clip'
      /**
       * Who sets the billed length of a per-second model: the person's
       * chip, which is sent to the provider, or the file the person sent,
       * which the route measures. `null` for a per-clip model.
       */
      length: 'person' | 'file' | null
    }
  | { sold: false; why: string }

/**
 * THE RULE THAT DECIDES WHETHER A KIE VIDEO MODEL CAN BE SOLD AT ALL.
 *
 * A quote before the press needs two numbers: what one unit costs, and how
 * many units the provider will bill. The price list gives the first. The
 * second is where video lost money:
 *
 *   grok-imagine/text-to-video, bytedance/seedance-2, seedance-2-fast,
 *   v1-pro-text-to-video, wan/3-0-video
 *
 * are billed PER SECOND, and their contract is one `prompt` -- the length is
 * not sent, the provider makes its own (Kie's model pages, read 2026-09-22:
 * seedance 5 s at 720p, wan 3.0 5 s at 1080P, grok anything from 6 to 30 s
 * with no default named), and we charged ONE second. seedance-2 was 23
 * tokens, $0.115 at the billing base, for a 5-second 720p text-only clip the
 * price list bills at $0.205 a second: $1.025. The more seconds the provider
 * chose, the bigger the loss.
 *
 * FAIL CLOSED, NOT A GUESSED LENGTH. A length we do not send is not a length
 * we know; pricing it by the docs' default is pricing it by a sentence the
 * provider can change without telling us. So such a model is refused before
 * any charge, and it comes back by itself the day its contract carries
 * `duration` (the person's chip then reaches the provider and is billed).
 *
 * The same holds for a video priced in a unit that does not describe a clip
 * ("per image" on a video model is a row for its image INPUT, not its output),
 * and for a model the price list names no price for -- that one used to fall
 * back to the flat video price, which is exactly "sold at the flat price".
 *
 * Pure: the entry is passed in, so the generator can run the same rule on a
 * price list it has just fetched, and a test can run it on a made-up one.
 */
export function kieVideoSale(entry: {
  cost: number | null | undefined
  unit: string | null | undefined
  needs: string[] | undefined
}): KieVideoSale {
  if (typeof entry.cost !== 'number' || !Number.isFinite(entry.cost)) {
    return { sold: false, why: 'the price list names no price for it' }
  }
  if (entry.unit === UNIT_PER_CLIP) {
    return { sold: true, per: 'clip', length: null }
  }
  if (entry.unit !== UNIT_PER_SECOND) {
    return {
      sold: false,
      why: `its price is ${entry.unit ?? 'in no unit'}, which does not say what one clip costs`,
    }
  }
  if (lengthSetByPerson(entry.needs)) {
    return { sold: true, per: 'second', length: 'person' }
  }
  if (lengthSetByFile(entry.needs)) {
    return { sold: true, per: 'second', length: 'file' }
  }
  return {
    sold: false,
    why:
      'it is billed per second and the provider picks the length: the ' +
      'request carries none, so the bill cannot be named before the press',
  }
}

/** Is this bare Kie id one the route treats as video? */
export function isKieVideoModel(modelId: string): boolean {
  return ВИДИМЫЕ_ИМЕНА[modelId]?.вид === VIDEO_LABEL // cyrillic-ok: existing table and field
}

/** `kieVideoSale` for a catalogued model, read from the generated tables. */
export function kieVideoSaleOf(modelId: string): KieVideoSale {
  const id = modelId.startsWith('kie/') ? modelId.slice(4) : modelId
  return kieVideoSale({
    cost: KIE_COST_USD[id],
    unit: KIE_PRICE_UNIT[id],
    needs: KIE_MODELS.find(m => m.id === id)?.needs,
  })
}

/**
 * THE ONE TEST FOR "THIS PRESS GOES DOWN THE KIE LEG" of /api/generate/video.
 *
 * Only an explicit `kie/<id>` does. Any other id -- a bare Kie id included --
 * goes down the Replicate leg and buys one seedance clip, priced per clip under
 * `replicateClipModel`. The route picks its leg with this predicate and counts
 * the charge's units with `videoChargeLength`, which reads the same one, so
 * the leg and the quantity cannot part.
 */
export function isExplicitKieVideo(model: unknown): model is string {
  return typeof model === 'string' && model.startsWith('kie/')
}

/** Who names the length one video press is charged for. */
export type VideoChargeLength = 'clip' | 'person' | 'file'

/**
 * WHAT ONE PRESS OF /api/generate/video IS CHARGED FOR, by the leg that runs.
 *
 *   'clip'    one unit: the Replicate clip (its price already names its
 *             length) or a Kie model sold per clip
 *   'person'  a per-second Kie model: the chip's seconds, the same number
 *             its request carries to the provider
 *   'file'    a per-second Kie model whose length is the file sent: the
 *             seconds the route measures before the charge
 *
 * THE LEG DECIDES, NOT THE ID. The per-second check accepts a bare id, and
 * the route used to ask it about every model. A signed request naming
 * `kling/v3-turbo-text-to-video` without the prefix went down the Replicate
 * leg, was priced as a 10-second seedance clip (144 tokens) and charged that
 * times the chip: 1440 tokens for one clip. A bare `topaz/video-upscale`
 * measured its file BEFORE the charge, and a file that would not measure threw
 * into the catch, whose Replicate fallback made a clip nobody had paid for.
 */
export function videoChargeLength(model: unknown): VideoChargeLength {
  if (!isExplicitKieVideo(model)) return 'clip'
  const sale = kieVideoSaleOf(model)
  // A refused model never reaches the charge (the route answers 400 first,
  // and `priceForModel` refuses it again); one unit is the safe answer here.
  if (!sale.sold || sale.per === 'clip') return 'clip'
  return sale.length ?? 'clip'
}

/**
 * The quantity the charge multiplies the unit price by. `measuredSeconds` is
 * read only for 'file', and must then be a real measurement: a missing one is
 * refused rather than charged as nothing or as one second.
 */
export function videoChargeUnits(
  rule: VideoChargeLength,
  chipSeconds: number,
  measuredSeconds?: number
): number {
  if (rule === 'person') return chipSeconds
  if (rule === 'file') {
    if (
      typeof measuredSeconds !== 'number' ||
      !Number.isFinite(measuredSeconds) ||
      measuredSeconds <= 0
    ) {
      throw new Error('the file was not measured, so its length is unknown')
    }
    return Math.ceil(measuredSeconds)
  }
  return 1
}

/**
 * The price of one unit of a named model, or why there is none.
 *
 *   number     the model's own price (per unit the charge multiplies)
 *   null       the model is named and must NOT be sold for this op
 *   undefined  no model, or not one with its own price: the op's price holds
 *
 * The null is the new case. A Kie VIDEO model the rule above refuses returns
 * null here, so `spendByTid` refuses it too -- the route gates first, and this
 * is the second lock on the same door. Any other model without a price of its
 * own keeps the old fallback to the op's price, which billing-prices.test.ts
 * pins.
 */
export function priceForModel(
  op: string,
  modelId: string | undefined
): number | null | undefined {
  if (typeof modelId !== 'string') return undefined
  for (const s of REPLICATE_VIDEO_LENGTHS) {
    if (modelId === replicateClipModel(s)) {
      return op === 'video_generate' ? replicateClipTokens(s) : null
    }
  }
  if (!modelId.startsWith('kie/')) return undefined
  const id = modelId.slice(4)
  // A Kie video the floor refuses is refused under ANY op: without this its
  // missing price would fall through to the op's flat price below.
  if (isKieVideoModel(id) && !kieVideoSaleOf(id).sold) return null
  return priceForKieModel(id) ?? undefined
}

/**
 * The quote for one Kie video press: what the person will be charged, and
 * what the provider will bill us. `units` is seconds for a per-second model
 * and 1 for a per-clip one -- the same `секунды` the route passes to the
 * charge. The token figure is `videoFloorTokens` over the per-unit price times
 * the units, and that is ALWAYS the per-unit price times the units: the
 * per-unit price is itself rounded up, so the floor never binds. The test
 * `no-video-below-cost.test.ts` holds that for every model and length, so the
 * charge (unit x units in spendByTid) and this quote cannot part.
 */
export function kieVideoQuote(
  modelId: string,
  units: number
): { tokens: number; costUsd: number } | { refused: string } {
  const id = modelId.startsWith('kie/') ? modelId.slice(4) : modelId
  const sale = kieVideoSaleOf(id)
  if (!sale.sold) return { refused: sale.why }
  const cost = KIE_COST_USD[id] as number
  const unit = priceForKieModel(id) as number
  const n = sale.per === 'clip' ? 1 : units
  const costUsd = Number((cost * n).toFixed(6))
  const floor = videoFloorTokens(unit * n, costUsd)
  return { tokens: floor, costUsd }
}

/**
 * THE MOST ONE RUN MAY COST US FOR THE PRICE TO KEEP ITS MARKUP.
 *
 * `priceFor` goes from cost to price: ceil(cost x markup / base). This goes
 * back: price x base / markup. For image_generate that is 2 x 0.005 / 2 =
 * $0.005 -- a provider link costing more than that sells the picture below
 * the owner's price, however the chain happened to reach it. An op with no
 * price covers nothing (0), so nothing runs on it.
 *
 * Rounded to the sixth place for the same reason `priceFor` is: binary
 * arithmetic leaves 0.005000000000000001, and a comparison against it should
 * not depend on that.
 */
export function costCeilingUsd(op: string): number {
  const price = TOKEN_PRICES[op]
  if (!price) return 0
  return Number(((price * COST_PER_TOKEN_USD) / НАЦЕНКА).toFixed(6)) // cyrillic-ok: existing markup constant
}

/** Пул, минимально типизированный: и pg.Pool, и обёртки подходят. */
type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

async function ensureRow(pool: Pool, tid: string): Promise<void> {
  // The welcome grant is a movement too: recorded once, as 'grant'.
  await grantWelcomeIfNew(pool, tid, 20)
}

/**
 * Атомарное списание по telegram_id. Проверка баланса и вычитание — одним
 * запросом с `WHERE balance >= price`: параллельные вызовы не уводят баланс в
 * минус (тот же приём, что в tools.ts spendTokens).
 */
/**
 * ВЛАДЕЛЬЦЫ НЕ ПЛАТЯТ ВНУТРЕННЕЙ КВОТОЙ, потому что платят настоящими деньгами.
 *
 * Квота `user_tokens` защищает КРЕДИТЫ KieAI от постороннего: чужой человек не
 * должен тратить чужой кошелёк. Для владельца этого ключа защищать не от кого —
 * кредиты его, он их купил, и упираться в наш счётчик при 5316 оплаченных
 * кредитах у провайдера бессмысленно.
 *
 * Список берётся из `ADMIN_IDS` — ТОЙ ЖЕ переменной, по которой бот пускает в
 * админские команды. Заводить второй список владельцев значило бы завести
 * второе место, где он разойдётся с первым; расхождение здесь означает либо
 * бесплатную генерацию постороннему, либо упёршегося в лимит хозяина.
 *
 * ЭТО ОБХОД ОПЛАТЫ, поэтому личность обязана быть ПОДТВЕРЖДЁННОЙ. Сюда
 * приходит `tid`, который вызывающий получил из подписи или сессии
 * (`verifiedViewerId`), а не из тела запроса: заголовок, которому верят на
 * слово, превратил бы этот список в способ не платить для кого угодно.
 */
const ВЛАДЕЛЬЦЫ: ReadonlySet<string> = new Set(
  (process.env.ADMIN_IDS || process.env.ADMIN_TELEGRAM_ID || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)

export function владелец(tid: string): boolean {
  return ВЛАДЕЛЬЦЫ.has(String(tid))
}

/**
 * Read-only: what a person has, or null when they have no row yet. A null
 * is not zero -- the first charge creates the row with the free grant
 * (`ensureRow`), so a caller deciding "can they afford it" must know the
 * difference.
 */
export async function balanceOf(
  pool: Pool,
  tid: string
): Promise<number | null> {
  const r = await pool.query(
    `SELECT balance FROM user_tokens WHERE telegram_id = $1`,
    [tid]
  )
  const b = r.rows[0]?.balance
  return b === undefined || b === null ? null : Number(b)
}

/** The free grant a first charge creates the row with. See `ensureRow`. */
export const FIRST_ROW_GRANT = 20

export async function spendByTid(
  pool: Pool,
  tid: string,
  op: string,
  quantity = 1,
  /**
   * Модель, если её выбрал человек. Тогда цена берётся ЕЁ, а не общая по виду.
   *
   * Общая цена на вид верна только пока к оплате допущена одна модель. Мы
   * допустили все, а себестоимость у них расходится вдевятеро — списывать
   * одинаково значит либо переплачивать за человека, либо брать с него
   * лишнее. Приходит `kie/<id>`, потому что ровно в таком виде модель
   * присылает клиент.
   */
  modelId?: string
): Promise<{
  ok: boolean
  списано?: number
  осталось?: number
  причина?: string
  /**
   * The id of the ledger row this charge wrote, so a refund can name it.
   *
   * A refund keyed to nothing can happen twice; a refund keyed to THIS row
   * cannot. The caller carries the number from the charge to the refund --
   * see `refundByTid`'s `spendLedgerId`.
   */
  ledgerId?: number
}> {
  if (владелец(tid)) {
    // Пишем в журнал: бесплатная генерация обязана быть видимой, иначе
    // «почему счётчик не двигается» станет загадкой, а не решением.
    console.log(`💳 владелец ${tid}: ${op} без списания квоты`)
    return { ok: true, списано: 0 }
  }

  const own = priceForModel(op, modelId)
  // A named model this op must not sell (a Kie video the floor refuses): no
  // fallback to the op's price, which would be selling it at the flat price.
  if (own === null) {
    return { ok: false, причина: `model ${modelId} is not sold for ${op}` } // cyrillic-ok: public API field
  }
  const unitPrice = own ?? TOKEN_PRICES[op]
  /*
   * AN OPERATION WITHOUT A PRICE IS REFUSED, NOT GIVEN AWAY.
   *
   * This used to return { ok: true } with no amount: the generation ran, the
   * receipt was empty, and nothing anywhere said it had been free. Today every
   * op that reaches a charge is priced, so the branch is unreachable -- which
   * is exactly when it is worth closing, because the way it becomes reachable
   * is somebody adding a fifth operation and forgetting the table. That is not
   * hypothetical: the bot half of this repository lost months to two of these
   * (a settlement route that credited without a receiver, and a payment kind
   * that failed validation and charged nothing), and both looked like success
   * from the caller.
   *
   * Refusing is the safe direction. It can never take more money than the
   * price says, and the reason names the op so the fix is obvious.
   */
  if (!unitPrice) return { ok: false, причина: `no price for op=${op}` } // cyrillic-ok: public API field
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 3600) {
    return { ok: false, причина: 'invalid billing quantity' } // cyrillic-ok: public API field
  }
  const price = unitPrice * quantity
  await ensureRow(pool, tid)
  // Check-and-debit in one statement, plus the ledger row that says what the
  // tokens bought (src/token-ledger.ts). The reason is what a person reads.
  const r = await moveTokens(pool, {
    telegramId: tid,
    delta: -price,
    kind: 'spend',
    reason: `${op}${modelId ? ` ${modelId}` : ''}${quantity > 1 ? ` x${quantity}` : ''}`,
    meta: { op, modelId: modelId ?? null, quantity, unitPrice },
  })
  if (!r.ok) {
    return {
      ok: false,
      причина: `не хватает токенов: нужно ${price}, есть ${r.balance}`,
    }
  }
  return { ok: true, списано: price, осталось: r.balance, ledgerId: r.id }
}

/**
 * Возврат, если работа не сделана. Без него сбой провайдера списывал бы токен.
 *
 * ЦЕНА СЧИТАЕТСЯ ТОЙ ЖЕ ФОРМУЛОЙ, ЧТО И СПИСАНИЕ. Раньше здесь стояло
 * `TOKEN_PRICES[op]` — цена ВИДА работы, — тогда как `spendByTid` берёт цену
 * МОДЕЛИ. Замер по живому каталогу: из 36 пар «модель × операция» совпадали
 * ДВЕ. Расхождение шло в обе стороны и обе плохи:
 *
 *   omnihuman-1-5, 10 с   списано 540, возврат 60   — забрали 480 за чужой сбой
 *   google/imagen4-ultra  списано 24,  возврат 2
 *   minimax-h3/t2v        списано 8,   возврат 40   — НАПЕЧАТАЛИ 32
 *
 * Последняя строка — не переплата, а кран: сбой провайдера вызывается кем
 * угодно и повторяется, а каждый повтор прибавляет токены из ниоткуда.
 *
 * Это ровно та асимметрия, о которой писано десятое правило («сверяй не
 * формулы, а ЧИСЛА»). Между клиентом и сервером её починили; между списанием
 * и возвратом — нет, потому что обе функции по отдельности «считают верно».
 */
/**
 * The outcome of a refund, because void could not tell three cases apart.
 *
 * refundByTid used to return void on all three: it gave the money back, it
 * silently gave nothing back (no price for the op/model -- `if (!price)
 * return`), or it threw and swallowed. The caller awaited it and learned
 * nothing, so a refund that never happened looked exactly like one that did.
 */
export type RefundOutcome =
  | {
      ok: true
      refunded: number
      /**
       * The money was already back before this call. Not a failure and not a
       * second refund: the ledger refused to record the same refund twice.
       */
      already?: boolean
    }
  | { ok: false; why: string; wanted?: number }

export async function refundByTid(
  pool: Pool,
  tid: string,
  op: string,
  quantity = 1,
  modelId?: string,
  /**
   * WHAT THE CHARGE ACTUALLY TOOK, WHEN THE CALLER KEPT IT.
   *
   * Everything below this line re-derives the amount from the price table,
   * which is the mechanism that already went wrong once: the note above this
   * function records omnihuman-1-5 at 10 seconds, charged 540 and refunded 60,
   * because the refund priced by kind while the charge priced by model. Adding
   * modelId and quantity closed that instance and left the class open -- the
   * two numbers are still computed twice, from a table that moves, at two
   * different moments.
   *
   * spendByTid MEASURES what it took and returns it. Handing that number back
   * is the only version that cannot drift: there is one number, not two.
   */
  exact?: number,
  /**
   * THE CHARGE THIS REFUND GIVES BACK, so it can only give it back once.
   *
   * Without it this function was an unconditional credit: every path that
   * reached it added the price again. A retried request, a redelivered
   * webhook, or two error branches firing for one failure each minted tokens
   * out of nothing -- and, since #2206 put refunds in the ledger, the book
   * recorded every one of them as legitimate, so the balance and the ledger
   * agreed on a number neither had a payment behind.
   *
   * `spendByTid` returns the id of the row it wrote. Carrying that number to
   * here makes the refund's reference unique per charge, and the unique index
   * `token_ledger_once` -- not this function -- is what refuses the second.
   */
  spendLedgerId?: number
): Promise<RefundOutcome> {
  /*
   * ОСВОБОЖДЕНИЕ ВЛАДЕЛЬЦА ДЕЙСТВУЕТ И ЗДЕСЬ. С него не списывают (см.
   * `chargeMiniAppUser`), а возвращали полную цену — то есть каждый сбой
   * прибавлял ему токены, которых никто не брал. Правило уже записано в
   * agent/tools.ts: «освобождение обязано держаться с ОБЕИХ сторон, иначе это
   * не освобождение, а кран».
   */
  if (владелец(tid)) return { ok: true, refunded: 0 } // cyrillic-ok: existing helper name

  let price = typeof exact === 'number' && exact > 0 ? exact : 0
  if (!price) {
    // The same lookup the charge made; a model the charge refused has nothing
    // to give back (null -> 0 -> "no price" below).
    const own = priceForModel(op, modelId)
    const unitPrice = own === null ? 0 : (own ?? TOKEN_PRICES[op])
    price = (unitPrice ?? 0) * quantity
  }
  // No price and no receipt is not "nothing to do": somebody was charged and
  // this is the path that was meant to give it back. Say so instead of
  // returning as though the work were done.
  if (!price)
    return { ok: false, why: `no price for op=${op} model=${modelId ?? '-'}` }
  try {
    const r = await moveTokens(pool, {
      telegramId: tid,
      delta: price,
      kind: 'refund',
      reason: `refund: ${op}${modelId ? ` ${modelId}` : ''}`,
      ref: spendLedgerId ? `refund-of-${spendLedgerId}` : null,
      once: Boolean(spendLedgerId),
      meta: {
        op,
        modelId: modelId ?? null,
        quantity,
        exact: exact ?? null,
        spendLedgerId: spendLedgerId ?? null,
      },
    })
    if (!r.ok && r.reason === 'duplicate') {
      // The tokens are already back. Saying so is the whole point of keying
      // the refund: a second attempt is now visible instead of invisible.
      console.log(`[токены] возврат за «${op}» уже был сделан — пропущен`) // cyrillic-ok: existing log line
      return { ok: true, refunded: 0, already: true }
    }
    if (!r.ok) return { ok: false, why: r.reason, wanted: price }
    console.log(`[токены] возврат ${price} за «${op}»`) // cyrillic-ok: existing log line
    return { ok: true, refunded: price }
  } catch (e) {
    console.error('[токены] возврат не прошёл:', e) // cyrillic-ok: existing log line
    return {
      ok: false,
      why: e instanceof Error ? e.message : String(e),
      wanted: price,
    }
  }
}
