/**
 * АВТОПИЛОТ ПРОИЗВОДСТВА КОНТЕНТА.
 *
 * Проктивный цикл агента: пока человек спит, фабрика сама делает рилсы из
 * очереди тем и публикует их в ленту. Ничего не выдумывает сам — тема
 * приходит из loop/topics.json, который пополняет человек или старший
 * цикл улучшений; когда очередь пуста, автопилот честно молчит.
 *
 * КАК СЧИТАТЬСЯ С ДЕНЬГАМИ. Один пост = один рендер TrinityBlogReel без
 * платных генераций (текст/гравюра считаются локально). Платные картинки
 * подключаются флагом --with-image и проходят общий суточный лимит
 * инструментов агента (60/день на человека).
 *
 * ЗАЩИТА ОТ ЗАЦИКЛИВАНИЯ. Не более MAX_POSTS_PER_DAY постов в сутки и
 * никогда не публикуем тему, чьё название уже есть в последних постах.
 *
 * Запуск: LOOP_DIR=… npx tsx scripts/agent-autopilot.ts [--with-image]
 * Состояние: loop/state.json, журнал: LOOP_STATE.md рядом с ним.
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE =
  process.env.SELF_URL || 'http://127.0.0.1:' + (process.env.PORT || '3333')
const KEY = (process.env.AGENT_KEYS || '').split(',')[0]?.split(':')[0] || ''
if (!KEY) {
  console.error('[autopilot] нет AGENT_KEYS — ключ выдаёт владелец')
  process.exit(1)
}

const MAX_POSTS_PER_DAY = 4
const LOOP_DIR =
  process.env.LOOP_DIR || path.resolve(process.cwd(), '../../../loop')
const STATE_FILE = path.join(LOOP_DIR, 'state.json')
const TOPICS_FILE = path.join(LOOP_DIR, 'topics.json')
const LOG_FILE = path.join(LOOP_DIR, 'LOOP_STATE.md')

interface Topic {
  title: string
  subtitle: string
  lesson: string
  tags: string[]
  plates: { label: string; value: string }[]
}
interface State {
  date: string
  postsToday: number
  nextTopic: number
  /** ISO-момент последней публикации: посты разносятся по дню, а не
   *  выстреливаются четырьмя подряд в первый час новой ночи. */
  lastPostAt?: string
}

function log(line: string) {
  const stamp = new Date().toISOString()
  fs.appendFileSync(LOG_FILE, `- ${stamp} ${line}\n`)
  console.log(`[autopilot] ${line}`)
}

function readState(): State {
  const today = new Date().toISOString().slice(0, 10)
  let s: State = { date: today, postsToday: 0, nextTopic: 0 }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    if (raw.date === today) s = raw
    // Новый день обнуляет СЧЁТЧИК, но не очередь и не интервал: иначе
    // автопилот начинал бы день с прокрутки уже опубликованных тем.
    else {
      if (Number.isInteger(raw.nextTopic)) s.nextTopic = raw.nextTopic
      if (raw.lastPostAt) s.lastPostAt = raw.lastPostAt
    }
  } catch {
    /* первый запуск — состояние ещё не создано */
  }
  return s
}
function writeState(s: State) {
  fs.mkdirSync(LOOP_DIR, { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    // Рендер рилса живёт ~50–80с, картинка ~10с — потолок с запасом.
    // Без него зависший инструмент вешал автопилот навсегда.
    signal: AbortSignal.timeout(240_000),
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': KEY },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  const d = await r.json()
  if (d.error) throw new Error(`${name}: ${d.error.message}`)
  return d.result.structuredContent
}

/**
 * Темы из свежих постов блога t27.ai: заголовок и суть поста уже написаны
 * владельцем — остаётся собрать рилс-визитку. Вызывается, когда рукотворная
 * очередь близка к концу: производство не должно замолкать только потому,
 * что восемь тем кончились.
 */
async function blogTopics(published: string[]): Promise<Topic[]> {
  try {
    const r = await fetch(`${BASE}/api/blog`, {
      signal: AbortSignal.timeout(20_000),
    })
    if (!r.ok) return []
    const d = (await r.json()) as {
      items?: { title: string; description: string; pubDate: string }[]
    }
    return (d.items || [])
      .filter(it => it.title && !published.includes(it.title))
      .slice(0, 5)
      .map(it => ({
        title: it.title,
        subtitle: (it.description || '').slice(0, 110).trim(),
        lesson: 'Весь разбор с числами и единицами — на t27.ai',
        tags: ['блог', 't27'],
        plates: [
          { label: 'полный разбор', value: 't27.ai/#/blog' },
          { label: 'формат', value: 'измерение, не обещание' },
        ],
      }))
  } catch {
    return []
  }
}

/**
 * Выбор темы по отклику: смотрим, какие ХЕШТЕГИ носили прошлые посты и
 * сколько у них просмотров, и из окна ближайших тем берём ту, чьи теги
 * исторически смотрят лучше. Данных нет (или все по нулям) — берём первую:
 * детерминированность важнее псевдослучайности.
 */
function pickTopic(
  topics: Topic[],
  from: number,
  published: { description?: string; views_count?: number }[]
): number {
  const scores = new Map<string, number[]>()
  for (const post of published) {
    const tags = String(post.description || '').match(/#[\wа-яё]+/gi) || []
    for (const tag of tags) {
      const key = tag.toLowerCase()
      scores.set(key, [
        ...(scores.get(key) || []),
        Number(post.views_count) || 0,
      ])
    }
  }
  const tagScore = (tag: string) => {
    const vals = scores.get('#' + tag.toLowerCase())
    if (!vals || !vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }
  const window = [0, 1, 2].map(k => from + k).filter(i => i < topics.length)
  if (window.length <= 1) return from
  let bestIdx = window[0]
  let bestScore = -1
  for (const i of window) {
    const topic = topics[i]
    const vals = topic.tags.map(tagScore).filter((v): v is number => v != null)
    // Нет данных по тегам — тема не получает преимущества: только нули.
    const score = vals.length ? vals.reduce((a, b) => a + b, 0) : 0
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  return bestIdx
}

async function main() {
  // 0. Однопроцессность: зависший на видео-генерации автопилот не должен
  // размножаться кроном каждые 15 минут. Lock-файл с живым PID — молчаливый
  // выход; мёртвый PID (ребут/краш) локу не мешает.
  const LOCK_FILE = path.join(LOOP_DIR, '.autopilot.lock')
  try {
    const prev = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim())
    if (prev && process.kill(prev, 0)) {
      log(`уже работает автопилот (PID ${prev}) — выхожу без спора`)
      return
    }
  } catch {
    /* файла нет или PID мёртв — берём лок сами */
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid))
  const releaseLock = () => {
    try {
      fs.unlinkSync(LOCK_FILE)
    } catch {
      /* уже убран */
    }
  }
  process.on('exit', releaseLock)

  const withImage = process.argv.includes('--with-image')
  // Последний пост дня автоматически с b-roll: один видео-слой в день —
  // визуальный апгрейд канала при стабильном расходе (1 генерация/день).
  const forceVideo = process.argv.includes('--with-video')
  const state0 = readState()
  const withVideo = forceVideo || state0.postsToday === MAX_POSTS_PER_DAY - 1
  const state = state0

  // 1. Лимит постов на сегодня — главный предохранитель автономности.
  if (state.postsToday >= MAX_POSTS_PER_DAY) {
    log(
      `пост-лимит на сегодня исчерпан (${state.postsToday}/${MAX_POSTS_PER_DAY}) — молчу`
    )
    return
  }

  // 1a. Разнос по времени: 4 поста в первый час ночи — это спам, а не
  // конвейер. Минимум MIN_HOURS_BETWEEN_POSTS между публикациями.
  const MIN_HOURS_BETWEEN_POSTS = 3
  if (state.lastPostAt) {
    const elapsedH = (Date.now() - Date.parse(state.lastPostAt)) / 3_600_000
    if (elapsedH < MIN_HOURS_BETWEEN_POSTS) {
      log(
        `пост был ${elapsedH.toFixed(1)} ч назад — разнос по дню, следующий не раньше ` +
          `${MIN_HOURS_BETWEEN_POSTS} ч`
      )
      return
    }
  }

  // 2. Очередь тем. Пустая очередь — рабочая пауза, а не ошибка.
  let topics: Topic[] = []
  try {
    topics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'))
  } catch {
    log(`нет ${TOPICS_FILE} — нечего производить, добавь темы`)
    return
  }

  // 2a. Доподливка из блога: рукотворных тем осталось меньше двух — тянем
  // свежие посты t27.ai. Это то же живое производство, а не выдумка.
  const mine = await call('feed_list', { mine: true, limit: 50 })
  const names: string[] = (mine?.записи || []).map((x: any) => String(x.name))
  if (topics.length - state.nextTopic < 2) {
    const fromBlog = await blogTopics([...names, ...topics.map(t => t.title)])
    if (fromBlog.length) {
      topics.push(...fromBlog)
      fs.mkdirSync(LOOP_DIR, { recursive: true })
      fs.writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2))
      log(`очередь пополнилась из блога: +${fromBlog.length} тем`)
    }
  }

  if (!topics.length) {
    log('очередь тем пуста')
    return
  }
  const topicIndex = pickTopic(topics, state.nextTopic, mine?.записи || [])
  const topic = topics[topicIndex]
  // 3. Дубль-защита: название не должно встречаться в моих последних постах.
  if (names.some(n => n === topic.title)) {
    log(`тема «${topic.title}» уже опубликована — двигаю очередь дальше`)
    writeState({ ...state, nextTopic: topicIndex + 1 })
    return
  }

  // 4. Сборка рилса. Текстовая гравюра TrinityBlogReel не стоит ни копейки.
  const today = new Date().toISOString().slice(0, 10)
  // A/B заголовков: чётный пост дня — тема как есть (A), нечётный —
  // измеримая цифра выносится вперёд (B). Стиль пишется в
  // template_settings.ab_style, аналитика потом покажет, что смотрят.
  const abStyle = state.postsToday % 2 === 0 ? 'A' : 'B'
  let title = topic.title
  if (abStyle === 'B') {
    const plate = (topic.plates || []).find((pl: any) =>
      /\d/.test(String(pl.value))
    )
    if (plate && !title.startsWith(String(plate.value))) {
      title = `${plate.value}: ${title}`
    }
  }
  log(
    `A/B — стиль ${abStyle}${abStyle === 'B' ? ` (${title.slice(0, 50)})` : ''}`
  )
  const props: Record<string, unknown> = {
    title,
    subtitle: topic.subtitle,
    dateline: `${today} · 1 min`,
    tags: topic.tags,
    plates: topic.plates,
    lesson: topic.lesson,
    invariant: 'производство = генерация + рендер + публикация',
    url: 't27.ai',
    year: String(new Date().getFullYear()),
  }
  if (withImage) {
    try {
      const img = await call('image_generate', {
        prompt: `гравюра к посту «${topic.title}»: матовый чёрный, кремово-серебряная штриховка, золото только на заголовке`,
        height: 1536,
      })
      if (img?.сделано && typeof img.url === 'string') props.posterUrl = img.url
    } catch (e) {
      log(
        `картинка не получилась (${String(e).slice(0, 120)}) — рендерю без неё`
      )
    }
  }
  // B-roll: сгенерированное видео ложится в медальон композиции (овал,
  // grayscale) — визуальный уровень канала растёт без смены канона.
  // Автоматически — на последнем посте дня; вручную — флагом.
  if (withVideo) {
    // B-roll конвейера — расход КАНАЛА, не токенов человека (PRICING.md
    // п.5: ~$0.10/день). Напрямую в рендер-сервер с серверным ключом:
    // пользователи платят токенами, конвейер — из кассы канала.
    try {
      const BASE2 =
        process.env.SELF_URL ||
        'http://127.0.0.1:' + (process.env.PORT || '3333')
      // Две попытки: первый запуск витка №121 упал на транзиенте сети
      // («fetch failed» внутри Replicate-путья) — видео-слой слишком ценен,
      // чтобы терять его на одном миге соединения.
      const vid = await (async () => {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const res = await fetch(`${BASE2}/api/generate/video`, {
              method: 'POST',
              // Видео на Replicate живёт ~90с; без потолка зависший fetch
              // вешал автопилот навсегда (lock держит очередь крона).
              signal: AbortSignal.timeout(180_000),
              headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': process.env.RENDER_API_KEY || '',
              },
              body: JSON.stringify({
                prompt: `кинематографичный b-roll к посту «${topic.title}»: ${topic.subtitle}. Медленно, крупно, без текста в кадре`,
                duration: 5,
                aspect_ratio: '9:16',
              }),
            })
            const v = await res.json()
            if (v?.success && typeof v.url === 'string') return v
            if (attempt === 1) {
              log(
                `b-roll попытка 1 не вышла (${JSON.stringify(v).slice(0, 90)}) — повтор через 10с`
              )
              await new Promise(r => setTimeout(r, 10_000))
            } else return v
          } catch (e) {
            if (attempt === 2) throw e
            log(
              `b-roll попытка 1 упала (${String(e).slice(0, 90)}) — повтор через 10с`
            )
            await new Promise(r => setTimeout(r, 10_000))
          }
        }
      })()
      if (vid?.success && typeof vid.url === 'string') {
        props.avatarVideo = vid.url
      } else {
        log(
          `b-roll не получился (${JSON.stringify(vid).slice(0, 140)}) — рендерю без него`
        )
      }
    } catch (e) {
      log(`b-roll упал (${String(e).slice(0, 120)}) — рендерю без него`)
    }
  }
  const reel = await call('reel_render', {
    compositionId: 'TrinityBlogReel',
    props,
  })
  if (!reel?.готово || typeof reel.url !== 'string') {
    log(`рендер не удался: ${JSON.stringify(reel).slice(0, 200)}`)
    // return, а не process.exit: в режиме демона (--loop) один неудачный
    // рендер не должен убивать планировщик — следующий виток попробует снова.
    return
  }

  // 5. Публикация: текст СРАЗУ готов к переносу в Instagram — первая строка
  // хук (IG обрезает всё после неё в превью), тело с абзацами, CTA звезды,
  // блок хештегов в конце (3–5, не больше — размытие охвата), честная
  // AI-маркировка (SB 942 / EU AI Act).
  const hashtags = [
    '#TrinityS3AI',
    '#t27',
    ...topic.tags.map(t => '#' + t),
  ].slice(0, 5)
  const igText = [
    title,
    '',
    `${topic.subtitle}. ${topic.lesson}.`,
    '',
    'Понравилось? Тапни ⭐ под роликом — звезда падает автору на баланс.',
    '',
    hashtags.join(' '),
    '',
    '🤖 Собрано агентом Trinity.',
  ].join('\n')
  const pub = await call('feed_publish', {
    name: title,
    description: igText,
    video_url: reel.url,
    template_settings: {
      compositionId: 'TrinityBlogReel',
      props,
      ab_style: abStyle,
    },
  })
  if (!pub?.опубликовано) {
    log(`публикация отклонена: ${JSON.stringify(pub).slice(0, 200)}`)
    // return, а не process.exit — см. пояснение у рендера выше.
    return
  }

  writeState({
    ...state,
    postsToday: state.postsToday + 1,
    nextTopic: topicIndex + 1,
    lastPostAt: new Date().toISOString(),
  })
  log(
    `опубликован рилс «${title}» (id ${pub.id}): ${reel.url} — ` +
      `пост ${state.postsToday + 1}/${MAX_POSTS_PER_DAY} за ${state.date}`
  )
  // Отклик прошлых постов рядом с публикацией: владелец читает журнал
  // одним взглядом — производство и его цена видны в одном месте.
  try {
    const a = await call('feed_analytics')
    if (a?.постов) {
      log(
        `отклик: ${a['постов']} постов, ${a['просмотров']} просмотров, ` +
          `${a['звёзд']} звёзд, лучший — «${a['лучший_пост']?.name ?? '—'}»`
      )
    }
  } catch {
    /* аналитика — не повод падать публикации */
  }
}

/**
 * РЕЖИМ ДЕМОНА (--loop или AUTOPILOT_LOOP=1).
 *
 * До сих пор автопилот был one-shot: кто-то (крон человека) должен был звать
 * его руками. Крон не шёл — и конвейер стоял 32 часа при полной очереди тем,
 * а причину монитор списывал на провайдеров. Демон закрывает эту дыру: он
 * запускает виток сам по интервалу.
 *
 * Почему это безопасно повторять по таймеру: main() уже соблюдает суточный
 * лимит (MAX_POSTS_PER_DAY) и пустую очередь — лишний виток при исчерпанном
 * лимите просто отдохнёт, ничего не потратив. Один упавший виток больше не
 * убивает процесс (внутренние process.exit заменены на return выше), поэтому
 * планировщик переживает сбой рендера/публикации и пробует снова.
 *
 * Развёртывание: как Railway-сервис/крон с этим модулем в качестве команды и
 * AUTOPILOT_LOOP=1. Однопроцессность (не два демона разом) — забота
 * развёртывания; guard из ветки fix/autopilot-singleton решает это на уровне
 * файлового лока, если демонов запустят несколько.
 */
const LOOP =
  process.argv.includes('--loop') || process.env.AUTOPILOT_LOOP === '1'
const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.AUTOPILOT_INTERVAL_MS) || 30 * 60_000
)

async function once() {
  try {
    await main()
  } catch (e) {
    log(`падение витка: ${String(e).slice(0, 300)}`)
  }
}

if (LOOP) {
  log(`автопилот-демон: интервал ${(INTERVAL_MS / 60_000).toFixed(0)} мин`)
  await once() // первый виток сразу, не ждём интервал
  setInterval(once, INTERVAL_MS)
} else {
  main().catch(e => {
    log(`падение: ${String(e).slice(0, 300)}`)
    process.exit(1)
  })
}
