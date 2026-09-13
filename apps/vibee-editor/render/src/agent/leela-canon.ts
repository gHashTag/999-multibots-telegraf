import plansRu from '../assets/leela-plans.ru.json'
import plansEn from '../assets/leela-plans.en.json'

/**
 * Leela (Leela Chakra) canon: board geometry, snakes, arrows, rows and the
 * 72 plan texts -- the data every Leela reel and the `leela_plan` tool read
 * from.
 *
 * SOURCE OF TRUTH IS THE ENGINE, NOT THE MODEL. The constants below mirror
 * `packages/engine/src/board.ts` of gHashTag/leela; the plan texts are copied
 * verbatim from `packages/content/data/plans.{ru,en}.json`. Nothing here is
 * paraphrased, and nothing in a reel may be paraphrased from here either:
 * the game's own rule is "the model never supplies the teaching".
 *
 * Board layout (boustrophedon, counted from the BOTTOM-LEFT):
 *
 *   row 8 (top):    72 71 70 69 68 67 66 65 64
 *   row 7:          55 56 57 58 59 60 61 62 63
 *   ...
 *   row 2:          18 17 16 15 14 13 12 11 10
 *   row 1 (bottom):  1  2  3  4  5  6  7  8  9
 *
 * 72 is the top-left corner; 68 is the centre of the top row (WIN_LOKA).
 */

export const WIN_LOKA = 68
export const START_LOKA = 6
export const PLAN_COUNT = 72
export const BOARD_COLUMNS = 9
export const BOARD_ROWS = 8

/** Snake head -> tail. A snake is checked before an arrow on the same cell. */
export const SNAKES: Record<number, number> = {
  12: 8,
  16: 4,
  24: 7,
  29: 6,
  44: 9,
  52: 35,
  55: 3,
  61: 13,
  63: 2,
  72: 51,
}

/** Arrow foot -> tip. */
export const ARROWS: Record<number, number> = {
  10: 23,
  17: 69,
  20: 32,
  22: 60,
  27: 41,
  28: 50,
  37: 66,
  45: 67,
  46: 62,
  54: 68,
}

export type LeelaLang = 'ru' | 'en'

export interface LeelaRow {
  /** 1 = bottom row, 8 = top row. */
  index: number
  /** Inclusive plan range [from, to]. */
  plans: [number, number]
  chakraRu: string
  chakraEn: string
  /**
   * Inlay colour for the row (thin line or card tint, never a cell fill).
   * Rows 1-6 follow the chakra colours named in the rules text; rows 7 and 8
   * are an EDITORIAL INFERENCE -- the rules text names no colour for them.
   */
  inlay: string
}

/** Eight rows, bottom -> top. */
export const ROWS: LeelaRow[] = [
  { index: 1, plans: [1, 9], chakraRu: 'Муладхара', chakraEn: 'Muladhara', inlay: '#8c3a2a' },
  { index: 2, plans: [10, 18], chakraRu: 'Свадхистхана', chakraEn: 'Svadhisthana', inlay: '#b5612a' },
  { index: 3, plans: [19, 27], chakraRu: 'Манипура', chakraEn: 'Manipura', inlay: '#b8912f' },
  { index: 4, plans: [28, 36], chakraRu: 'Анахата', chakraEn: 'Anahata', inlay: '#35624a' },
  { index: 5, plans: [37, 45], chakraRu: 'Вишуддха', chakraEn: 'Vishuddha', inlay: '#4a7a8c' },
  { index: 6, plans: [46, 54], chakraRu: 'Аджна', chakraEn: 'Ajna', inlay: '#2f5fd0' },
  // Rows 7-8: colours are an editorial inference, not canon (see LeelaRow.inlay).
  { index: 7, plans: [55, 63], chakraRu: 'Сахасрара', chakraEn: 'Sahasrara', inlay: '#6b4a8c' },
  { index: 8, plans: [64, 72], chakraRu: 'за пределами чакр', chakraEn: 'beyond the chakras', inlay: '#e0b544' },
]

export interface BoardCell {
  /** 0 = leftmost column, 8 = rightmost. */
  col: number
  /** 0 = bottom row, 7 = top row. */
  row: number
}

/**
 * Boustrophedon cell of a plan. Row 0 (bottom) runs left -> right, row 1
 * right -> left, and so on; the top row therefore reads 72 ... 64 with 72 at
 * col 0 and 68 at col 4.
 */
export function boardCell(plan: number): BoardCell {
  const p = Math.min(PLAN_COUNT, Math.max(1, Math.floor(plan)))
  const row = Math.floor((p - 1) / BOARD_COLUMNS)
  const offset = (p - 1) % BOARD_COLUMNS
  const col = row % 2 === 0 ? offset : BOARD_COLUMNS - 1 - offset
  return { col, row }
}

export function rowOf(plan: number): LeelaRow {
  return ROWS[boardCell(plan).row]
}

export type LeelaEvent = 'snake' | 'arrow' | 'none'

export interface PlanRecord {
  plan: number
  title: string
  description: string
}

export const PLANS: Record<LeelaLang, PlanRecord[]> = {
  ru: plansRu as PlanRecord[],
  en: plansEn as PlanRecord[],
}

/**
 * Ready hooks (<= 12 words) from the editorial content plan and the reel
 * ideas list. Only plans that have an approved hook are listed; every other
 * plan gets an empty array and the reel falls back to the canonical title.
 */
const HOOKS: Record<LeelaLang, Record<number, string[]>> = {
  ru: {
    6: ['Первая клетка игры называется Заблуждение. Не случайно.'],
    68: ['68 на старте — ещё не победа.'],
    72: ['Последний номер поля — не финиш.'],
    12: ['Змея меняет положение фишки, не ваше достоинство.'],
    17: ['Самая длинная стрела на доске начинается с сострадания.'],
    26: ['Печаль — покрывало. Дыхание стеснено, момент кажется вечностью.'],
    55: ['Восторг от стрелы и уныние от змеи — уже эгоизм.'],
    63: ['Попытка избежать кармы — тоже карма.'],
    46: ['Голос различения нельзя обойти — от него не убежать.'],
    54: ['Капля осознаёт океан внутри — и стрела переносит её.'],
    10: ['Замок сознания имеет пять входов.'],
    24: ['Виноваты все вокруг — знакомый разговор?'],
  },
  en: {
    6: ['The first square of the game is called Delusion. Not by chance.'],
    68: ['68 at the start is not yet a win.'],
    72: ['The last number on the board is not the finish.'],
    12: ['A snake moves the piece, not your worth.'],
    17: ['The longest arrow on the board begins with compassion.'],
    26: ['Sorrow is a veil. Breath is tight, a moment feels endless.'],
    55: ['Joy at an arrow, gloom at a snake: that is already ego.'],
    63: ['Trying to escape karma is karma too.'],
    46: ['The voice of discernment cannot be bypassed or outrun.'],
    54: ['A drop knows the ocean within, and the arrow carries it.'],
    10: ['The castle of consciousness has five entrances.'],
    24: ['Everyone around is to blame. Sound familiar?'],
  },
}

export interface PlanInfo {
  plan: number
  title: string
  description: string
  /** 1..8, bottom -> top. */
  row: number
  /** Chakra name in the requested language. */
  chakra: string
  event: LeelaEvent
  /** Destination cell when `event` is a snake or an arrow. */
  to?: number
  hooks: string[]
}

export function planInfo(plan: number, lang: LeelaLang = 'ru'): PlanInfo {
  const p = Math.min(PLAN_COUNT, Math.max(1, Math.floor(plan)))
  const rec = PLANS[lang].find(r => r.plan === p) ?? PLANS.ru.find(r => r.plan === p)!
  const row = rowOf(p)
  const event: LeelaEvent = SNAKES[p] ? 'snake' : ARROWS[p] ? 'arrow' : 'none'
  const to = event === 'snake' ? SNAKES[p] : event === 'arrow' ? ARROWS[p] : undefined
  return {
    plan: p,
    title: rec.title,
    description: rec.description,
    row: row.index,
    chakra: lang === 'ru' ? row.chakraRu : row.chakraEn,
    event,
    ...(to !== undefined ? { to } : {}),
    hooks: HOOKS[lang][p] ?? [],
  }
}

/**
 * First sentence(s) of the canonical description, cut at a sentence boundary
 * so the quote never ends mid-word. Falls back to the whole text when it fits.
 */
export function canonQuote(description: string, maxChars = 220): string {
  const text = description.trim()
  if (text.length <= maxChars) return text
  const parts = text.match(/[^.!?…]+[.!?…]+["»')]?\s*/g) ?? [text]
  let out = ''
  for (const s of parts) {
    if ((out + s).trim().length > maxChars) break
    out += s
  }
  if (out.trim()) return out.trim()
  // The first sentence alone is longer than the budget: cut at a word.
  const cut = text.slice(0, maxChars)
  return cut.slice(0, cut.lastIndexOf(' ')).trim() + '…'
}

/**
 * RU pressure stop-list, copied from `packages/ai/src/guide.ts`
 * (PROACTIVE_PRESSURE): the companion is forbidden to count absence, create
 * urgency, praise unclaimed progress or diagnose. The same list applies to
 * every public post and reel.
 */
export const PRESSURE_WORDS =
  /отсутств|пропал|пропад|давно|серия|сроч|сегодня|сейчас же|немедл|последний шанс|избег|боишь|страх|не так|проблем|сопротивл|прогресс|горж|улучш|молодец|отличн|успех/giu // cyrillic-ok: RU stop-list regex

/** Claims the editorial SOUL forbids: superlatives, guarantees, prophecy, diagnosis. */
const CLAIM_WORDS = /первый|единственный|лучший|гарант|предсказ|диагноз/giu // cyrillic-ok: RU regex

/** A number followed by a Stars unit reads as a price; prices are never public. */
const PRICE_PATTERN = /\d+\s*(?:⭐|звёзд|звезд|stars?|xtr)/giu // cyrillic-ok: RU regex

/**
 * Returns every fragment of `text` that breaks the Leela voice: pressure
 * words, forbidden claims, and prices in Stars. Empty array = clean.
 */
export function violatesLeelaVoice(text: string): string[] {
  const hits: string[] = []
  for (const re of [PRESSURE_WORDS, CLAIM_WORDS, PRICE_PATTERN]) {
    re.lastIndex = 0
    for (const m of text.matchAll(re)) hits.push(m[0])
  }
  return hits
}

export const LEELA_CTA_RU =
  'Здесь нет правильного ответа. Приходите на доску со своим вопросом.'
export const LEELA_CTA_EN =
  'There is no right answer. Bring your own question to the board.'
export const LEELA_PLAY_RU = '🎲 Играть в Лилу'
export const LEELA_PLAY_EN = '🎲 Play Leela'
export const LEELA_TAGLINE_RU = 'Игра самопознания — 72 плана'
export const LEELA_TAGLINE_EN = 'The game of self-knowledge — 72 plans'
export const LEELA_URL = 't27.ai/leela'
export const LEELA_BOT = '@leela_chakra_ai_bot'
