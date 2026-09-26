/**
 * ГОЛОСА ТОГО ПРОВАЙДЕРА, КОТОРЫЙ ОЗВУЧИВАЕТ НА САМОМ ДЕЛЕ.
 *
 * Экран показывал голоса ElevenLabs, а звук делал не ElevenLabs.
 *
 * Замер на боевом сервере: `GET /api/voices` отвечает 500 —
 * «ELEVENLABS_API_KEY хранит НЕ КЛЮЧ, а его идентификатор». Веб на отказе
 * подставляет три запасных имени (`sarah`, `rachel`, `josh`,
 * player/src/atoms/voices.ts), которые не являются идентификаторами голоса
 * НИГДЕ. Человек выбирал один из трёх, платил, и получал `English_Wiselady`
 * — голос MiniMax по умолчанию, потому что маршрут доходит до третьей ноги
 * (Replicate minimax/speech-02-turbo), а ей передавали ОДИН текст.
 *
 * То есть выбор голоса не значил ничего, и повторная генерация «другим
 * голосом» стоила столько же и возвращала тот же файл.
 *
 * ОТКУДА СПИСОК. Страница модели на Replicate, раздел README «MiniMax TTS
 * Voice List», снято 06.09.2026:
 *   https://replicate.com/minimax/speech-02-turbo/readme
 * Оттуда же схема входа (`voice_id`, `speed` 0.5–2.0, `language_boost`):
 *   https://replicate.com/minimax/speech-02-turbo/api/schema
 *
 * Взяты русские голоса — все восемь, что есть у провайдера, — и несколько
 * английских. Приложение русскоязычное, а список ElevenLabs был английским
 * целиком: даже работай он, русский текст читался бы с акцентом.
 *
 * Идентификаторы НЕ ПРИДУМАНЫ и не переведены: они уходят провайдеру дословно.
 * Придуманное имя здесь означало бы отказ после списания.
 */
export interface ГолосПровайдера {
  id: string
  name: string
  category: string
}

/**
 * `category` У ВСЕХ — `premade`, И ЭТО НЕ КОСМЕТИКА.
 *
 * Сначала здесь стояли `ru` и `en` — язык голоса, что казалось полезнее. Оно
 * столкнулось с двумя проверками, которые уже читают это поле и понимают под
 * ним другое: «сток или клон владельца».
 *
 * `tools.ts:1181` ищет `category !== 'premade'` и объявляет найденное голосом
 * ВЛАДЕЛЬЦА — то есть агент отчитывался бы, что озвучил клоном хозяина, взяв
 * стоковый голос MiniMax. Веб по тому же полю рисует значок клона.
 *
 * Это стоковые голоса провайдера, и `premade` — правда о них. Язык виден в
 * самом имени и никакой проверке не нужен.
 */
export const ГОЛОСА_MINIMAX: readonly ГолосПровайдера[] = [
  // — русские —
  {
    id: 'Russian_ReliableMan',
    name: 'Максим — уверенный',
    category: 'premade',
  },
  { id: 'Russian_BrightHeroine', name: 'Алиса — звонкая', category: 'premade' },
  { id: 'Russian_AmbitiousWoman', name: 'Вера — деловая', category: 'premade' },
  {
    id: 'Russian_HandsomeChildhoodFriend',
    name: 'Артём — свой парень',
    category: 'premade',
  },
  {
    id: 'Russian_AttractiveGuy',
    name: 'Егор — обаятельный',
    category: 'premade',
  },
  {
    id: 'Russian_PessimisticGirl',
    name: 'Ника — сдержанная',
    category: 'premade',
  },
  { id: 'Russian_CrazyQueen', name: 'Рита — дерзкая', category: 'premade' },
  {
    id: 'Russian_Bad-temperedBoy',
    name: 'Слава — резкий',
    category: 'premade',
  },
  // — английские —
  { id: 'English_Wiselady', name: 'Wise Lady', category: 'premade' },
  {
    id: 'English_Deep-VoicedGentleman',
    name: 'Deep-Voiced Gentleman',
    category: 'premade',
  },
  { id: 'English_CalmWoman', name: 'Calm Woman', category: 'premade' },
  {
    id: 'English_FriendlyPerson',
    name: 'Friendly Person',
    category: 'premade',
  },
  {
    id: 'English_CaptivatingStoryteller',
    name: 'Captivating Storyteller',
    category: 'premade',
  },
]

const ИЗВЕСТНЫЕ = new Set(ГОЛОСА_MINIMAX.map(г => г.id)) // cyrillic-ok: existing names

/**
 * THE OWNER'S OWN VOICE ON MINIMAX: a clone made with Replicate's
 * minimax/voice-cloning, the voice the bot's content factory speaks with
 * (src/services/contentFactory/stages.ts, FACTORY_VOICE_ID).
 *
 * Why it is here (owner, 2026-09-26): the story reel stopped at the voice.
 * ElevenLabs is down across the platform -- its env var holds the key's
 * identifier, not the key -- so audio_generate had no clone of the owner at
 * all, and without a voice there is no lipsync. This clone lives on
 * Replicate, which works.
 *
 * It is the owner's voice, so it is honoured only on a call the service
 * itself makes (`trustedClone`, the route's api-key caller), never on a voice
 * id a person types in: anyone could otherwise speak as the owner.
 */
export const OWNER_MINIMAX_CLONE = (
  process.env.OWNER_MINIMAX_VOICE_ID || 'R8_5GW2UI4A'
).trim()

/**
 * A CLONE TRAVELS IN ITS OWN FIELD, NEVER AS `voice`.
 *
 * Until 2026-09-26 the owner's clone rode in `voice` and was honoured when
 * the caller was trusted. But audio_generate forwards the model's `voice_id`
 * argument to the route with the service key -- so ANY person whose agent
 * wrote `voice_id: "R8_5GW2UI4A"` spoke as the owner. A clone (the owner's,
 * or a client's made by crm_voice_clone) now arrives only as `clone`, which
 * audio_generate fills itself from who is asking; `voice` is a library voice
 * or nothing, whoever the caller.
 *
 * The shape check keeps a stray string (a URL, a sentence) from reaching the
 * provider as an id; MiniMax ids are short tokens of letters, digits, `_`
 * and `-` (`R8_5GW2UI4A`).
 */
export function isCloneVoiceId(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(value)
  )
}

/**
 * Тот ли это голос, который MiniMax поймёт.
 *
 * Чужую строку (идентификатор ElevenLabs, запасное `sarah`, пустоту) провайдеру
 * не отдаём: он ответит отказом, а деньги уже списаны. Пусть лучше прочитает
 * голосом по умолчанию, чем не прочитает вовсе.
 */
export function голосMinimax(значение: unknown): string | undefined {
  return typeof значение === 'string' && ИЗВЕСТНЫЕ.has(значение)
    ? значение
    : undefined
}

/**
 * СКОРОСТЬ РЕЧИ В ГРАНИЦАХ, КОТОРЫЕ УМЕЕТ ПОРОДИТЬ НАШ ЖЕ ПОЛЗУНОК: 0.5–2.0.
 *
 * Имя без провайдера намеренно: функцией пользуются ДВЕ ноги. У MiniMax эти
 * границы документированы схемой модели; у ElevenLabs `speed` описан как
 * double со значением по умолчанию 1, а границ не названо вовсе
 * (elevenlabs.io/docs/api-reference/text-to-speech/convert, снято
 * 06.09.2026). Своих границ мы там не выдумываем — берём ту же вилку, что
 * даёт интерфейс (0.5–2.0 в вебе, три значения в приложении): за её пределы
 * значение прийти не может.
 *
 * Вне границ Replicate отвечает отказом на весь запрос — то есть ползунок,
 * уехавший на 2.5, стоил бы человеку денег и не дал бы ничего. Поэтому
 * прижимаем к границе, а не отбрасываем: 2.5 — это «как можно быстрее», и
 * читать так честнее, чем не читать.
 */
export function скоростьРечи(значение: unknown): number | undefined {
  const n = Number(значение)
  if (!Number.isFinite(n)) return undefined
  return Math.min(Math.max(n, 0.5), 2)
}

/**
 * Тело запроса к minimax/speech-02-turbo.
 *
 * Отдельной функцией — потому что дефект был именно в СБОРКЕ тела: она
 * принимала один `text`, и ни один тест этого не видел. Здесь её можно
 * проверить числами.
 */
export function входМиниМакс(
  text: string,
  выбор: {
    voice?: unknown
    clone?: unknown
    speed?: unknown
    trustedClone?: boolean
  } = {} // cyrillic-ok: existing parameter
): Record<string, unknown> {
  const голос = // cyrillic-ok: existing local
    выбор.trustedClone && isCloneVoiceId(выбор.clone) // cyrillic-ok: existing parameter
      ? выбор.clone // cyrillic-ok: existing parameter
      : голосMinimax(выбор.voice) // cyrillic-ok: existing names
  const скорость = скоростьРечи(выбор.speed)
  return {
    text,
    ...(голос ? { voice_id: голос } : {}),
    // Единицу не шлём: это и есть значение провайдера по умолчанию, а лишнее
    // поле в теле — лишняя причина для отказа.
    ...(скорость != null && скорость !== 1 ? { speed: скорость } : {}),
  }
}

/**
 * ИМЯ ГОЛОСА ДЛЯ ELEVENLABS — ТОЛЬКО ТО, ЧТО ELEVENLABS МОЖЕТ УЗНАТЬ.
 *
 * Первая нога маршрута озвучки (KieAI, модель ElevenLabs) принимает ИМЯ
 * голоса — «Rachel», «Sarah». Клиент шлёт `voice_name` из своего списка, а
 * список теперь MiniMax: оттуда приходит «Максим — уверенный».
 *
 * Отдать такое ElevenLabs значит получить отказ на ноге, которая пробуется
 * ПЕРВОЙ, — то есть удлинить путь до звука на один провал ради строки,
 * которую там всё равно не поймут.
 *
 * Отбор нарочно грубый и объяснимый: латиница, пробелы и дефис. Кириллица,
 * тире и цифры отсеиваются. Не угадали — остаётся голос по умолчанию, и это
 * ровно то, что было до появления выбора.
 */
export function имяДляElevenLabs(значение: unknown): string | undefined {
  if (typeof значение !== 'string') return undefined
  const имя = значение.trim()
  if (!имя || имя.length > 40) return undefined
  return /^[A-Za-z][A-Za-z \-']*$/.test(имя) ? имя : undefined
}

/**
 * THE BOT IS SPOKEN AS "TRINITY" (owner, 2026-09-26).
 *
 * "The bot is always read as TRINITY, otherwise it reads the numbers
 * crookedly and nobody understands it." The story reel spelled the name out
 * letter by letter ("es-three ay-eye dee-en-ay") -- a line of letters and a
 * digit -- and a TTS voice turns `S³AI DNA` into worse. The written name stays on screen and
 * in captions; the SPOKEN name is one word. Done here, before the voice, so
 * it holds whoever wrote the line: the agent, a template, or a person.
 */
const HAS_CYRILLIC = /[А-Яа-яЁё]/ // cyrillic-ok: the character class itself
const BRAND_FULL = /\bTrinity\s*S\s*[³3]\s*AI(?:\s*DNA)?\b/gi
const BRAND_SPELLED =
  /Тринити\s+эс[\s-]*три[\s-]*эй[\s-]*ай(?:[\s-]*ди[\s-]*эн[\s-]*эй)?/gi // cyrillic-ok: the spelled-out reading this replaces
const BRAND_BARE = /\bS\s*[³3]\s*AI(?:\s*DNA)?\b/gi

export function spokenBrand(text: string): string {
  const name = HAS_CYRILLIC.test(text) ? 'Тринити' : 'Trinity' // cyrillic-ok: the spoken name
  return text
    .replace(BRAND_FULL, name)
    .replace(BRAND_SPELLED, name)
    .replace(BRAND_BARE, name)
    .replace(/\bTrinity\b/g, name)
}
