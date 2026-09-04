import {
  СЕБЕСТОИМОСТЬ_USD,
  ЕДИНИЦА_ЦЕНЫ,
} from './kie-prices.generated'
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

const COST_PER_TOKEN_USD = 0.005
/** Себестоимость операций, $ (оценки Replicate/рынка — см. PRICING.md). */
const OPERATION_COST_USD: Record<string, number> = {
  image_generate: 0.003,
  video_generate: 0.1,
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
   * 0.015 / 0.005 = 3 токена вместо 18.
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
const НАЦЕНКА = 2.0

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
  return Math.ceil((cost * НАЦЕНКА) / COST_PER_TOKEN_USD)
}

/** Единица, за которую берётся цена: «за секунду», «за картинку». */
export function unitForKieModel(modelId: string): string | null {
  return ЕДИНИЦА_ЦЕНЫ[modelId] ?? null
}

/** Цена = ceil(себестоимость / база). Источник значений — расчёт, не руки. */
export function priceFor(op: string): number {
  const cost = OPERATION_COST_USD[op]
  if (cost == null) return 0
  return Math.ceil(cost / COST_PER_TOKEN_USD)
}
export const TOKEN_PRICES: Record<string, number> = {
  image_generate: priceFor('image_generate'), // 1
  audio_generate: priceFor('audio_generate'), // 6
  lipsync_generate: priceFor('lipsync_generate'), // 3 per audio second
  reel_render: priceFor('reel_render'), // 1
  video_generate: priceFor('video_generate'), // 20
}

/** Пул, минимально типизированный: и pg.Pool, и обёртки подходят. */
type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

async function ensureRow(pool: Pool, tid: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_tokens (telegram_id, balance)
     VALUES ($1, 20) ON CONFLICT (telegram_id) DO NOTHING`,
    [tid]
  )
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
}> {
  if (владелец(tid)) {
    // Пишем в журнал: бесплатная генерация обязана быть видимой, иначе
    // «почему счётчик не двигается» станет загадкой, а не решением.
    console.log(`💳 владелец ${tid}: ${op} без списания квоты`)
    return { ok: true, списано: 0 }
  }

  const кие =
    typeof modelId === 'string' && modelId.startsWith('kie/')
      ? priceForKieModel(modelId.slice(4))
      : null
  const unitPrice = кие ?? TOKEN_PRICES[op]
  if (!unitPrice) return { ok: true }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 3600) {
    return { ok: false, причина: 'invalid billing quantity' } // cyrillic-ok: public API field
  }
  const price = unitPrice * quantity
  await ensureRow(pool, tid)
  const r = await pool.query(
    `UPDATE user_tokens SET balance = balance - $2, updated_at = now()
     WHERE telegram_id = $1 AND balance >= $2 RETURNING balance`,
    [tid, price]
  )
  if (r.rows.length === 0) {
    const b = await pool.query(
      `SELECT balance FROM user_tokens WHERE telegram_id = $1`,
      [tid]
    )
    return {
      ok: false,
      причина: `не хватает токенов: нужно ${price}, есть ${b.rows[0]?.balance ?? 0}`,
    }
  }
  return { ok: true, списано: price, осталось: r.rows[0].balance }
}

/** Возврат, если работа не сделана. Без него сбой провайдера списывал бы токен. */
export async function refundByTid(
  pool: Pool,
  tid: string,
  op: string,
  quantity = 1
): Promise<void> {
  const price = TOKEN_PRICES[op] * quantity
  if (!price) return
  try {
    await pool.query(
      `UPDATE user_tokens SET balance = balance + $2, updated_at = now()
       WHERE telegram_id = $1`,
      [tid, price]
    )
    console.log(`[токены] возврат ${price} за «${op}»`)
  } catch (e) {
    console.error('[токены] возврат не прошёл:', e)
  }
}
