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
 * FACE AND VOICE. The --face flag (or AUTOPILOT_FACE=1) switches the cycle to
 * SplitTalkingHead using the owner's own clip named in loop/face-source.json.
 * OFF by default, and with the flag off the file is not even read. The input
 * contract and the refusal texts live in src/face-source.ts; nothing is
 * synthesised -- the speech is the audio track of the owner's own clip.
 *
 * TALKING PORTRAIT. AUTOPILOT_PORTRAIT=off|dry|on decides who gets the oval
 * medallion on the last post of the day: nobody (off, today's behaviour and the
 * silent b-roll), a costed rehearsal that spends nothing (dry), or the owner's
 * own still animated to his own voice track by veed/fabric-1 (on). The ceiling,
 * the floor and the spend ledger are in src/talking-portrait.ts; every refusal
 * falls back to the text engraving and is written into the published recipe.
 *
 * Run: LOOP_DIR=... npx tsx scripts/agent-autopilot.ts [--with-image] [--face]
 * Состояние: loop/state.json, журнал: LOOP_STATE.md рядом с ним.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  cursorFor,
  loadState,
  ownerFromEnv,
  paidSlotDue,
  saveState,
  withDb,
  type AutopilotState,
} from '../src/autopilot-state'
import { deliverToChannel } from '../src/channel-delivery'
import { readFaceSourceFile } from '../src/face-source'
import { claimSpend, settleSpend, spendClaimId } from '../src/broll-spend'
import {
  attemptTalkingPortrait,
  kieProvider,
  portraitRecord,
  readPortraitConfig,
  s3Mirror,
  SPEND_TABLE,
  type PortraitResult,
} from '../src/talking-portrait'

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

/**
 * THE FACE REEL IS OFF UNTIL SOMEBODY TURNS IT ON, AND IT NEEDS OWNER MEDIA.
 *
 * SplitTalkingHead has no voiceover input: the reel's speech IS the soundtrack
 * of the clip handed to it (SplitTalkingHead.tsx:992). So a face reel is not
 * something the factory can generate -- it is something the owner supplies,
 * once, as a file. Everything about it is refused rather than guessed; see
 * src/face-source.ts for the contract and the refusal texts.
 *
 * WHY A SWITCH RATHER THAN A HEURISTIC. The clip's script is fixed, so this
 * path produces the SAME video every time it runs. It must not become the
 * default rhythm of a channel, and the title requirement plus the existing
 * name dedupe below cap it at one publication per source. Nothing changes for
 * anyone who does not pass the flag: with FACE_MODE false the branch is not
 * entered and no file is read.
 */
const FACE_MODE =
  process.argv.includes('--face') || process.env.AUTOPILOT_FACE === '1'
const FACE_SOURCE_FILE =
  process.env.AUTOPILOT_FACE_SOURCE || path.join(LOOP_DIR, 'face-source.json')

/**
 * THE TALKING PORTRAIT, OFF UNTIL SOMEBODY SETS THREE VARIABLES.
 *
 * This is the OTHER paid layer, and it competes with the b-roll for the same
 * slot: the medallion of the engraving on the last post of the day. With the
 * switch off, `readPortraitConfig` returns mode 'off', the branch below is not
 * entered, no file is read, no provider is called and the b-roll path runs
 * exactly as it did before -- which is what the tests pin.
 *
 * WHY IT TAKES THE SLOT INSTEAD OF ADDING TO IT. Paying for a b-roll after a
 * refused portrait would be two provider bills for one oval. One slot, one
 * charge, and the refusal is recorded in the published recipe.
 *
 * The whole contract, the ceiling and the ledger live in src/talking-portrait.ts
 * -- in src/ because `tsc --listFilesOnly` shows ZERO files under scripts/, so
 * logic put beside this script is invisible to `npm run typecheck`.
 */
const PORTRAIT = readPortraitConfig(process.env)
const PORTRAIT_SPEND_FILE = path.join(LOOP_DIR, 'portrait-spend.json')

interface Topic {
  title: string
  subtitle: string
  lesson: string
  tags: string[]
  plates: { label: string; value: string }[]
}
/**
 * The shape moved to src/autopilot-state.ts together with its persistence.
 * lastPostAt is the ISO moment of the last publication: posts are spread over
 * the day instead of firing four in a row in the first hour of a new night.
 */
type State = AutopilotState

/** Whose row in autopilot_state this process owns. */
const OWNER = ownerFromEnv()

/** Обработчик снятия лока вешается один раз на весь процесс (см. main). */
let lockReleaseRegistered = false

/**
 * The log directory must exist before the FIRST line is written.
 *
 * log() appended to LOG_FILE without creating its directory, and daemon mode
 * logs its startup line before the first cycle. In a container LOOP_DIR
 * defaults to a path that does not exist, so the process died on ENOENT before
 * doing any work -- and under a restart-always policy that is an infinite crash
 * loop, not a visible failure. Reproduced 2026-08-29 with LOOP_DIR=/tmp/nope.
 */
fs.mkdirSync(LOOP_DIR, { recursive: true })

function log(line: string) {
  const stamp = new Date().toISOString()
  fs.appendFileSync(LOG_FILE, `- ${stamp} ${line}\n`)
  console.log(`[autopilot] ${line}`)
}

/**
 * STATE LIVES IN POSTGRES NOW; THE FILE IS THE FLOOR, NOT THE RECORD.
 *
 * loop/state.json is inside the container and this project has no volumes, so
 * every deploy wiped the queue cursor back to 0 and the autopilot then burned
 * one 30-minute tick per already-published topic to walk it forward again. The
 * day-reset rule, the merge and the fallbacks all live in src/autopilot-state.ts
 * -- the only place `npm run typecheck` can see them, since nothing under
 * scripts/ is in any tsconfig include.
 */
async function readState(): Promise<State> {
  const today = new Date().toISOString().slice(0, 10)
  return withDb(db =>
    loadState({ db, owner: OWNER, stateFile: STATE_FILE, today, log })
  )
}
async function writeState(s: State): Promise<void> {
  await withDb(db =>
    saveState({ db, owner: OWNER, stateFile: STATE_FILE, state: s, log })
  )
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
    // prev !== process.pid обязателен для режима демона: там main() вызывается
    // повторно в ОДНОМ процессе, lock-файл между витками держит наш же PID, и
    // без этой проверки второй виток увидел бы «уже работаю» и вышел — демон
    // отработал бы раз и замолчал навсегда. Наложение витков внутри процесса
    // отсекается отдельно, в once() ниже.
    if (prev && prev !== process.pid && process.kill(prev, 0)) {
      log(`уже работает автопилот (PID ${prev}) — выхожу без спора`)
      return
    }
  } catch {
    /* файла нет или PID мёртв — берём лок сами */
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid))
  // Снимаем лок на выходе процесса — но регистрируем обработчик ОДИН раз.
  // В режиме демона main() вызывается многократно; без этого флага на каждый
  // виток вешался бы новый слушатель 'exit', и после десятка витков Node
  // ругался бы MaxListenersExceededWarning.
  if (!lockReleaseRegistered) {
    lockReleaseRegistered = true
    process.on('exit', () => {
      try {
        fs.unlinkSync(path.join(LOOP_DIR, '.autopilot.lock'))
      } catch {
        /* уже убран */
      }
    })
  }

  /**
   * THE ENGRAVING IS ON BY DEFAULT NOW. That switch IS the outage.
   *
   * It was gated behind `--with-image`, and the only thing that launches this
   * script in production -- the supervised child spawned in render-server.ts --
   * never passed it. Nothing else launches it: no crontab, no npm script, no
   * Dockerfile. So /api/generate/image was never called by the factory at all.
   * Two independent witnesses agreed: posterUrl is absent from all 12 newest
   * feed rows, and the service log holds not one `[Generate]` line, while the
   * b-roll layer eleven lines below -- same function, same try/catch, gated on
   * no flag -- did produce artefacts. A feature switched on nowhere is a
   * deleted feature that still ships a comment claiming it works.
   *
   * Off stays reachable, because it spends money: AUTOPILOT_IMAGE=0 or
   * --no-image. `--with-image` still means yes and overrides the env.
   */
  const withImage =
    process.argv.includes('--with-image') ||
    (!process.argv.includes('--no-image') &&
      process.env.AUTOPILOT_IMAGE !== '0')
  // Последний пост дня автоматически с b-roll: один видео-слой в день —
  // визуальный апгрейд канала при стабильном расходе (1 генерация/день).
  const forceVideo = process.argv.includes('--with-video')
  const state0 = await readState()
  const state = state0

  /**
   * THE DAILY CAP IS COUNTED FROM THE FEED, NOT FROM A LOCAL FILE.
   *
   * state.json lives in the container filesystem and this project has NO
   * volumes (checked: 0 in the Railway project), so every redeploy wipes it and
   * postsToday resets to 0. With the daemon now running in the render service,
   * which redeploys on every merge, the cap would reset several times a day and
   * the factory could publish far more than four posts -- into a public feed.
   *
   * The feed is the durable record of what was actually published, so it is the
   * honest source for "how many went out today". The local counter is kept as a
   * floor: it is still correct within one container lifetime, and if the feed
   * read fails we do not silently lose the cap.
   */
  let postedToday = state.postsToday
  let feedRecords: { name?: string; created_at?: string }[] = []
  try {
    const seen = await call('feed_list', { mine: true, limit: 50 })
    feedRecords = seen?.записи || [] // cyrillic-ok: tool response field
    const today = new Date().toISOString().slice(0, 10)
    const fromFeed = feedRecords.filter(r =>
      // created_at arrives as "2026-08-29 04:28:41.205461+00": a space instead
      // of T. Comparing the date prefix needs no parsing and cannot NaN.
      String(r.created_at || '').startsWith(today)
    ).length
    if (fromFeed > postedToday) {
      log(
        `лента знает больше: сегодня уже ${fromFeed} постов (локально ${postedToday})`
      )
      postedToday = fromFeed
    }
  } catch (e) {
    log(`не смог прочитать ленту для лимита: ${String(e).slice(0, 100)}`)
  }

  // The rule and the evidence behind it live in src/autopilot-state.ts, where
  // typecheck and a unit test can both reach them. It reads `postedToday` --
  // the same number the cap below uses -- and not the local-file counter it
  // used to read, which stops agreeing with the cap after any deploy.
  const withVideo = paidSlotDue(postedToday, MAX_POSTS_PER_DAY, forceVideo)

  // 1. Лимит постов на сегодня — главный предохранитель автономности.
  if (postedToday >= MAX_POSTS_PER_DAY) {
    log(
      `пост-лимит на сегодня исчерпан (${postedToday}/${MAX_POSTS_PER_DAY}) — молчу`
    )
    return
  }

  // 1a. Разнос по времени: 4 поста в первый час ночи — это спам, а не
  // конвейер. Минимум MIN_HOURS_BETWEEN_POSTS между публикациями.
  const MIN_HOURS_BETWEEN_POSTS = 3
  // The newest feed entry is a floor for "when did we last post": like the
  // daily count, lastPostAt lives in an ephemeral file and a redeploy would
  // otherwise let the spacing rule be skipped.
  const newestFeedAt = feedRecords
    .map(r =>
      String(r.created_at || '')
        .replace(' ', 'T')
        .replace(/([+-]\d\d)$/, '$1:00')
    )
    .filter(v => !Number.isNaN(Date.parse(v)))
    .sort()
    .pop()
  const lastPostAt =
    newestFeedAt && (!state.lastPostAt || newestFeedAt > state.lastPostAt)
      ? newestFeedAt
      : state.lastPostAt
  if (lastPostAt) {
    const elapsedH = (Date.now() - Date.parse(lastPostAt)) / 3_600_000
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
    // A MISSING FILE IS NOT A REASON TO GO SILENT FOREVER.
    //
    // This used to `return` here, which meant a fresh container -- where the
    // queue file does not exist yet -- never reached the blog top-up below and
    // produced nothing, ever. The daemon would wake every 30 minutes only to
    // log the same line. Start from an empty queue instead and let the top-up
    // fill it: the blog is a live source, so the factory can bootstrap itself.
    log(`нет ${TOPICS_FILE} — начинаю с пустой очереди, пополню из блога`)
    topics = []
  }

  // 2a. Доподливка из блога: рукотворных тем осталось меньше двух — тянем
  // свежие посты t27.ai. Это то же живое производство, а не выдумка.
  const mine = { записи: feedRecords } // cyrillic-ok: response field
  const names: string[] = (mine?.записи || []).map((x: any) => String(x.name))
  // The same title-resolved cursor the pick below uses: asking "how much queue
  // is left" against a stale raw index would top up at the wrong moment.
  if (
    topics.length -
      cursorFor(
        state,
        topics.map(t => t.title)
      ) <
    2
  ) {
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
  /**
   * The cursor is resolved by TITLE, not by the bare index it was saved as.
   *
   * loop/topics.json is git-tracked and the Dockerfile re-seeds it on every
   * deploy, so a durable index can point past the end of a freshly re-seeded
   * array. Before this was persisted the same deploy also reset the index to 0
   * and hid the problem; pickTopic returns `from` unchanged when its window is
   * empty, and the next line would have dereferenced undefined -- a TypeError
   * every cycle, i.e. a 60-second respawn loop in one-shot mode.
   */
  const topicIndex = pickTopic(
    topics,
    cursorFor(
      state,
      topics.map(t => t.title)
    ),
    mine?.записи || [] // cyrillic-ok: tool response field
  )
  const topic = topics[topicIndex]
  if (!topic) {
    log('очередь тем исчерпана — жду пополнения')
    return
  }
  // 3. Дубль-защита: название не должно встречаться в моих последних постах.
  if (names.some(n => n === topic.title)) {
    log(`тема «${topic.title}» уже опубликована — двигаю очередь дальше`)
    await writeState({
      ...state,
      nextTopic: topicIndex + 1,
      lastTopic: topic.title,
    })
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
  /**
   * WHAT HAPPENED TO THE ENGRAVING, WRITTEN WHERE IT SURVIVES THE CONTAINER.
   *
   * THE CALL ITSELF WAS ONCE DELETED WHILE ITS SWITCH SURVIVED. An edit
   * rewrote `withImage` above to default ON, with a comment saying that a
   * feature switched on nowhere is a deleted feature -- and removed the only
   * statement that read it, leaving the comment describing a call that no
   * longer existed and `posterUrl` newly declared in the schema with nothing
   * producing it. `grep -n posterUrl` matched the comment and nothing else, and
   * `tsc` cannot see this file to complain about the unused constant. Which is
   * the argument for the record below: the layer must say what it did somewhere
   * that outlives both the container and the comment.
   *
   * `poster` goes into the published recipe beside `talking`: state
   * delivered/refused/off, the reason in the provider's own words, which leg
   * served, and every leg that refused. Null only when the layer was not asked
   * at all, so a row published with it off stays byte-identical to what this
   * factory published before.
   *
   * WHY AN ARTEFACT AND NOT A LOG LINE. LOOP_STATE.md and stdout live in a
   * container with no volume; a redeploy erases both, and there is one on every
   * merge. That is not a hypothetical loss -- it is exactly why "why is there no
   * engraving on any of these posts" had no answer for weeks and had to be
   * re-derived from the outside by counting `posterUrl` in the feed. A row in
   * public_templates is queryable over HTTP by anyone, forever.
   */
  let poster: Record<string, unknown> | null = null
  /**
   * THE ENGRAVING IS CLAIMED BEFORE IT IS BOUGHT, for the same reason the
   * b-roll is (src/broll-spend.ts) -- and this layer bleeds faster.
   *
   * The b-roll runs on the day's LAST post; the engraving runs on EVERY post
   * and defaults ON (AUTOPILOT_IMAGE is unset in the deploy, and the supervisor
   * spawns this script with no arguments). So a cycle that dies between paying
   * FAL for the image and the post-publication writeState re-buys the engraving
   * on the next tick, for the same topic, every thirty minutes.
   *
   * The house exemption does NOT protect against this: it waives the agent's
   * TOKENS, while the provider is paid out of the channel's purse either way.
   */
  const posterClaimKey = spendClaimId('poster', today, topic.title)
  const posterClaim = withImage
    ? await withDb(db =>
        claimSpend(
          db,
          {
            id: posterClaimKey,
            owner: OWNER,
            day: today,
            spendTable: SPEND_TABLE,
          },
          log
        )
      ).catch(() => 'silent' as const)
    : ('skip' as const)
  if (posterClaim === 'taken' || posterClaim === 'silent') {
    /**
     * A SKIPPED LAYER SAYS SO IN THE ARTEFACT, not only in the log.
     *
     * `poster` stays null when the layer was never asked, and the publish site
     * below omits the key entirely in that case -- the contract stated a few
     * lines up. Leaving null here would make a claim-blocked cycle
     * byte-identical to a deployment with the engraving switched off, which is
     * precisely the silence that once left "why is there no engraving on any of
     * these posts" unanswerable for weeks. The log does not cover it: stdout
     * lives in a container with no volume, and there is a redeploy on every
     * merge.
     */
    poster = {
      state: 'skipped',
      reason:
        posterClaim === 'taken'
          ? 'заявка на эту тему уже взята сегодня' // cyrillic-ok: artefact text
          : 'журнал расходов не ответил', // cyrillic-ok: artefact text
      provider: null,
      tried: [],
    }
    log(
      posterClaim === 'taken'
        ? 'гравюра: для этой темы сегодня уже оплачена, второй раз не плачу'
        : 'гравюра: трачу только под запись, пропускаю слой'
    )
  }
  if (withImage && (posterClaim === 'claimed' || posterClaim === 'no-db')) {
    try {
      const img = await call('image_generate', {
        prompt: `гравюра к посту «${topic.title}»: матовый чёрный, кремово-серебряная штриховка, золото только на заголовке`,
        height: 1536,
      })
      // Bracket access, not a dotted identifier: the guard reads a Cyrillic
      // property name in code as a Russian identifier, and inside a string it
      // is what it actually is -- the tool's own response field.
      if (img?.['сделано'] && typeof img.url === 'string') {
        props.posterUrl = img.url
        // Settle the row; it is never released, see src/broll-spend.ts.
        await withDb(db => settleSpend(db, posterClaimKey, log)).catch(
          () => undefined
        )
        poster = {
          state: 'delivered',
          provider: img.provider ?? null,
          tried: img.tried ?? [],
        }
      } else {
        /**
         * THE BRANCH THAT DID NOT EXIST, AND THAT IS THE WHOLE OUTAGE.
         *
         * `call()` throws only on a JSON-RPC `error`; image_generate reports
         * every real failure -- exhausted daily cap, no tokens, provider
         * refusal, S3 refusal -- as a NORMAL result whose done-flag is false
         * and whose reason field carries the text.
         * So the guard above was simply false and execution walked straight on:
         * no log, no record, no red, nothing. The catch below never saw any of
         * it, because nothing was ever thrown. A swallow this total is
         * indistinguishable from a feature that was never switched on.
         */
        const why = String(img?.['причина'] ?? 'инструмент промолчал').slice(
          0,
          300
        )
        poster = {
          state: 'refused',
          reason: why,
          provider: img?.provider ?? null,
          tried: img?.tried ?? [],
        }
        log(`гравюра не вышла: ${why} — рендерю без неё`)
      }
    } catch (e) {
      // Transport only: the tool itself does not throw for a refusal.
      const why = String(e).slice(0, 300)
      poster = { state: 'refused', reason: why, provider: null, tried: [] }
      log(`картинка не получилась (${why.slice(0, 120)}) — рендерю без неё`)
    }
  }
  /**
   * THE MEDALLION'S ONE PAID SLOT, and who gets it.
   *
   * `talking` is the record of the attempt that goes into the published recipe:
   * requested / delivered / refused with the reason, plus the credits and the
   * clip seconds. Until now the whole story lived in a log file inside a
   * container with no volume, so "why is this one silent" had no answer a check
   * could read. Null when the switch is off: an untouched feed row is how "off
   * changes nothing" stays true for the artefact as well as the render.
   */
  let talking: Record<string, unknown> | null = null
  /**
   * WHAT THE PORTRAIT ATTEMPT COST, which is what decides who gets the oval
   * next. -1 means "the portrait was never asked", i.e. the switch is off.
   *
   * "One slot, one charge" is right only for a refusal that already SPENT. A
   * missing AUTOPILOT_PORTRAIT_IMAGE, a ceiling that bit, an unreadable balance
   * -- all three refuse before a single credit moves, and all three used to
   * leave the medallion empty anyway, because the b-roll sat in an `else if` on
   * the switch rather than on the money. Turning the switch on then made the
   * channel visibly WORSE than leaving it off, for free, on the day the owner
   * mistyped a variable name.
   */
  let portraitCredits = -1
  if (withVideo && PORTRAIT.mode !== 'off') {
    const result = await withDb(db =>
      attemptTalkingPortrait({
        config: PORTRAIT,
        provider: kieProvider({ apiBase: PORTRAIT.apiBase, key: PORTRAIT.key }),
        ledger: {
          db,
          owner: OWNER,
          file: PORTRAIT_SPEND_FILE,
          log,
        },
        mirror: s3Mirror({
          selfUrl: BASE,
          apiKey: process.env.RENDER_API_KEY || '',
        }),
        day: today,
        log,
      })
    ).catch((e: unknown): PortraitResult => {
      // The module is written not to throw; this belt exists because an escaped
      // error here would cost the whole cycle, and a cycle costs 30 minutes.
      log(`портрет: сорвался неожиданно (${String(e).slice(0, 140)})`)
      return { state: 'refused', reason: 'внутренний сбой', credits: 0 }
    })
    talking = portraitRecord(PORTRAIT, result)
    portraitCredits = result.credits
    if (result.state === 'delivered' && result.url) {
      props.avatarVideo = result.url
      // 1, not the schema's silent default: this clip is the one that talks.
      props.avatarVideoVolume = 1
      props.avatarVideoSeconds = result.seconds
    } else {
      log(
        `портрет: медальон не занят (${result.state}) — ` +
          `${result.reason || 'без причины'}; ` +
          (result.credits > 0
            ? `${result.credits} кредитов уже потрачено, второй раз за один овал не плачу`
            : 'кредитов не потрачено, овал отдаю прежнему b-roll')
      )
    }
  }
  /**
   * WHO ACTUALLY FILLS THE OVAL, decided by money rather than by the switch.
   *
   * Three ways in: the portrait was never asked (switch off, portraitCredits
   * -1, the behaviour every published reel so far has had); the portrait was
   * asked and refused without spending (0, so the free-ish b-roll is still
   * owed); the portrait spent (>0, the day is charged and the oval stays as it
   * is -- empty on a refusal, the talking clip on a delivery).
   *
   * `!props.avatarVideo` is the belt: a delivered portrait always spent, so the
   * clause is redundant today and would be the only thing standing between a
   * future zero-cost delivery and a b-roll overwriting it.
   */
  /**
   * CLAIM THE CLIP BEFORE THE MONEY MOVES.
   *
   * This layer was authorised purely by durable SUCCESS state and left no trace
   * of itself: the cycle's only write happens after publication (writeState,
   * below). So everything between paying for the clip and that write -- the
   * render ceiling, a publish failure, a redeploy killing the child -- left the
   * durable state byte-identical to before the spend. The next tick re-derived
   * the same authorisation, picked the same topic, and bought the clip AGAIN,
   * while the one already paid for was persisted nowhere.
   *
   * Same shape the portrait uses one layer above -- an intent row written
   * BEFORE the provider is told anything -- keyed per topic. Only 'claimed'
   * (the row is ours) and 'no-db' (nothing durable was ever promised, which is
   * the portrait module's own deliberate choice) may spend. The contract and
   * the reasoning live in src/broll-spend.ts, where typecheck can see them.
   *
   * The condition is folded into this `if` rather than wrapping the block
   * below: that block is full of pre-existing Russian comments, and re-indenting
   * them would present them to the no-cyrillic gate as newly added lines.
   */
  const brollWanted = withVideo && portraitCredits <= 0 && !props.avatarVideo
  const brollClaimKey = spendClaimId('broll', today, topic.title)
  const brollClaim = brollWanted
    ? await withDb(db =>
        claimSpend(
          db,
          {
            id: brollClaimKey,
            owner: OWNER,
            day: today,
            spendTable: SPEND_TABLE,
          },
          log
        )
      ).catch(() => 'silent' as const)
    : ('skip' as const)
  if (brollClaim === 'taken') {
    log('b-roll: клип для этой темы сегодня уже куплен, второй раз не плачу')
  } else if (brollClaim === 'silent') {
    log('b-roll: трачу только под запись, пропускаю слой')
  }
  if (brollWanted && (brollClaim === 'claimed' || brollClaim === 'no-db')) {
    // THE OLD PAID LAYER, UNCHANGED: a silent generated b-roll dropped into the
    // same oval.
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
        // Settle the row; it is never released, see src/broll-spend.ts.
        await withDb(db => settleSpend(db, brollClaimKey, log)).catch(
          () => undefined
        )
      } else {
        log(
          `b-roll не получился (${JSON.stringify(vid).slice(0, 140)}) — рендерю без него`
        )
      }
    } catch (e) {
      log(`b-roll упал (${String(e).slice(0, 120)}) — рендерю без него`)
    }
  }
  /**
   * FACE REEL: the owner's own clip instead of the text engraving, if and only
   * if the switch is on AND the file validates AND it has not gone out before.
   *
   * Three separate ways to say no, and each one falls back to the engraving
   * rather than stopping the cycle -- a factory that goes silent because an
   * optional file is missing is worse than one that keeps making what it can.
   * Every refusal is logged in full: the whole point of the contract is that a
   * person can read WHY and fix it, instead of getting a reel with a missing
   * layer and a success line.
   */
  let compositionId = 'TrinityBlogReel'
  let renderProps: Record<string, unknown> = props
  let faceDescription = ''
  if (FACE_MODE) {
    const face = readFaceSourceFile(FACE_SOURCE_FILE, p =>
      fs.readFileSync(p, 'utf8')
    )
    if (!face.ok) {
      log(`--face: источник отклонён (${face.refusals.length} причин)`)
      for (const why of face.refusals) log(`--face отказ: ${why}`)
      log('--face: рендерю обычную текстовую гравюру')
    } else if (names.some(n => n === face.title)) {
      // The cap. One source is one fixed 26-second artefact; re-posting it
      // under a new topic title would be the same video pretending to be new.
      log(
        `--face: «${face.title}» уже опубликован — второй раз тот же клип не шлю`
      )
    } else {
      compositionId = 'SplitTalkingHead'
      renderProps = face.props
      title = face.title
      faceDescription = face.description
      for (const note of face.notes) log(`--face: ${note}`)
      log(
        `--face: рендерю SplitTalkingHead из ${FACE_SOURCE_FILE} — ` +
          `${face.durationSeconds.toFixed(2)} с, ` +
          `${(face.props.segments as unknown[]).length} сегментов, ` +
          `${(face.props.captions as unknown[]).length} субтитров. ` +
          'Голос — это дорожка самого клипа, синтеза здесь нет'
      )
    }
  }

  /**
   * TWO ATTEMPTS, because the first one after a deploy reliably loses.
   *
   * This was the only risky call in the cycle without a retry, and the first
   * daemon tick in production proved why: at container boot the Remotion bundle
   * is still warming, the render exceeded the 240s timeout, and the whole cycle
   * was lost with "падение витка: TimeoutError". Nothing was broken -- the work
   * simply had to wait, and the cycle had no way to wait.
   *
   * A second attempt after a pause costs 30 seconds; losing the cycle costs 30
   * minutes and a post. The neighbouring b-roll call already retries for
   * exactly this reason.
   */
  let reel = await call('reel_render', {
    compositionId,
    props: renderProps,
  }).catch((e: unknown) => {
    log(`рендер, попытка 1 не удалась: ${String(e).slice(0, 140)}`)
    return null
  })
  const rendered = reel?.готово // cyrillic-ok: tool response field
  if (!rendered) {
    await new Promise(r => setTimeout(r, 30_000))
    reel = await call('reel_render', {
      compositionId,
      props: renderProps,
    }).catch((e: unknown) => {
      log(`рендер, попытка 2 не удалась: ${String(e).slice(0, 140)}`)
      return null
    })
  }
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
    // A face reel is not about the queued topic -- its words are the clip's
    // own. Describing it with the topic's subtitle would caption one video
    // with another video's meaning.
    faceDescription || `${topic.subtitle}. ${topic.lesson}.`,
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
      compositionId,
      props: renderProps,
      ab_style: abStyle,
      // Present only when the portrait switch is on, so a feed row published
      // with it off is byte-identical to what this factory published before.
      ...(talking ? { talking } : {}),
      // Same rule for the engraving: absent when the layer was not asked,
      // present with a reason whenever it was asked and could not deliver.
      // This is the field the feed-level check reads, and the reason a silent
      // image layer can never again look like a layer nobody switched on.
      ...(poster ? { poster } : {}),
    },
  })
  if (!pub?.опубликовано) {
    log(`публикация отклонена: ${JSON.stringify(pub).slice(0, 200)}`)
    // return, а не process.exit — см. пояснение у рендера выше.
    return
  }

  await writeState({
    ...state,
    postsToday: state.postsToday + 1,
    nextTopic: topicIndex + 1,
    // The title, not just the index: topics.json is re-seeded on every deploy,
    // so the index alone cannot say where the queue really stands.
    lastTopic: topic.title,
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

/**
 * CHANNEL DELIVERY ON EVERY TICK, not at the end of a successful cycle.
 *
 * main() returns before publishing in six places: the daily cap, the 3-hour
 * spacing rule, an empty queue, an exhausted cursor, a duplicate title and a
 * failed render. Those quiet ticks are exactly when the backlog has to move --
 * a step placed after feed_publish would run only at the moment the live path
 * has already delivered.
 *
 * Its own try/catch: a channel refusal has no right to stop production. The
 * delivery module does not throw outward either (see src/channel-delivery.ts);
 * this is the second belt, not the first.
 */
async function channelTick() {
  try {
    await withDb(db => deliverToChannel({ db, log }))
  } catch (e) {
    log(`канал: доставка сорвалась (${String(e).slice(0, 200)})`)
  }
}

let виток_идёт = false
async function once() {
  // Наложение витков в одном процессе: setInterval выстрелит по расписанию,
  // даже если прошлый виток ещё рендерит (рендер живёт до ~80с). Второй виток
  // поверх первого — двойная публикация и спор за lock. Пропускаем.
  if (виток_идёт) {
    log('прошлый виток ещё идёт — пропускаю тик')
    return
  }
  виток_идёт = true
  try {
    try {
      await main()
    } catch (e) {
      log(`падение витка: ${String(e).slice(0, 300)}`)
    }
    await channelTick()
  } finally {
    виток_идёт = false
  }
}

if (LOOP) {
  log(`автопилот-демон: интервал ${(INTERVAL_MS / 60_000).toFixed(0)} мин`)
  // NO TOP-LEVEL AWAIT HERE.
  //
  // This package is CommonJS (no "type": "module"), so tsx/esbuild refuses to
  // transform a top-level await and fails BEFORE running a single line:
  //   ERROR: Top-level await is currently not supported with the "cjs" output
  // The daemon-mode change (#881) introduced it and thereby broke BOTH modes --
  // including the one-shot path that had been working, since the transform
  // fails whatever LOOP is set to. The script was simply unrunnable from that
  // commit until 2026-08-29, which is the real reason the factory produced
  // nothing even when it had tokens.
  //
  // An async IIFE keeps the "run once immediately, then on an interval"
  // behaviour without asking the module system for anything.
  void (async () => {
    await once() // run the first cycle immediately, do not wait out the interval
    setInterval(once, INTERVAL_MS)
  })()
} else {
  main().catch(e => {
    log(`падение: ${String(e).slice(0, 300)}`)
    process.exit(1)
  })
}
