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
  { id: 'Russian_ReliableMan', name: 'Максим — уверенный', category: 'premade' },
  { id: 'Russian_BrightHeroine', name: 'Алиса — звонкая', category: 'premade' },
  { id: 'Russian_AmbitiousWoman', name: 'Вера — деловая', category: 'premade' },
  { id: 'Russian_HandsomeChildhoodFriend', name: 'Артём — свой парень', category: 'premade' },
  { id: 'Russian_AttractiveGuy', name: 'Егор — обаятельный', category: 'premade' },
  { id: 'Russian_PessimisticGirl', name: 'Ника — сдержанная', category: 'premade' },
  { id: 'Russian_CrazyQueen', name: 'Рита — дерзкая', category: 'premade' },
  { id: 'Russian_Bad-temperedBoy', name: 'Слава — резкий', category: 'premade' },
  // — английские —
  { id: 'English_Wiselady', name: 'Wise Lady', category: 'premade' },
  { id: 'English_Deep-VoicedGentleman', name: 'Deep-Voiced Gentleman', category: 'premade' },
  { id: 'English_CalmWoman', name: 'Calm Woman', category: 'premade' },
  { id: 'English_FriendlyPerson', name: 'Friendly Person', category: 'premade' },
  { id: 'English_CaptivatingStoryteller', name: 'Captivating Storyteller', category: 'premade' },
]

const ИЗВЕСТНЫЕ = new Set(ГОЛОСА_MINIMAX.map(г => г.id))

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
  выбор: { voice?: unknown; speed?: unknown } = {}
): Record<string, unknown> {
  const голос = голосMinimax(выбор.voice)
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
