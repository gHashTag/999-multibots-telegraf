/**
 * THE TALKING PORTRAIT: A STILL OF THE OWNER THAT SPEAKS, INSIDE THE MEDALLION.
 *
 * WHAT IT REPLACES. The oval medallion of TrinityBlogReel already accepts a
 * video (2 of the last 8 live feed entries carry `avatarVideo`), but that video
 * is a silent Replicate b-roll and the component hardcoded `muted`. This module
 * produces the other kind of clip: the owner's own portrait animated to his own
 * voice track by veed/fabric-1 on Kie, so the face in the oval says the words
 * instead of decorating them.
 *
 * WHY EVERYTHING HERE IS ABOUT MONEY. veed/fabric-1 is priced at 18 credits per
 * second (src/config/lipsync-models.config.ts, VEED_FABRIC, "kie.ai: 18
 * credits"), against a measured balance of about 6930 credits on 2026-08-31 --
 * the SAME balance that funds `image_edit`, a shipped user-facing tool costing
 * about 8.3 credits per edit (src/kie-image.ts). A 6-second portrait is 108
 * credits, i.e. thirteen customer edits. The factory therefore may not spend
 * without three things being true at once: a ceiling for the day, a floor under
 * the balance, and a durable RECORD of the attempt written BEFORE the provider
 * is called.
 *
 * THE RECORD IS WRITTEN FIRST, AND THAT IS THE WHOLE POINT. The autopilot pays
 * for the paid layer at the top of the cycle and renders afterwards; a failed
 * render returns without advancing any counter, so the next 30-minute tick
 * repeats the same work. At today's $0.10 Replicate b-roll that is invisible.
 * At 18 credits per second it is up to 48 paid generations in one day -- the
 * entire balance, with nothing published. A counter read before the work cannot
 * stop that. An intent row written before the createTask can, because the
 * ceiling is checked against the SUM of rows, not against a count of successes.
 *
 * NOTHING HERE THROWS OUTWARD. Every refusal is a value with a reason attached,
 * because the caller's only correct reaction is to render the text engraving
 * anyway and say why. A factory that goes silent over an optional layer is
 * worse than one that keeps making what it can -- the rule src/face-source.ts
 * already states for the face reel.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Db, Log } from './autopilot-state'

/** kie.ai price of veed/fabric-1, from src/config/lipsync-models.config.ts. */
export const CREDITS_PER_SECOND = 18

/**
 * The clip length the factory buys, in seconds, and its hard ceiling.
 *
 * 6 s = 108 credits = 1.6% of the measured balance. The medallion's window in
 * TrinityBlogReel is 15.6 s, which would be 281 credits and about six days of
 * runway -- a number the composition happens to produce, not a number anyone
 * chose. 8 s (144 credits) is the most the daily ceiling below will pass.
 */
export const DEFAULT_SECONDS = 6
export const MAX_SECONDS = 8

/**
 * THE CEILING AND THE FLOOR, both derived rather than picked.
 *
 * Ceiling: MAX_SECONDS x CREDITS_PER_SECOND = 144 credits per day, i.e. one
 * talking portrait in the paid slot the autopilot already reserves (the last
 * post of the four). 2.1% of the balance per day.
 *
 * Floor: 2000 credits reserved for `image_edit`, about 240 customer edits, so
 * the factory cannot starve the product a human actually touches.
 */
export const DEFAULT_DAILY_CREDITS = MAX_SECONDS * CREDITS_PER_SECOND
export const CREDIT_FLOOR = 2000

/** The only model measured to exist for this job (scripts/kie-probe.mjs). */
export const MODEL = 'veed/fabric-1'
export const API_BASE = 'https://api.kie.ai/api/v1'

/**
 * Query-tolerant, unlike the `$`-anchored test the medallion used to carry.
 * A provider URL ending in `?token=...` would fail an anchored test, fall to
 * the <Img> branch and render an empty oval while reporting success.
 */
export const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|opus|flac)(\?|#|$)/i

/**
 * EVERY ENVIRONMENT NAME THIS FEATURE READS, IN ONE TABLE.
 *
 * Read through the table, never as `process.env.LITERAL`, for the same reason
 * src/channel-delivery.ts does it: channel-env-contract.test.ts classifies these
 * names against the deploy manifest, and a table is something a test can
 * enumerate. `AUTOPILOT_FACE` shipped reading a name production does not define
 * and nothing noticed, because the autopilot script sat outside that test's
 * scan region. It does not any more.
 */
export const PORTRAIT_ENV = {
  mode: 'AUTOPILOT_PORTRAIT',
  image: 'AUTOPILOT_PORTRAIT_IMAGE',
  audio: 'AUTOPILOT_PORTRAIT_AUDIO',
  seconds: 'AUTOPILOT_PORTRAIT_SECONDS',
  dailyCredits: 'AUTOPILOT_PORTRAIT_DAILY_CREDITS',
  apiBase: 'AUTOPILOT_PORTRAIT_API',
  key: 'KIE_AI_API_KEY',
} as const

export type Env = Record<string, string | undefined>

/**
 * THREE POSITIONS, NOT TWO.
 *
 * `dry` runs everything up to and including the credit preflight, reports the
 * exact clip length and cost it WOULD have spent, and renders the engraving. It
 * is the only way to test the wiring in production without paying -- and the
 * only thing that would have shown, before any credits moved, that the
 * medallion was muted.
 */
export type PortraitMode = 'off' | 'dry' | 'on'

export interface PortraitConfig {
  mode: PortraitMode
  imageUrl: string
  audioUrl: string
  seconds: number
  plannedCredits: number
  dailyCredits: number
  apiBase: string
  key: string
  /** Why it cannot run although it is switched on. Empty means it can. */
  refusals: string[]
  /** Adjustments made to what the owner asked for, each worth logging. */
  notes: string[]
}

function num(raw: string | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return null
  const v = Number(raw)
  return Number.isFinite(v) ? v : null
}

export function plannedCreditsFor(seconds: number): number {
  return Math.round(seconds * CREDITS_PER_SECOND)
}

/**
 * Read the switch and its settings. Pure: the caller hands in the environment,
 * so a test never mutates process.env and can never accidentally read the
 * developer's own key.
 */
export function readPortraitConfig(env: Env): PortraitConfig {
  const raw = String(env[PORTRAIT_ENV.mode] || '')
    .trim()
    .toLowerCase()
  const mode: PortraitMode =
    raw === '1' || raw === 'on' || raw === 'true'
      ? 'on'
      : raw === 'dry' || raw === 'dry-run'
        ? 'dry'
        : 'off'

  const notes: string[] = []
  const refusals: string[] = []

  let seconds = num(env[PORTRAIT_ENV.seconds]) ?? DEFAULT_SECONDS
  if (seconds <= 0) {
    notes.push(
      `${PORTRAIT_ENV.seconds}=${env[PORTRAIT_ENV.seconds]} — не длительность, беру ${DEFAULT_SECONDS} с`
    )
    seconds = DEFAULT_SECONDS
  }
  if (seconds > MAX_SECONDS) {
    notes.push(
      `${seconds} с — это ${plannedCreditsFor(seconds)} кредитов; режу до потолка ${MAX_SECONDS} с`
    )
    seconds = MAX_SECONDS
  }
  seconds = Math.round(seconds * 100) / 100

  const dailyCredits = Math.max(
    0,
    num(env[PORTRAIT_ENV.dailyCredits]) ?? DEFAULT_DAILY_CREDITS
  )

  const imageUrl = String(env[PORTRAIT_ENV.image] || '').trim()
  const audioUrl = String(env[PORTRAIT_ENV.audio] || '').trim()

  if (mode !== 'off') {
    // veed/fabric-1 needs BOTH, and the audio must be a real file: measured
    // 2026-08-31, a bare string is refused with "audio_url file type not
    // supported" -- after the request, not before it.
    if (!imageUrl) {
      refusals.push(
        `нет ${PORTRAIT_ENV.image} — портрет владельца задаёт владелец, ` +
          'сам себе лицо фабрика не выдумывает'
      )
    } else if (!/^https?:\/\//i.test(imageUrl)) {
      refusals.push(
        `${PORTRAIT_ENV.image} должен быть абсолютным http(s)-адресом: провайдер ` +
          'скачивает файл сам, локальный путь ему недоступен'
      )
    }
    if (!audioUrl) {
      refusals.push(
        `нет ${PORTRAIT_ENV.audio} — голос это файл владельца, здесь ничего не синтезируется`
      )
    } else if (!/^https?:\/\//i.test(audioUrl)) {
      refusals.push(
        `${PORTRAIT_ENV.audio} должен быть абсолютным http(s)-адресом`
      )
    } else if (!AUDIO_EXT.test(audioUrl)) {
      refusals.push(
        `${PORTRAIT_ENV.audio} не похож на звуковой файл (${audioUrl.slice(0, 60)}): ` +
          'veed/fabric-1 отвечает «audio_url file type not supported» уже после запроса'
      )
    }
    if (!String(env[PORTRAIT_ENV.key] || '').trim()) {
      refusals.push(
        `нет ${PORTRAIT_ENV.key} — провайдер проверяется ДО списания, а не после`
      )
    }
  }

  return {
    mode,
    imageUrl,
    audioUrl,
    seconds,
    plannedCredits: plannedCreditsFor(seconds),
    dailyCredits,
    apiBase: String(env[PORTRAIT_ENV.apiBase] || '').trim() || API_BASE,
    key: String(env[PORTRAIT_ENV.key] || '').trim(),
    refusals,
    notes,
  }
}

/* ------------------------------------------------------------------ ledger */

export type SpendState = 'intent' | 'delivered' | 'refused' | 'timeout'

export interface SpendRecord {
  id: string
  day: string
  state: SpendState
  /** Credits this attempt is answerable for. The ceiling sums this column. */
  credits: number
  seconds?: number
  taskId?: string
  reason?: string
  at: string
}

export const SPEND_TABLE = `CREATE TABLE IF NOT EXISTS autopilot_spend (
     id text PRIMARY KEY,
     owner text NOT NULL,
     day date NOT NULL,
     state text NOT NULL,
     credits numeric NOT NULL DEFAULT 0,
     seconds numeric,
     task_id text,
     reason text,
     at timestamptz NOT NULL DEFAULT now()
   )`

export const SPEND_UPSERT = `INSERT INTO autopilot_spend
     (id, owner, day, state, credits, seconds, task_id, reason, at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
   ON CONFLICT (id) DO UPDATE SET
     state = EXCLUDED.state,
     credits = EXCLUDED.credits,
     seconds = COALESCE(EXCLUDED.seconds, autopilot_spend.seconds),
     task_id = COALESCE(EXCLUDED.task_id, autopilot_spend.task_id),
     reason = EXCLUDED.reason`

export const SPEND_SUM = `SELECT COALESCE(SUM(credits), 0)::float8 AS credits
     FROM autopilot_spend WHERE owner = $1 AND day = $2`

export interface Ledger {
  db: Db | null
  owner: string
  /** The within-container floor, same demotion autopilot-state.ts describes. */
  file: string
  log: Log
}

function readFileRows(file: string): SpendRecord[] {
  try {
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(rows) ? (rows as SpendRecord[]) : []
  } catch {
    return [] // first run, or the deploy that wiped the container
  }
}

/**
 * What the day has already cost, taken as the LARGER of the two sources.
 *
 * Both are floors, never authorities -- the rule the feed-derived daily cap and
 * mergeState already follow. A database write can fail after the file write
 * succeeded; taking the maximum means neither failure can lower the ceiling.
 * Returns null for "no ledger answered", which the caller must treat as a
 * refusal: money without a record is exactly the hole this module closes.
 *
 * WHY "DATABASE NOT CONFIGURED" AND "DATABASE UNREACHABLE" ARE DIFFERENT
 * ANSWERS, and why collapsing them was the bug that made the whole day's
 * ceiling refundable.
 *
 * The file half lives at LOOP_DIR/portrait-spend.json inside a container with
 * NO volumes (render-server.ts sets LOOP_DIR to <render>/loop), so every deploy
 * wipes it. Read the two sources as interchangeable and this follows: deploy,
 * one clip bought, container replaced, the file is gone, Postgres blinks for
 * the two seconds of the SELECT -- the file sums to 0, the max of {0} is 0, and
 * a ceiling that was fully spent an hour ago is fully available again. Bounded
 * after that only by the 2000-credit floor, i.e. about 44 clips.
 *
 * So the durable half is expected whenever DATABASE_URL is set (which is what a
 * non-null `db` means here -- openDb returns null only when the variable is
 * absent, never on a connection failure, because pg connects lazily). If it was
 * expected and did not answer, the day is UNBOUNDED and this returns null: the
 * caller refuses and the reel gets its engraving. A blink costs one optional
 * layer; trusting the blink costs the balance.
 *
 * With no DATABASE_URL at all the file IS the ledger by deliberate choice, and
 * a missing file then means a day on which nothing has been bought yet -- not
 * an unanswered question. Without that distinction the first run in any fresh
 * container refused forever and the feature could never work at all.
 */
export async function ledgerSpentToday(
  l: Ledger,
  day: string
): Promise<{ credits: number | null; sources: string[] }> {
  const sources: string[] = []
  let fileSum: number | null = null
  if (fs.existsSync(l.file)) {
    fileSum = readFileRows(l.file)
      .filter(r => r?.day === day)
      .reduce((a, r) => a + (Number(r.credits) || 0), 0)
    sources.push(`файл ${fileSum}`)
  } else {
    sources.push('файла нет')
  }

  if (!l.db) {
    // No durable half was ever promised: the file is the whole ledger, and an
    // absent file is an empty day rather than an unanswered question.
    return { credits: fileSum ?? 0, sources: [...sources, 'базы нет'] }
  }

  try {
    await l.db.query(SPEND_TABLE)
    const r = await l.db.query(SPEND_SUM, [l.owner, day])
    const dbSum = Number(r?.rows?.[0]?.credits) || 0
    sources.push(`база ${dbSum}`)
    return { credits: Math.max(fileSum ?? 0, dbSum), sources }
  } catch (e) {
    l.log(
      `портрет: журнал расходов в базе недоступен (${String(e).slice(0, 100)})` +
        ` — файл в контейнере без тома не заменяет его, отказываюсь тратить`
    )
    return { credits: null, sources: [...sources, 'база молчит'] }
  }
}

/**
 * Write to BOTH sinks; true when at least one accepted.
 *
 * A false here stops the spend. That is deliberate and it is the only place in
 * this module where a bookkeeping failure blocks work: an unrecorded generation
 * is precisely the state in which the repeat-spend loop cannot be seen.
 */
export async function ledgerWrite(
  l: Ledger,
  row: SpendRecord
): Promise<boolean> {
  let ok = false
  try {
    fs.mkdirSync(path.dirname(l.file), { recursive: true })
    const rows = readFileRows(l.file).filter(r => r?.id !== row.id)
    rows.push(row)
    // Keep the tail only: this file is a floor, not an archive.
    fs.writeFileSync(l.file, JSON.stringify(rows.slice(-100), null, 2))
    ok = true
  } catch (e) {
    l.log(`портрет: журнал-файл не записан (${String(e).slice(0, 100)})`)
  }
  if (l.db) {
    try {
      await l.db.query(SPEND_TABLE)
      await l.db.query(SPEND_UPSERT, [
        row.id,
        l.owner,
        row.day,
        row.state,
        row.credits,
        row.seconds ?? null,
        row.taskId ?? null,
        row.reason ?? null,
      ])
      ok = true
    } catch (e) {
      l.log(
        `портрет: журнал-база не приняла запись (${String(e).slice(0, 100)})`
      )
    }
  }
  return ok
}

/* ---------------------------------------------------------------- provider */

export interface CreateTaskAnswer {
  taskId?: string
  message: string
}
export interface RecordInfoAnswer {
  state: string
  urls: string[]
  message: string
}

export interface PortraitProvider {
  /** Free, and the only endpoint that answers for balance (kie-image.ts). */
  credits(): Promise<number | null>
  createTask(input: {
    imageUrl: string
    audioUrl: string
  }): Promise<CreateTaskAnswer>
  /** recordInfo, NOT taskStatus: taskStatus answers HTTP 404 on this account. */
  recordInfo(taskId: string): Promise<RecordInfoAnswer>
}

type Fetch = typeof fetch

async function kieCall(
  base: string,
  key: string,
  route: string,
  init: RequestInit,
  ms: number,
  f: Fetch
): Promise<{ status: number; json: any; text: string }> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await f(`${base}${route}`, {
      ...init,
      signal: c.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    })
    const text = await r.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      /* keep the text: it is still evidence for the caller's log */
    }
    return { status: r.status, json, text }
  } catch (e: any) {
    return { status: 0, json: null, text: String(e?.message || e) }
  } finally {
    clearTimeout(t)
  }
}

export function kieProvider(opts: {
  apiBase: string
  key: string
  fetchImpl?: Fetch
}): PortraitProvider {
  const f = opts.fetchImpl || fetch
  return {
    async credits() {
      const r = await kieCall(
        opts.apiBase,
        opts.key,
        '/chat/credit',
        { method: 'GET' },
        15_000,
        f
      )
      const v = r.json?.data
      return typeof v === 'number' ? v : null
    },
    async createTask(input) {
      const r = await kieCall(
        opts.apiBase,
        opts.key,
        '/jobs/createTask',
        {
          method: 'POST',
          body: JSON.stringify({
            model: MODEL,
            // Exactly the two keys the model asks for. Measured: an unknown
            // extra key is not worth guessing when a rejection costs a cycle.
            input: { image_url: input.imageUrl, audio_url: input.audioUrl },
          }),
        },
        30_000,
        f
      )
      const taskId = r.json?.data?.taskId || r.json?.data?.task_id
      return {
        taskId: typeof taskId === 'string' && taskId ? taskId : undefined,
        message: String(r.json?.msg || r.json?.message || r.text).slice(0, 200),
      }
    },
    async recordInfo(taskId) {
      const r = await kieCall(
        opts.apiBase,
        opts.key,
        `/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { method: 'GET' },
        30_000,
        f
      )
      const d = r.json?.data
      let urls: string[] = []
      try {
        urls = JSON.parse(d?.resultJson || '{}').resultUrls || []
      } catch {
        /* an unparsable result is an empty result; the caller refuses */
      }
      return {
        state: String(d?.state || ''),
        urls: Array.isArray(urls)
          ? urls.filter(u => typeof u === 'string')
          : [],
        message: String(d?.failMsg || r.json?.msg || r.text || '').slice(
          0,
          200
        ),
      }
    },
  }
}

/**
 * The provider's URL is temporary. Unmirrored it becomes a broken oval an hour
 * after publication -- the feed entry keeps the link, and the link expires.
 */
export type Mirror = (url: string) => Promise<string | null>

export function s3Mirror(opts: {
  selfUrl: string
  apiKey: string
  fetchImpl?: Fetch
}): Mirror {
  const f = opts.fetchImpl || fetch
  return async (url: string) => {
    try {
      const src = await f(url, { signal: AbortSignal.timeout(120_000) })
      if (!src.ok) return null
      const bytes = Buffer.from(await src.arrayBuffer())
      if (!bytes.length) return null
      const up = await f(`${opts.selfUrl}/upload`, {
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
        headers: {
          'Content-Type': 'video/mp4',
          'X-Filename': `portrait-${Date.now()}.mp4`,
          'X-Api-Key': opts.apiKey,
        },
        body: new Uint8Array(bytes),
      })
      const data: any = await up.json().catch(() => null)
      const direct = data?.directUrl || data?.url
      return typeof direct === 'string' && direct ? direct : null
    } catch {
      return null
    }
  }
}

/* ----------------------------------------------------------------- attempt */

export interface PortraitResult {
  state: 'off' | 'dry' | 'delivered' | 'refused'
  reason?: string
  url?: string
  seconds?: number
  /** Credits this attempt is answerable for, measured where measurable. */
  credits: number
  taskId?: string
  /** What the day had spent BEFORE this attempt, as the ledger saw it. */
  spentBefore?: number
  ceiling?: number
}

export interface AttemptDeps {
  config: PortraitConfig
  provider: PortraitProvider
  ledger: Ledger
  mirror: Mirror
  day: string
  log: Log
  /** Injected so a test does not wait out a real poll. */
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  timeoutMs?: number
  /** Injected so an id in a test is stable. */
  id?: string
}

/**
 * The whole chain, in the order money can be lost.
 *
 * Every exit is a value, never a throw, and every exit after the intent row is
 * written leaves that row behind with the credits it is answerable for. The
 * caller renders the engraving in all of them.
 */
export async function attemptTalkingPortrait(
  d: AttemptDeps
): Promise<PortraitResult> {
  const { config: c, ledger, log } = d
  const sleep = d.sleep || ((ms: number) => new Promise(r => setTimeout(r, ms)))
  const pollMs = d.pollMs ?? 5_000
  const timeoutMs = d.timeoutMs ?? 240_000

  if (c.mode === 'off') return { state: 'off', credits: 0 }
  for (const note of c.notes) log(`портрет: ${note}`)

  // 1. Configuration. Nothing is read and nothing is called when the owner has
  // not supplied both files -- a refusal before the network is free.
  if (c.refusals.length) {
    const reason = c.refusals.join('; ')
    log(`портрет: отказ до сети — ${reason}`)
    return { state: 'refused', reason, credits: 0 }
  }

  // 2. The ceiling, from the ledger. No ledger answers => no spending: an
  // unrecorded generation is the state in which a repeat-spend loop is invisible.
  const spent = await ledgerSpentToday(ledger, d.day)
  if (spent.credits == null) {
    const reason =
      'журнал расходов недоступен (ни база, ни файл) — трачу только под запись'
    log(`портрет: ${reason}`)
    return { state: 'refused', reason, credits: 0 }
  }
  if (spent.credits + c.plannedCredits > c.dailyCredits) {
    const reason =
      `суточный потолок ${c.dailyCredits} кредитов: сегодня уже ${spent.credits}, ` +
      `клип на ${c.seconds} с стоит ${c.plannedCredits} — не начинаю`
    log(`портрет: ${reason} (источники: ${spent.sources.join(', ')})`)
    return {
      state: 'refused',
      reason,
      credits: 0,
      spentBefore: spent.credits,
      ceiling: c.dailyCredits,
    }
  }

  // 3. The balance, and the floor under it. credits() is free (kie-image.ts).
  const before = await readBalance(d)
  if (before == null) {
    const reason = 'баланс Kie не прочитан — не трачу вслепую'
    log(`портрет: ${reason}`)
    return { state: 'refused', reason, credits: 0 }
  }
  if (before - c.plannedCredits < CREDIT_FLOOR) {
    const reason =
      `пол ${CREDIT_FLOOR} кредитов для image_edit: баланс ${before}, ` +
      `клип стоит ${c.plannedCredits} — фабрика не объедает продукт`
    log(`портрет: ${reason}`)
    return { state: 'refused', reason, credits: 0 }
  }

  if (c.mode === 'dry') {
    const reason =
      `сухой прогон: потратил бы ${c.plannedCredits} кредитов на ${c.seconds} с ` +
      `(баланс ${before}, сегодня уже ${spent.credits}/${c.dailyCredits})`
    log(`портрет: ${reason}`)
    return {
      state: 'dry',
      reason,
      credits: 0,
      seconds: c.seconds,
      spentBefore: spent.credits,
      ceiling: c.dailyCredits,
    }
  }

  // 4. THE INTENT ROW, BEFORE THE PROVIDER IS TOLD ANYTHING. From here on the
  // day is charged whatever happens, and a render that fails afterwards cannot
  // buy a second clip on the next tick.
  const id = d.id || `portrait-${d.day}-${Date.now()}`
  const intent: SpendRecord = {
    id,
    day: d.day,
    state: 'intent',
    credits: c.plannedCredits,
    seconds: c.seconds,
    reason: 'заявка отправлена, ответ ещё не получен',
    at: new Date().toISOString(),
  }
  if (!(await ledgerWrite(ledger, intent))) {
    const reason = 'заявку некуда записать — трачу только под запись'
    log(`портрет: ${reason}`)
    return { state: 'refused', reason, credits: 0 }
  }

  // 5. createTask. A rejected request costs nothing (measured by
  // scripts/kie-probe.mjs, 0.00 credits over ten rejected calls), so this is
  // the one failure whose intent row is settled back to zero.
  const created = await d.provider.createTask({
    imageUrl: c.imageUrl,
    audioUrl: c.audioUrl,
  })
  if (!created.taskId) {
    const reason = `Kie не принял заявку: ${created.message}`
    await ledgerWrite(ledger, {
      ...intent,
      state: 'refused',
      credits: 0,
      reason,
    })
    log(`портрет: ${reason} — ничего не списано`)
    return { state: 'refused', reason, credits: 0 }
  }

  // 6. Poll. A timeout is NOT a rejection: the task may still finish and the
  // credits are already gone, so it keeps its full charge and its task id.
  const deadline = Date.now() + timeoutMs
  let url = ''
  let failure = ''
  while (Date.now() < deadline) {
    await sleep(pollMs)
    const st = await d.provider.recordInfo(created.taskId)
    if (st.state === 'success') {
      url = st.urls[0] || ''
      if (!url) failure = 'Kie сказал success без файла'
      break
    }
    if (st.state === 'fail' || st.state === 'failed') {
      failure = `Kie отказал: ${st.message || 'без причины'}`
      break
    }
  }

  const after = await readBalance(d)
  const measured =
    before != null && after != null && before - after > 0
      ? Math.round((before - after) * 100) / 100
      : c.plannedCredits

  if (!url) {
    const timedOut = !failure
    const reason = timedOut
      ? `Kie не ответил за ${Math.round(timeoutMs / 1000)} с. Задача ${created.taskId} ` +
        'может ещё выполняться — кредиты уже списаны, второй раз не плачу'
      : failure
    await ledgerWrite(ledger, {
      ...intent,
      state: timedOut ? 'timeout' : 'refused',
      // A provider-side failure is not billed by Kie, but a timeout is: the
      // measured delta decides, and it defaults to the full planned charge.
      credits: timedOut ? measured : Math.min(measured, c.plannedCredits),
      taskId: created.taskId,
      reason,
    })
    log(`портрет: ${reason}`)
    return {
      state: 'refused',
      reason,
      credits: timedOut ? measured : 0,
      taskId: created.taskId,
    }
  }

  // 7. The file must survive the hour, and it must be something the medallion
  // will actually play. An unmirrored link expires; a non-video URL falls to
  // the <Img> branch and renders an empty oval reporting success.
  const mirrored = await d.mirror(url)
  const finalUrl = mirrored || ''
  if (!finalUrl || !VIDEO_EXT.test(finalUrl)) {
    const reason = mirrored
      ? `перелитый адрес не похож на видео (${finalUrl.slice(0, 80)}) — медальон нарисовал бы пустоту`
      : 'клип не удалось перелить в наш S3 — ссылка провайдера истечёт, оставлять её в ленте нельзя'
    await ledgerWrite(ledger, {
      ...intent,
      state: 'refused',
      credits: measured,
      taskId: created.taskId,
      reason,
    })
    log(`портрет: ${reason} (кредиты ${measured} уже потрачены)`)
    return {
      state: 'refused',
      reason,
      credits: measured,
      taskId: created.taskId,
    }
  }

  await ledgerWrite(ledger, {
    ...intent,
    state: 'delivered',
    credits: measured,
    taskId: created.taskId,
    reason: 'клип получен и перелит в S3',
  })
  log(
    `портрет: говорящий портрет готов — ${c.seconds} с, ${measured} кредитов, ` +
      `задача ${created.taskId}`
  )
  return {
    state: 'delivered',
    url: finalUrl,
    seconds: c.seconds,
    credits: measured,
    taskId: created.taskId,
    spentBefore: spent.credits,
    ceiling: c.dailyCredits,
  }
}

/** The balance read, never throwing: an unreadable balance is a refusal above. */
async function readBalance(d: AttemptDeps): Promise<number | null> {
  try {
    return await d.provider.credits()
  } catch {
    return null
  }
}

/**
 * WHAT GOES INTO template_settings, so the refusal is visible where a check can
 * see it.
 *
 * A feed entry is a RECIPE, not a video: it carries compositionId, props and
 * the remix lineage. Until now a talking-head refusal left no trace in it at
 * all -- the whole story lived in a log file inside an ephemeral container. One
 * field here means feed_get answers "why is this one silent" without anyone
 * reading a container log, an unbroken run of `refused` is something a monitor
 * can see, and the cost of the channel becomes auditable per post.
 */
export function portraitRecord(
  c: PortraitConfig,
  r: PortraitResult
): Record<string, unknown> {
  return {
    state: r.state,
    model: MODEL,
    mode: c.mode,
    ...(r.reason ? { reason: r.reason.slice(0, 300) } : {}),
    credits: r.credits,
    ceiling: c.dailyCredits,
    ...(r.spentBefore != null ? { spentBefore: r.spentBefore } : {}),
    ...(r.seconds != null ? { seconds: r.seconds } : {}),
    ...(r.taskId ? { taskId: r.taskId } : {}),
    // The voice is part of the published artefact: a recipe missing the words
    // is not remixable. The still is what the model animated.
    ...(r.state === 'delivered'
      ? { image: c.imageUrl, audio: c.audioUrl }
      : {}),
  }
}
