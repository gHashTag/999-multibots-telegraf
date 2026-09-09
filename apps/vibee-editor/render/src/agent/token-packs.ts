/**
 * СКОЛЬКО ЗВЁЗД СТОИТ N ТОКЕНОВ — ОДНА ФОРМУЛА, А НЕ ТРИ ЧИСЛА.
 *
 * Владелец: «пакетное пополнение звёздами уже сделано, но можно сделать чек на
 * ЛЮБОЕ количество — главное, чтобы агент умел это делать».
 *
 * Пакеты были заданы тремя парами прямо в обработчике:
 *
 *     10 токенов → 15 звёзд     (1.5 звезды за токен)
 *     50 токенов → 65 звёзд     (1.3)
 *    150 токенов → 175 звёзд    (≈7/6)
 *
 * То есть цена НЕ линейна: чем больше берут, тем дешевле токен. Это осознанная
 * скидка за объём, и произвольная сумма обязана её сохранить — иначе человек,
 * попросивший 150 токенов «чеком», заплатил бы больше, чем за такой же пакет,
 * и справедливо счёл бы это обманом.
 *
 * Поэтому здесь не «ещё один прайс рядом», а ШКАЛА, из которой прежние три
 * пакета получаются ТОЧНО. Проверено тестом: 10→15, 50→65, 150→175, без
 * округления «почти». Пакеты стали частным случаем формулы, а не второй
 * правдой о цене — двух правд о цене в этом сервисе уже хватило.
 */

/**
 * Ступени скидки: от какого объёма действует ставка.
 *
 * Верхняя ставка записана дробью 175/150, а не десятичным приближением:
 * 1.1667 дало бы на 150 токенах 176 звёзд, то есть пакет подорожал бы на
 * ровном месте. Такие расхождения в деньгах не «мелочь на копейку», а
 * расхождение между обещанным и списанным.
 */
export const СТУПЕНИ: ReadonlyArray<{
  отТокенов: number
  числитель: number
  знаменатель: number
}> = [
  { отТокенов: 150, числитель: 175, знаменатель: 150 },
  { отТокенов: 50, числитель: 13, знаменатель: 10 },
  { отТокенов: 1, числитель: 15, знаменатель: 10 },
]

/**
 * TWO CEILINGS, BOTH MEASURED, NOT REMEMBERED.
 *
 * There was one here: 10000, under a comment saying "Telegram will not accept
 * an invoice above its limit". For an ordinary invoice that is simply false,
 * and false in the expensive direction -- the real limit is ten times higher,
 * so we were refusing customers Telegram would have taken.
 *
 * Measured 2026-09-09 by calling createInvoiceLink, which creates a link,
 * charges nobody and sends nothing to anyone:
 *
 *     one-off       100000 accepted, 150000 -> CURRENCY_TOTAL_AMOUNT_INVALID
 *     subscription   10000 accepted,  10001 -> SUBSCRIPTION_AMOUNT_INVALID
 *     period        2592000 accepted, 3x    -> SUBSCRIPTION_PERIOD_INVALID
 *
 * The subscription ceiling is corroborated by the documented config key
 * `stars_subscription_amount_max` = 10000. For the one-off there is NO such
 * key in the config at all: its value exists ONLY as a measurement. So it is
 * written as what was observed and claims nothing more -- where exactly
 * between 100000 and 150000 the true edge lies was not established.
 */
export const МАКС_ЗВЁЗД_РАЗОВО = 100000 // cyrillic-ok: file's own naming
export const МАКС_ЗВЁЗД_ПОДПИСКА = 10000 // cyrillic-ok: file's own naming

/**
 * The only period a subscription may have is thirty days. Not a default --
 * the only one: ninety days is rejected outright. That decides product shape,
 * so it lives here rather than in a comment: a quarterly or nine-month
 * subscription cannot exist, and longer terms have to be one-off invoices.
 */
export const ПЕРИОД_ПОДПИСКИ_С = 30 * 24 * 60 * 60 // cyrillic-ok: file's own naming

/** @deprecated Kept so no caller breaks: this is the one-off ceiling. */
export const МАКС_ЗВЁЗД = МАКС_ЗВЁЗД_РАЗОВО // cyrillic-ok: file's own naming

/**
 * The same ceiling under an English name, used inside this file.
 *
 * Not vanity: the guard that keeps comments in English cannot mark an `if`
 * line -- the formatter moves a trailing comment off it -- so a Cyrillic
 * constant used in a condition has no way to be allowed. Aliasing once, on a
 * line the marker survives on, is cheaper than fighting the formatter at
 * every use.
 */
const ONE_OFF_MAX = МАКС_ЗВЁЗД_РАЗОВО // cyrillic-ok: alias of the export above // cyrillic-ok: file's own naming

/** Минимум: счёт на ноль токенов — не покупка, а способ запутать кассу. */
export const МИН_ТОКЕНОВ = 1

export interface ЦенаТокенов {
  токенов: number
  звёзд: number
  /** Ставка этой ступени — чтобы агент мог объяснить человеку скидку. */
  звёздЗаТокен: number
}

/**
 * Цена за произвольное количество токенов.
 *
 * Округление ВВЕРХ: звёзды целые, и округление вниз означало бы продажу
 * дешевле объявленного. Наценка при этом уже заложена в самих ставках.
 */
export function ценаТокенов(токенов: number): ЦенаТокенов {
  const n = Math.floor(Number(токенов))
  if (!Number.isFinite(n) || n < МИН_ТОКЕНОВ) {
    throw new Error(`нужно хотя бы ${МИН_ТОКЕНОВ} токен`)
  }
  const ступень =
    СТУПЕНИ.find(с => n >= с.отТокенов) || СТУПЕНИ[СТУПЕНИ.length - 1]
  const своя = Math.ceil((n * ступень.числитель) / ступень.знаменатель)

  /*
   * НИКОГДА НЕ ДОРОЖЕ СЛЕДУЮЩЕГО ПАКЕТА.
   *
   * Ступенчатая скидка сама по себе даёт разрыв: по прежним числам 49 токенов
   * стоили бы 74 звезды, а 50 — 65. То есть купить БОЛЬШЕ дешевле, чем
   * меньше. Это не придирка к формуле: человек, попросивший 49 и увидевший,
   * что 50 дешевле, читает это как «касса считает как хочет».
   *
   * Разрыв достался от исходных трёх пакетов и жил незамеченным, пока цена
   * бралась только из них. Найдено проверкой монотонности при переходе на
   * произвольную сумму.
   *
   * Правило: цена за n не больше, чем цена ближайшего большего пакета.
   * Клиент при этом получает РОВНО столько токенов, сколько попросил, — просто
   * у границы скидка начинается чуть раньше. Пакеты (10, 50, 150) сами
   * являются минимумами ступеней и этим не затрагиваются.
   */
  const порогиВыше = СТУПЕНИ.filter(с => с.отТокенов > n)
  const ценыВыше = порогиВыше.map(с =>
    Math.ceil((с.отТокенов * с.числитель) / с.знаменатель)
  )
  const stars = Math.min(своя, ...ценыВыше, Number.POSITIVE_INFINITY)
  if (stars > ONE_OFF_MAX) {
    // cyrillic-ok: existing names
    throw new Error(
      `счёт на ${n} токенов — это ${stars} звёзд, а Telegram не принимает больше ${ONE_OFF_MAX} за раз; ` +
        `возьмите меньше или несколько счетов`
    )
  }
  return {
    токенов: n,
    звёзд: stars, // cyrillic-ok: existing API field
    звёздЗаТокен: ступень.числитель / ступень.знаменатель,
  }
}

/**
 * Прежние пакеты — теперь ВЫВОД из шкалы, а не отдельные числа.
 *
 * Оставлены как витрина (мини-апп показывает готовые варианты) и как якорь
 * для теста: если шкалу поправят так, что пакет изменится в цене, тест
 * покраснеет и назовёт, какой именно.
 */
export const ПАКЕТЫ = [10, 50, 150] as const

/** Название для счёта. Одно место, чтобы бот и мини-апп не расходились. */
export function названиеСчёта(токенов: number): string {
  return `${токенов} токенов Trinity`
}
