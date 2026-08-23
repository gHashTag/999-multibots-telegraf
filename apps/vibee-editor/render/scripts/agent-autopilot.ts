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
const LOOP_DIR = process.env.LOOP_DIR || path.resolve(process.cwd(), '../../../loop')
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
    const r = await fetch(`${BASE}/api/blog`)
    if (!r.ok) return []
    const d = (await r.json()) as { items?: { title: string; description: string; pubDate: string }[] }
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

async function main() {
  const withImage = process.argv.includes('--with-image')
  const state = readState()

  // 1. Лимит постов на сегодня — главный предохранитель автономности.
  if (state.postsToday >= MAX_POSTS_PER_DAY) {
    log(`пост-лимит на сегодня исчерпан (${state.postsToday}/${MAX_POSTS_PER_DAY}) — молчу`)
    return
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
  const topic = topics[state.nextTopic % topics.length]
  // 3. Дубль-защита: название не должно встречаться в моих последних постах.
  if (names.some(n => n === topic.title)) {
    log(`тема «${topic.title}» уже опубликована — двигаю очередь дальше`)
    writeState({ ...state, nextTopic: state.nextTopic + 1 })
    return
  }

  // 4. Сборка рилса. Текстовая гравюра TrinityBlogReel не стоит ни копейки.
  const today = new Date().toISOString().slice(0, 10)
  const props: Record<string, unknown> = {
    title: topic.title,
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
      log(`картинка не получилась (${String(e).slice(0, 120)}) — рендерю без неё`)
    }
  }
  const reel = await call('reel_render', {
    compositionId: 'TrinityBlogReel',
    props,
  })
  if (!reel?.готово || typeof reel.url !== 'string') {
    log(`рендер не удался: ${JSON.stringify(reel).slice(0, 200)}`)
    process.exit(1)
  }

  // 5. Публикация с каноническим текстом и хештегами.
  const hashtags = ['#TrinityS3AI', '#t27', ...topic.tags.map(t => '#' + t)]
  const pub = await call('feed_publish', {
    name: topic.title,
    description: `${topic.subtitle}. ${topic.lesson}.\n\n${hashtags.join(' ')}`,
    video_url: reel.url,
    template_settings: { compositionId: 'TrinityBlogReel', props },
  })
  if (!pub?.опубликовано) {
    log(`публикация отклонена: ${JSON.stringify(pub).slice(0, 200)}`)
    process.exit(1)
  }

  writeState({
    ...state,
    postsToday: state.postsToday + 1,
    nextTopic: state.nextTopic + 1,
  })
  log(
    `опубликован рилс «${topic.title}» (id ${pub.id}): ${reel.url} — ` +
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

main().catch(e => {
  log(`падение: ${String(e).slice(0, 300)}`)
  process.exit(1)
})
