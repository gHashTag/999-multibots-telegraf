/**
 * A REAL TELEGRAM DIALOGUE BETWEEN TWO AGENTS.
 *
 * The owner's seller agent (his session, @t27_dev) sells every function of
 * the bot to a connected seller who plays a NEW BUYER (her session, @playom);
 * a persona model answers for her. The content the seller offers is for her
 * real game, Leela Chakra (@leela_chakra_ai_bot, t27.ai/leela): a post, a 9:16
 * picture, a voice-over, a reel -- so the run exercises the tools on a real
 * product and leaves her with usable material.
 * Spec: t27 specs/automation/crm-duet.t27.
 *
 * WHY THE SELLER OPENS. The production business bot answers any DM to the
 * owner, but goes silent for OWNER_TAKEOVER_MS (30 min) after a message the
 * owner typed himself. A run that opens from the owner's session puts the
 * business bot on hold, so the buyer's replies are answered by this duet's
 * seller agent and not twice. Letting the buyer open would race it.
 *
 * WHY OWNER-ONLY AND IN THE BACKGROUND. The run sends from two sessions the
 * CRM holds in tg_sessions; that is legitimate only because both people
 * connected their accounts themselves and the platform owner authorises the
 * run (confirmed in chat before each start). A run takes minutes -- model
 * turns plus generations -- longer than any request may hold, so `crm_duet`
 * returns an id at once and `crm_duet_status` reads the run.
 *
 * WHAT IS RETURNED: the transcript, every tool the seller called (ok / fail),
 * the media forwarded, the count of paid generations. Never a session string.
 */
import type { AgentTool, ToolContext } from './tools'
import type { AgentEvent, ChatMessage } from './chat'
import { requireOwner, requireSeller, isSeller, withClient } from './telegram-tools'
import {
  sendWithAddressBook,
  sendFileWithAddressBook,
  type SendingClient,
} from './tg-proposals'
import { clientProfileFor } from './crm-client-setup-tool'
import { violatesLeelaVoice, LEELA_CTA_RU, LEELA_PLAY_RU } from './leela-canon'

export const DEFAULT_BUYER = '435572800'
export const TURNS_DEFAULT = 4
export const TURNS_MAX = 8
export const PAID_TOOLS = new Set([
  'image_generate',
  'image_edit',
  'audio_generate',
  'video_generate',
  'reel_render',
])
/** Tools the seller must not call: sending is the duet's job, not the model's. */
const FORBIDDEN_FOR_SELLER = /^tg_|^crm_(duet|agent_link|sellers)/

/** Facts about the buyer's real game -- from gHashTag/leela README and editorial SOUL. */
export const LEELA_CANON: string[] = [
  'Лила Чакра — игра самопознания: поле из 72 планов, бросок кубика ведёт к плану, дальше — чтение текста плана и собственное наблюдение.',
  'Вход на поле только с шестёрки → план 6 «Заблуждение (моха)»; победа — только точное попадание на 68 «Космическое Сознание»; 72 «Тамогуна» — змея на 51; три шестёрки подряд сжигают серию.',
  'Змеи: 12→8, 16→4, 24→7, 29→6, 44→9, 52→35, 55→3, 61→13, 63→2, 72→51. Стрелы: 10→23, 17→69, 20→32, 22→60, 27→41, 28→50, 37→66, 45→67, 46→62, 54→68.',
  'Ряды доски снизу — чакры: 1–9 Муладхара, 10–18 Свадхистхана, 19–27 Манипура, 28–36 Анахата, 37–45 Вишуддха, 46–54 Аджна, 55–63 Сахасрара, 64–72 за пределами чакр.',
  'Правила по умолчанию — classic: шестёрка даёт дополнительный ход, но не отменяет отчёт после прибытия.',
  'Играть: мини-апп https://t27.ai/leela/ и бот @leela_chakra_ai_bot; книга — https://t27.ai/leela/docs/; канал @leelachakraapp.',
  'Источник текстов планов — Хариш Джохари, «The Yoga of Snakes and Arrows» (Inner Traditions, 2007). Происхождение игры не датировать.',
  'ИИ-спутник в игре держится текста плана и не предсказывает будущее, не ставит диагнозов и не обещает трансформации.',
  'Единая мысль контента: «Не угадать будущее, а внимательно прочитать, заметить и сформулировать своё».',
  'Змея — не наказание, стрела — не награда: они меняют положение фишки, не достоинство человека. Название клетки никогда не приписывается человеку.',
  'Визуальный язык игры: чёрный фон, белая паутина доски 9×8 без заливок, кубик точками, 68 без цифры — Цветок Жизни, шрифт Outfit. Без неона, розовой пастели, медитирующих людей и «эзотерических» шрифтов.',
  'Одобренный публичный призыв: «Здесь нет правильного ответа. Приходите на доску со своим вопросом.» и кнопка «🎲 Играть в Лилу».',
]

export interface Transcript {
  i: number
  from: 'seller' | 'buyer'
  text: string
  tools?: Array<{ name: string; ok: boolean; ms: number }>
  media?: string[]
  /** Files re-sent by the duet itself because the seller promised one without producing it. */
  resent?: string[]
  sent: boolean
  error?: string
}

export interface DuetRun {
  id: string
  buyer: string
  owner: string
  turns: number
  dry_run: boolean
  state: 'running' | 'done' | 'failed'
  started_at: string
  finished_at?: string
  transcript: Transcript[]
  coverage: Record<string, { calls: number; ok: number; fail: number }>
  paid_calls: number
  media_sent: number
  /** Seller called a tool the brief forbids (tg_*, crm_duet…): reported, not hidden. */
  violations: string[]
  /** Seller lines that tripped the Leela voice check (words, per turn); the retry result is what was sent. */
  voice_flags: string[]
  /** Whether a client profile was read before the first word. */
  profile_used?: boolean
  error?: string
}

/**
 * Runs live in memory as a CACHE for the life of the process; the table
 * `crm_duet_runs` is the record. Until 2026-09-13 the Map was the only store,
 * so a deploy emptied `crm_duet_status` and no per-client dashboard could show
 * a run. Spec: t27 specs/automation/crm-client-workspace.t27.
 */
const runs = new Map<string, DuetRun>()
let lastRunId: string | null = null

export function getRun(id?: string | null): DuetRun | undefined {
  return runs.get(id ?? lastRunId ?? '')
}

type RunsPool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

/** A running run whose process died shows as lost after this long. */
export const LOST_AFTER_MS = 30 * 60_000

/** What a reader sees: the stored state, or `lost` derived from the clock. */
export type DuetRunView = Omit<DuetRun, 'state'> & {
  state: DuetRun['state'] | 'lost'
}

export function viewOf(run: DuetRun, now: number = Date.now()): DuetRunView {
  const started = Date.parse(run.started_at)
  const lost =
    run.state === 'running' &&
    Number.isFinite(started) &&
    now - started > LOST_AFTER_MS
  return { ...run, state: lost ? 'lost' : run.state }
}

let runsTableReady = false
/** For tests: the next call creates the table again. */
export function forgetRunsTableForTests(): void {
  runsTableReady = false
}

export async function ensureRunsTable(pool: RunsPool): Promise<void> {
  if (runsTableReady) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS crm_duet_runs (
       id text PRIMARY KEY, owner_id text NOT NULL, buyer_id text NOT NULL,
       state text NOT NULL, dry_run boolean NOT NULL, turns int NOT NULL,
       started_at timestamptz NOT NULL, finished_at timestamptz,
       paid_calls int NOT NULL DEFAULT 0, media_sent int NOT NULL DEFAULT 0,
       profile_used boolean, coverage jsonb NOT NULL DEFAULT '{}',
       violations jsonb NOT NULL DEFAULT '[]', voice_flags jsonb NOT NULL DEFAULT '[]',
       transcript jsonb NOT NULL DEFAULT '[]', error text)`
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS crm_duet_runs_buyer
       ON crm_duet_runs (owner_id, buyer_id, started_at DESC)`
  )
  runsTableReady = true
}

/** Whole-row upsert: the run is small and every field may change per turn. */
export async function upsertRun(pool: RunsPool, run: DuetRun): Promise<void> {
  await ensureRunsTable(pool)
  await pool.query(
    `INSERT INTO crm_duet_runs (id, owner_id, buyer_id, state, dry_run, turns,
       started_at, finished_at, paid_calls, media_sent, profile_used,
       coverage, violations, voice_flags, transcript, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
       $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16)
     ON CONFLICT (id) DO UPDATE SET
       state = EXCLUDED.state, finished_at = EXCLUDED.finished_at,
       paid_calls = EXCLUDED.paid_calls, media_sent = EXCLUDED.media_sent,
       profile_used = EXCLUDED.profile_used, coverage = EXCLUDED.coverage,
       violations = EXCLUDED.violations, voice_flags = EXCLUDED.voice_flags,
       transcript = EXCLUDED.transcript, error = EXCLUDED.error`,
    [
      run.id,
      run.owner,
      run.buyer,
      run.state,
      run.dry_run,
      run.turns,
      run.started_at,
      run.finished_at ?? null,
      run.paid_calls,
      run.media_sent,
      run.profile_used ?? null,
      JSON.stringify(run.coverage ?? {}),
      JSON.stringify(run.violations ?? []),
      JSON.stringify(run.voice_flags ?? []),
      JSON.stringify(run.transcript ?? []),
      run.error ?? null,
    ]
  )
}

const asJson = <T>(v: unknown, fallback: T): T => {
  if (v == null) return fallback
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T
    } catch {
      return fallback
    }
  }
  return v as T
}

const iso = (v: unknown): string | undefined => {
  if (v == null) return undefined
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

export function rowToRun(row: Record<string, any>): DuetRun {
  return {
    id: String(row.id),
    buyer: String(row.buyer_id),
    owner: String(row.owner_id),
    turns: Number(row.turns ?? 0),
    dry_run: Boolean(row.dry_run),
    state: String(row.state) as DuetRun['state'],
    started_at: iso(row.started_at) ?? new Date(0).toISOString(),
    finished_at: iso(row.finished_at),
    transcript: asJson<Transcript[]>(row.transcript, []),
    coverage: asJson<DuetRun['coverage']>(row.coverage, {}),
    paid_calls: Number(row.paid_calls ?? 0),
    media_sent: Number(row.media_sent ?? 0),
    violations: asJson<string[]>(row.violations, []),
    voice_flags: asJson<string[]>(row.voice_flags, []),
    profile_used: row.profile_used == null ? undefined : Boolean(row.profile_used),
    error: row.error == null ? undefined : String(row.error),
  }
}

const RUN_COLUMNS =
  'id, owner_id, buyer_id, state, dry_run, turns, started_at, finished_at, ' +
  'paid_calls, media_sent, profile_used, coverage, violations, voice_flags, transcript, error'

/**
 * The run by id, or the owner's latest: memory first, then the table. A pool
 * without the table (or without `query` at all, as in tests) yields nothing
 * rather than an error -- "not found" is the honest answer there.
 */
export async function findRun(
  pool: RunsPool | undefined,
  owner: string,
  id?: string | null
): Promise<DuetRun | undefined> {
  const cached = getRun(id)
  if (cached && cached.owner === owner) return cached
  if (!pool || typeof pool.query !== 'function') return undefined
  try {
    await ensureRunsTable(pool)
    const r = id
      ? await pool.query(
          `SELECT ${RUN_COLUMNS} FROM crm_duet_runs WHERE id = $1 AND owner_id = $2`,
          [String(id), owner]
        )
      : await pool.query(
          `SELECT ${RUN_COLUMNS} FROM crm_duet_runs WHERE owner_id = $1
            ORDER BY started_at DESC LIMIT 1`,
          [owner]
        )
    const row = r.rows?.[0]
    return row ? rowToRun(row) : undefined
  } catch {
    return undefined
  }
}

/** The owner's runs, newest first, optionally for one buyer; transcripts excluded. */
export async function listRuns(
  pool: RunsPool | undefined,
  owner: string,
  buyer: string | null,
  limit: number
): Promise<DuetRun[]> {
  if (!pool || typeof pool.query !== 'function') return []
  const cols = RUN_COLUMNS.replace('transcript', `jsonb_array_length(transcript) AS lines`)
  try {
    await ensureRunsTable(pool)
    const r = buyer
      ? await pool.query(
          `SELECT ${cols} FROM crm_duet_runs WHERE owner_id = $1 AND buyer_id = $2
            ORDER BY started_at DESC LIMIT $3`,
          [owner, buyer, limit]
        )
      : await pool.query(
          `SELECT ${cols} FROM crm_duet_runs WHERE owner_id = $1
            ORDER BY started_at DESC LIMIT $2`,
          [owner, limit]
        )
    return (r.rows ?? []).map(row => {
      const run = rowToRun(row)
      // `lines` stands in for the transcript so the list stays light.
      run.transcript = new Array(Number(row.lines ?? 0)).fill(null) as never
      return run
    })
  } catch {
    return []
  }
}

/** The list entry per contract: the run without its transcript, plus `lines`. */
export function summaryOf(run: DuetRun, now: number = Date.now()) {
  const v = viewOf(run, now)
  return {
    id: v.id,
    buyer: v.buyer,
    state: v.state,
    dry_run: v.dry_run,
    turns: v.turns,
    started_at: v.started_at,
    finished_at: v.finished_at ?? null,
    paid_calls: v.paid_calls,
    media_sent: v.media_sent,
    profile_used: v.profile_used ?? null,
    coverage: v.coverage,
    violations: v.violations,
    voice_flags: v.voice_flags,
    lines: v.transcript.length,
  }
}

/** Everything the loop touches, so tests can run it with doubles. */
export interface DuetDeps {
  agent: (history: ChatMessage[], ctx: ToolContext) => AsyncIterable<AgentEvent>
  buyerModel: (messages: ChatMessage[]) => Promise<string>
  sendText: (fromCtx: ToolContext, to: string, text: string) => Promise<void>
  sendMedia: (
    fromCtx: ToolContext,
    to: string,
    url: string,
    caption: string
  ) => Promise<void>
  /** The client profile the seller reads first; defaults to the DB row. */
  clientProfile?: (ctx: ToolContext, buyer: string) => Promise<Record<string, any>>
  /** Writes the run to the table: at start, after every turn, at the end. Optional in tests. */
  persist?: (run: DuetRun) => Promise<void>
  now?: () => number
}

/** A failed write costs the record of one turn, never the run itself. */
async function save(deps: DuetDeps, run: DuetRun): Promise<void> {
  if (!deps.persist) return
  try {
    await deps.persist(run)
  } catch (e) {
    console.warn(`[duet] run not persisted: ${String(e).slice(0, 120)}`)
  }
}

/** Generations that are off-brand for a client with her own template. */
export const OFF_BRAND_FOR_CLIENT = new Set(['image_generate', 'image_edit'])
const URL_RE = /https?:\/\/[^\s)»"']+/g

/**
 * A link the seller already sent is removed from later lines: run 5 sent the
 * app link twice in four turns. Only whole URLs are compared; the text around
 * them stays as the model wrote it.
 */
export function dedupeLinks(text: string, sent: Set<string>): { text: string; dropped: string[] } {
  const dropped: string[] = []
  const out = text.replace(URL_RE, u => {
    const key = u.replace(/[.,;:!?]+$/, '')
    if (sent.has(key)) {
      dropped.push(key)
      return ''
    }
    sent.add(key)
    return u
  })
  return { text: out.replace(/[ \t]{2,}/g, ' ').replace(/ \n/g, '\n').trim(), dropped }
}

/** A profile row as `crm_client_profile` returns it; `null` when none is set. */
export type ClientProfile = Record<string, any> | null

function lines(v: unknown): string[] {
  return Array.isArray(v) ? v.map(x => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`) : []
}

/**
 * The seller's brief. Runs 1-5 sold from a catalogue: a blog reel, a generated
 * picture with pseudo-text, the app link twice, a caption praised for being
 * legible. The brief now opens with discovery -- what she has, where her
 * audience is, what a good month looks like -- and only then proposes ONE
 * personal example rendered with her own template. The client profile, when
 * installed, is quoted into the brief so the model reads it before the first
 * word; the voice checker below catches what the brief cannot.
 */
export function sellerBrief(buyer: string, profile: ClientProfile = null): string {
  const p = profile ?? {}
  const name = p.name ? `${p.name} (${p.handle ?? '@playom'})` : '@playom'
  const cta = p.approved_cta?.text ?? LEELA_CTA_RU
  const button = p.approved_cta?.button ?? LEELA_PLAY_RU
  const template = p.reel_template?.composition ?? 'LeelaPlanReel'
  return [
    `Ты ведёшь РЕАЛЬНЫЙ диалог в Telegram с ${name}, Telegram ID ${buyer}. Она ведёт игру самопознания «Лила Чакра» и впервые смотрит на этот бот как на инструмент для продвижения её игры.`,
    'Порядок работы — как у профессионала с клиентом: сначала УЗНАТЬ, потом ПРЕДЛОЖИТЬ. Первые 1–2 реплики — только знакомство и вопросы discovery (по одному за реплику). Предложение делай только после её ответов и опирайся на них дословно.',
    'Отвечай ТОЛЬКО текстом, который уйдёт ей: 2–5 предложений, по-русски, «вы» с маленькой буквы, без разметки и списков. Не больше одного вопроса в реплике.',
    p.status ? `Профиль клиента (статус: ${p.status}):` : 'Профиль клиента не настроен — задавай вопросы discovery и не делай предположений об аудитории.',
    ...(p.role ? [`- роль: ${p.role}`] : []),
    ...(p.business?.product ? [`- продукт: ${p.business.product}`] : []),
    ...(p.business?.surfaces ? [`- где живёт продукт: ${(p.business.surfaces as string[]).join('; ')}`] : []),
    ...(p.audience_hypotheses ? ['Гипотезы об аудитории (проверить вопросами, не утверждать):', ...lines(p.audience_hypotheses)] : []),
    ...(p.discovery_questions ? ['Вопросы discovery — по одному, своими словами:', ...lines(p.discovery_questions)] : []),
    ...(p.content_series ? ['Серии контента, которые можно предложить после discovery:', ...lines((p.content_series as any[]).map(c => `${c.rubric}: ${(c.ideas ?? []).join(', ')}`))] : []),
    `Рилс для неё — только шаблон ${template}: возьми канон плана инструментом leela_plan {plan}, подставь reel_props в reel_render. Не предлагай TrinityBlogReel, PromoReel и картинки image_generate: они не в стиле игры, а сгенерированный текст на картинке нечитаем.`,
    `Одобренный призыв: «${cta}» и кнопка «${button}». Других обещаний и призывов не придумывай.`,
    'Факты об игре — только эти:',
    ...LEELA_CANON.map(s => `- ${s}`),
    ...(p.forbidden_claims ? ['Запрещённые формулировки:', ...lines(p.forbidden_claims)] : []),
    'Слова давления запрещены: «сегодня», «срочно», «последний шанс», «серия», «прогресс», «молодец», «успех», поздравления. Цены, скидки, проценты и отзывы не называй; о цене говори только если она сама спросила, и только цифрами из ответа pricing.',
    'Инструменты — по делу: сначала crm_client_profile и crm_lead_context (что о ней уже известно), leela_plan — свободно; платная генерация — только один ролик за диалог и только после того, как она сказала, чего хочет.',
    'Не вызывай tg_* и crm_duet/crm_agent_link/crm_sellers: отправкой занимается дуэт — готовый ролик уходит ей файлом отдельным сообщением сразу после твоего текста. Никогда не пиши «отправляю/пришлю файл»: если она просит файл, скажи, что видео уже пришло в чат следующим сообщением после ссылки, и спроси, что в нём не в стиле. Ссылку на приложение или бота давай не больше одного раза за диалог.',
    'О результате инструмента говори только то, что в нём есть: не описывай ролик или картинку, которых не видел, не хвали «читаемость» текста. Генерация занимает минуты; не обещай сроки «за день». Токены списываются с твоего баланса — не пиши ей «списано» и не называй свой остаток.',
    'Если у неё уже есть SOUL-черновик или скиллы «Leela: …» — скажи, что заготовка стоит, и попроси её поправить любое слово, которое не её.',
    'Первое сообщение: короткое приветствие, одна фраза о том, зачем ты пишешь, и ОДИН вопрос discovery.',
  ].join('\n')
}

/** The buyer speaks in her own draft voice when her SOUL is installed. */
export function buyerPersona(soulExcerpt = ''): string {
  return [
    'Ты — Гея (@playom), хранительница игры самопознания «Лила Чакра». Тебе пишет владелец бота Trinity S³AI и предлагает функции для продвижения твоей игры.',
    'Ты — новый покупатель: любопытная, практичная, бережёшь голос игры. Отвечаешь на вопросы о своей аудитории и целях честно и коротко; просишь показать пример именно в стиле игры; не соглашаешься на оплату, пока не увидела пример.',
    'Пометка «[в чат пришло видео …]» (или картинка, аудио) означает, что файл уже у тебя в Telegram и ты его видишь. Не говори, что файл не пришёл или ссылка не открывается; оценивай стиль по тому, что продавец о нём сказал, и по канону игры.',
    ...(soulExcerpt ? ['Твой голос (из твоего SOUL):', soulExcerpt] : []),
    'Отвечай по-русски, 1–3 предложения, один вопрос или одно решение за реплику. Никакой разметки. Не хвали чужой контент, если он не в стиле игры — скажи, что не так.',
    'Факты об игре, которыми ты пользуешься:',
    ...LEELA_CANON.map(s => `- ${s}`),
    'Не выдумывай других фактов об игре.',
  ].join('\n')
}

interface ToolResultEvent {
  name: string
  value: unknown
  ms: number
}

/**
 * A successful generation is `{ сделано: true, url }` (images, voice) // cyrillic-ok
 * or `{ готово: true, url }` (reel_render). Nothing else is media. // cyrillic-ok
 *
 * Found in real run duet-mtzo7ogz (2026-09-13): reel_render finished, two
 * tokens were spent, the seller quoted the post text -- and the buyer never
 * received the mp4, because only `сделано` was recognised here. The report
 * honestly said "files sent: 0" while "paid generations: 1".
 */
export function mediaOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const done =
    v['сделано'] === true || v['готово'] === true || v['done'] === true // cyrillic-ok
  const url = typeof v.url === 'string' ? v.url : ''
  return done && /^https?:\/\//.test(url) ? url : null
}

/**
 * What the buyer model is told about a file the duet forwarded. Run
 * duet-mtzrz4jo (2026-09-13): the mp4 reached her chat as a 0:10 video, but the
 * buyer model saw only `[sent file: https://...mp4]`, could not "open" a
 * URL, and answered "the file did not arrive" -- a false claim about a real send. The
 * note now names the kind of file and says it is already visible in Telegram.
 */
export function mediaKind(url: string): 'видео' | 'картинка' | 'аудио' | 'файл' {
  const path = url.split(/[?#]/)[0].toLowerCase()
  if (/\.(mp4|mov|webm|m4v)$/.test(path)) return 'видео'
  if (/\.(png|jpe?g|webp|gif)$/.test(path)) return 'картинка'
  if (/\.(mp3|ogg|oga|wav|m4a|opus)$/.test(path)) return 'аудио'
  return 'файл'
}

export function mediaNote(urls: string[]): string {
  if (!urls.length) return ''
  const kinds = [...new Set(urls.map(mediaKind))]
  const what = kinds.length === 1 && kinds[0] === 'видео' ? 'видео' : kinds.join(' и ')
  return `[в чат пришло ${what} файлом (${urls.length} шт.) — оно уже видно в Telegram, ссылку открывать не нужно]`
}

// `\b` is ASCII-only in JS, so Cyrillic words are bounded by lookarounds.
// First-person / future sending verbs only: "the reel goes to her" style
// narration in the brief must not trip the check.
const SEND_VERB_RE =
  /(?<![а-яё])(отправ(ляю|лю|им)|при(шлю|сылаю)|прикреп(ляю|лю)|выс(ылаю|ылю|шлю)|скину|скидываю|прикладываю|приложу|загруж(у|аю))(?![а-яё])/i // cyrillic-ok
const FILE_NOUN_RE =
  /(?<![а-яё])(видео|файл[а-яё]*|ролик[а-яё]*|запис[а-яё]*|картинк[а-яё]*|mp4)(?![а-яёa-z0-9])/i // cyrillic-ok

/**
 * A seller line that promises a file in a sentence that also names the sending.
 * Run duet-mtzrz4jo, turn 6: "I am sending the video as a file right into this
 * chat -- it should arrive as the next message" with `tools: []` -- nothing was
 * sent, the buyer waited for a file that never came. A promise is only honest
 * when the same turn produced media; otherwise the duet resends the last file
 * it has and reports the turn.
 */
export function promisesFile(text: string): boolean {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .some(s => SEND_VERB_RE.test(s) && FILE_NOUN_RE.test(s))
}

export function okOf(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true
  const v = value as Record<string, unknown>
  if (v['сделано'] === false || v['done'] === false) return false // cyrillic-ok
  if (v['готово'] === false || v['началось'] === false) return false // cyrillic-ok
  if (typeof v['ошибка'] === 'string' || typeof v.error === 'string')
    return false // cyrillic-ok
  return true
}

/** Drain one seller turn: text, tool results, media. */
export async function sellerTurn(
  deps: DuetDeps,
  history: ChatMessage[],
  ctx: ToolContext
): Promise<{ text: string; results: ToolResultEvent[]; error?: string }> {
  const parts: string[] = []
  const results: ToolResultEvent[] = []
  let error: string | undefined
  for await (const ev of deps.agent(history, ctx)) {
    const e = ev as unknown as Record<string, unknown>
    const kind = String(e['тип'] ?? e.kind ?? '') // cyrillic-ok
    if (kind === 'текст' || kind === 'text')
      parts.push(String(e['текст'] ?? e.text ?? '')) // cyrillic-ok
    else if (kind === 'результат' || kind === 'result')
      // cyrillic-ok
      results.push({
        name: String(e['имя'] ?? e.name ?? ''), // cyrillic-ok
        value: e['значение'] ?? e.value, // cyrillic-ok
        ms: Number(e['мс'] ?? e.ms ?? 0), // cyrillic-ok
      })
    else if (kind === 'ошибка' || kind === 'error')
      error = String(e['текст'] ?? e.text ?? '') // cyrillic-ok
  }
  const text = parts
    .join('')
    .replace(/\[\[[^\]]*\]\]/g, '')
    .trim()
  return { text, results, error }
}

export async function runDuet(
  run: DuetRun,
  ownerCtx: ToolContext,
  deps: DuetDeps
): Promise<DuetRun> {
  const buyerCtx = { ...ownerCtx, telegramId: run.buyer } as ToolContext
  // The profile is read by the duet, not left to the model's discretion: the
  // brief is built from it, and the buyer persona borrows her draft voice.
  let profile: ClientProfile = null
  let soulExcerpt = ''
  try {
    const row = await (deps.clientProfile ?? clientProfileFor)(ownerCtx, run.buyer)
    if (row?.has_profile) profile = row.profile as Record<string, any>
    if (typeof row?.soul_excerpt === 'string') soulExcerpt = row.soul_excerpt
  } catch {
    profile = null
  }
  run.profile_used = !!profile
  await save(deps, run)
  const seller: ChatMessage[] = [
    { role: 'user', content: sellerBrief(run.buyer, profile) },
  ]
  const buyer: ChatMessage[] = [{ role: 'system', content: buyerPersona(soulExcerpt) }]
  const linksSent = new Set<string>()
  let lastMedia: string | null = null
  try {
    for (let i = 0; i < run.turns * 2; i++) {
      const fromSeller = i % 2 === 0
      if (fromSeller) {
        let { text, results, error } = await sellerTurn(deps, seller, ownerCtx)
        // One correction round: the brief says what not to say, the checker
        // says what was said anyway. A second miss is sent and reported.
        const flagged = violatesLeelaVoice(text)
        if (flagged.length) {
          run.voice_flags.push(`turn ${i}: ${flagged.join(', ')}`)
          seller.push({ role: 'assistant', content: text })
          seller.push({
            role: 'user',
            content: `Проверка голоса: в реплике есть «${flagged.join('», «')}». Перепиши её без этих слов и без давления, тем же смыслом, 2–5 предложений, один вопрос.`, // cyrillic-ok
          })
          const again = await sellerTurn(deps, seller, ownerCtx)
          if (again.text) {
            text = again.text
            results = [...results, ...again.results]
            error = error ?? again.error
          }
          const still = violatesLeelaVoice(text)
          if (still.length) run.voice_flags.push(`turn ${i} (после правки): ${still.join(', ')}`) // cyrillic-ok
        }
        const dedup = dedupeLinks(text, linksSent)
        if (dedup.dropped.length) {
          text = dedup.text
          run.violations.push(`turn ${i}: повторная ссылка ${dedup.dropped.join(', ')}`) // cyrillic-ok
        }
        const tools = results.map(r => ({
          name: r.name,
          ok: okOf(r.value),
          ms: r.ms,
        }))
        for (const r of tools) {
          const c = (run.coverage[r.name] ??= { calls: 0, ok: 0, fail: 0 })
          c.calls++
          if (r.ok) c.ok++
          else c.fail++
          if (PAID_TOOLS.has(r.name)) run.paid_calls++
          if (FORBIDDEN_FOR_SELLER.test(r.name))
            run.violations.push(`turn ${i}: ${r.name}`)
          if (profile && OFF_BRAND_FOR_CLIENT.has(r.name))
            run.violations.push(`turn ${i}: ${r.name} (не в стиле клиента)`) // cyrillic-ok
        }
        const media = results
          .map(r => mediaOf(r.value))
          .filter((u): u is string => !!u)
        const entry: Transcript = {
          i,
          from: 'seller',
          text,
          tools,
          media,
          sent: false,
          error,
        }
        // A promised file must exist in this very turn. When it does not, the
        // duet keeps the promise with the last file it forwarded (no new paid
        // call) and reports the turn; with nothing to resend it only reports.
        if (media.length === 0 && promisesFile(text)) {
          if (lastMedia) {
            entry.resent = [lastMedia]
            run.violations.push(
              `turn ${i}: обещание отправить файл без вызова инструмента — повторно отправлен ${lastMedia}` // cyrillic-ok
            )
          } else {
            run.violations.push(`turn ${i}: обещание отправить файл, файла нет`) // cyrillic-ok
          }
        }
        const outgoing = [...media, ...(entry.resent ?? [])]
        if (media.length) lastMedia = media[media.length - 1]
        run.transcript.push(entry)
        if (!text && media.length === 0) {
          entry.error = entry.error ?? 'seller produced no text'
          break
        }
        if (!run.dry_run) {
          if (text) await deps.sendText(ownerCtx, run.buyer, text)
          for (const url of outgoing) {
            await deps.sendMedia(ownerCtx, run.buyer, url, '')
            run.media_sent++
          }
          entry.sent = true
        }
        seller.push({ role: 'assistant', content: text })
        buyer.push({
          role: 'user',
          content: outgoing.length ? `${text}\n${mediaNote(outgoing)}` : text,
        })
        await save(deps, run)
      } else {
        const reply = (await deps.buyerModel(buyer)).replace(/\s+$/, '').trim()
        const entry: Transcript = { i, from: 'buyer', text: reply, sent: false }
        run.transcript.push(entry)
        if (!reply) {
          entry.error = 'buyer produced no text'
          break
        }
        if (!run.dry_run) {
          await deps.sendText(buyerCtx, run.owner, reply)
          entry.sent = true
        }
        buyer.push({ role: 'assistant', content: reply })
        seller.push({ role: 'user', content: `Покупатель (@playom): ${reply}` })
        await save(deps, run)
      }
    }
    run.state = 'done'
  } catch (e) {
    run.state = 'failed'
    run.error = e instanceof Error ? e.message : String(e)
  }
  run.finished_at = new Date(deps.now?.() ?? Date.now()).toISOString()
  await save(deps, run)
  return run
}

/** The report the owner finds in Saved Messages when the run ends. */
export function reportOf(run: DuetRun): string {
  const cov = Object.entries(run.coverage)
    .map(
      ([n, c]) =>
        `${n}: ${c.ok}/${c.calls}${c.fail ? ` (сбоев ${c.fail})` : ''}` // cyrillic-ok
    )
    .join('\n')
  return [
    `Дуэт ${run.id} — ${run.state}${run.error ? `: ${run.error}` : ''}`,
    `Реплик: ${run.transcript.length}, файлов отправлено: ${run.media_sent}, платных генераций: ${run.paid_calls}`,
    cov ? `Инструменты (ok/вызовов):\n${cov}` : 'Инструменты не вызывались',
    run.violations.length
      ? `Нарушения брифа: ${run.violations.join('; ')}`
      : '',
    run.voice_flags.length
      ? `Проверка голоса: ${run.voice_flags.join('; ')}`
      : '',
    run.profile_used === false ? 'Профиль клиента не был настроен (crm_client_setup)' : '',
    run.dry_run ? 'Режим dry_run: в Telegram ничего не отправлялось' : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** GLM models answer with a `thinking` block on by default; ask them not to. */
export const GLM_PROVIDER = /^zai(-|$)/

/** Token budget for one buyer line; a persona reply, not an essay. */
export const BUYER_MAX_TOKENS = 600

/**
 * The buyer's request body. The third live run (duet-mtznc1ri, 2026-09-13)
 * died with "zai: empty answer; zai-lite: empty answer": the buyer got a
 * 200 whose `content` was empty. GLM thinks by default, and with the
 * seller's post text in the prompt the whole `max_tokens` budget went into
 * reasoning that the non-streaming reply does not surface as an answer. The
 * buyer is a persona, not a planner -- reasoning is switched off for GLM
 * (`thinking: {type: 'disabled'}`), and the budget is wide enough for a
 * reply. Providers that do not know the `thinking` field never see it.
 */
export function buyerRequestBody(
  p: { id: string; model: string; thinking?: boolean },
  messages: ChatMessage[]
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: p.model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content ?? '',
    })),
    temperature: 0.7,
    max_tokens: BUYER_MAX_TOKENS,
    stream: false,
  }
  if (GLM_PROVIDER.test(p.id) || p.thinking) body.thinking = { type: 'disabled' }
  return body
}

/**
 * The buyer's voice, tried across EVERY configured provider in order.
 *
 * The first live run (duet-mtzmbvu1, 2026-09-13) died after one seller line
 * with "buyer model HTTP 404": the buyer asked only `resolveProvider()`, i.e.
 * the first provider, while the seller agent walks the whole `allProviders()`
 * chain and so never noticed that the first endpoint answers 404. Same
 * process, same keys, two different outcomes -- the buyer must walk the same
 * chain. A provider that fails is recorded with `diagnose()` and the next one
 * is tried; only when all fail does the duet fail, and the error then names
 * every provider instead of a bare status code.
 */
export async function askBuyerModel(
  messages: ChatMessage[],
  providers: Array<{
    id: string
    base: string
    model: string
    key: string
    thinking?: boolean
  }>,
  doFetch: typeof fetch = fetch,
  explain: (id: string, status: number, body: string) => string = (id, s) =>
    `${id}: HTTP ${s}`
): Promise<string> {
  if (!providers.length) throw new Error('buyer model: no provider configured')
  const reasons: string[] = []
  for (const p of providers) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 90_000)
    try {
      const r = await doFetch(`${p.base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${p.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buyerRequestBody(p, messages)),
        signal: ac.signal,
      })
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        reasons.push(explain(p.id, r.status, body))
        continue
      }
      const j = (await r.json()) as {
        choices?: Array<{
          message?: { content?: string; reasoning_content?: string }
          finish_reason?: string
        }>
      }
      const choice = j.choices?.[0]
      const text = String(choice?.message?.content ?? '').trim()
      if (!text) {
        const why = choice?.message?.reasoning_content
          ? 'reasoning only, no answer'
          : `empty answer${choice?.finish_reason ? ` (${choice.finish_reason})` : ''}`
        reasons.push(`${p.id}: ${why}`)
        continue
      }
      return text
    } catch (e) {
      reasons.push(`${p.id}: ${String((e as Error)?.message ?? e)}`)
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`buyer model: ${reasons.join('; ')}`)
}

/** Live wiring: the real agent, the real model, the real sessions. */
async function liveDeps(pool?: RunsPool): Promise<DuetDeps> {
  const { runAgent } = await import('./chat')
  const { allProviders, diagnose } = await import('./provider')
  const buyerModel = (messages: ChatMessage[]): Promise<string> =>
    askBuyerModel(messages, allProviders(), fetch, (id, s, b) =>
      diagnose(id as any, s, b)
    )
  return {
    agent: (history, ctx) => runAgent(history, ctx, { surface: 'business' }),
    buyerModel,
    persist: pool ? run => upsertRun(pool, run) : undefined,
    sendText: async (fromCtx, to, text) => {
      await withClient(fromCtx, c =>
        sendWithAddressBook(c as unknown as SendingClient, to, text)
      )
    },
    sendMedia: async (fromCtx, to, url, caption) => {
      await withClient(fromCtx, async c => {
        try {
          await sendFileWithAddressBook(
            c as unknown as SendingClient,
            to,
            { kind: 'photo', url },
            caption
          )
        } catch {
          // Telegram would not fetch the file (size, type): the link still reaches her.
          await sendWithAddressBook(c as unknown as SendingClient, to, url)
        }
      })
    },
  }
}

export const CRM_DUET_TOOLS: AgentTool[] = [
  {
    name: 'crm_duet',
    description:
      'Запустить РЕАЛЬНЫЙ диалог в Telegram: агент-продавец от сессии владельца продаёт функции ' +
      'бота подключённому продавцу в роли нового покупателя (по умолчанию @playom), контент — ' +
      'для её игры «Лила Чакра»; за покупателя отвечает модель от её сессии. Только для владельца; ' +
      'идёт в фоне, вернёт id — статус смотри crm_duet_status. dry_run=true: агенты говорят, ' +
      'в Telegram ничего не уходит.',
    parameters: {
      type: 'object',
      properties: {
        buyer: {
          type: 'string',
          description:
            'Telegram ID покупателя (по умолчанию 435572800, @playom)',
        },
        turns: {
          type: 'number',
          description: `Пар реплик продавец→покупатель (1–${TURNS_MAX}, по умолчанию ${TURNS_DEFAULT})`,
        },
        dry_run: {
          type: 'boolean',
          description: 'Не отправлять в Telegram, только транскрипт',
        },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      requireOwner(ctx)
      const buyer = String(args.buyer ?? DEFAULT_BUYER).trim()
      if (!/^\d{5,15}$/.test(buyer))
        throw new Error('buyer должен быть числовым Telegram ID')
      const owner = String(ctx!.telegramId)
      if (buyer === owner)
        throw new Error('покупателем не может быть сам владелец')
      const buyerCtx = { ...(ctx ?? {}), telegramId: buyer } as ToolContext
      if (!(await isSeller(buyerCtx))) {
        throw new Error(
          `аккаунт ${buyer} не подключён в приложении — за покупателя может отвечать только ` +
            'тот, кто сам вошёл в свой Telegram в мини-аппе'
        )
      }
      const running = [...runs.values()].find(r => r.state === 'running')
      if (running) {
        return {
          started: false,
          duet_id: running.id,
          reason: 'уже идёт дуэт',
          run: running,
        }
      }
      const turns = Math.min(
        TURNS_MAX,
        Math.max(1, Math.floor(Number(args.turns) || TURNS_DEFAULT))
      )
      const run: DuetRun = {
        id: `duet-${Date.now().toString(36)}`,
        buyer,
        owner,
        turns,
        dry_run: args.dry_run === true,
        state: 'running',
        started_at: new Date().toISOString(),
        transcript: [],
        coverage: {},
        paid_calls: 0,
        media_sent: 0,
        violations: [],
        voice_flags: [],
      }
      runs.set(run.id, run)
      lastRunId = run.id
      const deps = await liveDeps(ctx!.pool as RunsPool)
      // The first row goes in before the loop starts, so a status read from
      // another process (or after a deploy) already sees the run.
      await save(deps, run)
      void runDuet(run, ctx!, deps).then(async r => {
        if (r.dry_run) return
        try {
          await deps.sendText(ctx!, 'me', reportOf(r))
        } catch (e) {
          console.warn(
            `[duet] report not delivered: ${String(e).slice(0, 120)}`
          )
        }
      })
      return {
        started: true,
        duet_id: run.id,
        buyer,
        turns,
        dry_run: run.dry_run,
        hint: 'статус и транскрипт — crm_duet_status; отчёт придёт в Избранное владельца',
      }
    },
  },
  {
    name: 'crm_duet_status',
    description:
      'Состояние дуэта продавец↔покупатель: транскрипт, какие инструменты вызвал продавец ' +
      '(ok/сбой), сколько файлов отправлено и платных генераций сделано. Без id — последний запуск.',
    parameters: {
      type: 'object',
      properties: {
        duet_id: { type: 'string', description: 'id из ответа crm_duet' },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      requireOwner(ctx)
      const run = await findRun(
        ctx!.pool as RunsPool,
        String(ctx!.telegramId),
        args.duet_id ? String(args.duet_id) : null
      )
      if (!run)
        return { found: false, hint: 'дуэт ещё не запускался' }
      const view = viewOf(run)
      return { found: true, run: view, report: reportOf(view as DuetRun) }
    },
  },
  {
    name: 'crm_duet_runs',
    description:
      'Список своих прогонов дуэта (done/running/failed/lost, покрытие, нарушения). ' +
      'Транскрипт — через crm_duet_status {duet_id}.',
    parameters: {
      type: 'object',
      properties: {
        buyer: { type: 'string', description: 'Telegram ID клиента' },
        limit: { type: 'number', description: 'По умолчанию 10, максимум 50' },
      },
      additionalProperties: false,
    },
    async handler(args: Record<string, any>, ctx?: ToolContext) {
      await requireSeller(ctx)
      const owner = String(ctx!.telegramId)
      const buyer = args.buyer == null || args.buyer === '' ? null : String(args.buyer).trim()
      if (buyer !== null && !/^\d{5,15}$/.test(buyer))
        throw new Error('buyer должен быть числовым Telegram ID')
      const limit = Math.min(50, Math.max(1, Math.floor(Number(args.limit) || 10)))
      const rows = await listRuns(ctx!.pool as RunsPool, owner, buyer, limit)
      const seen = new Set(rows.map(r => r.id))
      // Runs of this process that the table has not seen yet (or a base
      // without the table) still show up, from the cache.
      const cached = [...runs.values()].filter(
        r => r.owner === owner && !seen.has(r.id) && (!buyer || r.buyer === buyer)
      )
      const all = [...rows, ...cached]
        .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
        .slice(0, limit)
      return { runs: all.map(r => summaryOf(r)) }
    },
  },
]
