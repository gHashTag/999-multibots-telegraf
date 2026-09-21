/**
 * CARRYING FINISHED REELS INTO THE TELEGRAM CHANNEL -- the half of the funnel
 * that was written and then never called by anything.
 *
 * WHAT WAS BROKEN. scripts/telegram-autopost.ts held this logic and had NO
 * CALLER: a repo-wide grep found only its own usage comment. Even if something
 * had called it, it read TG_POST_BOT_TOKEN / TG_POST_CHANNEL_ID while the
 * deploy defines TELEGRAM_CHANNEL_BOT_TOKEN / TELEGRAM_CHANNEL_ID, so it would
 * have been a permanent dry-run -- a feature that reports success by staying
 * silent. Both halves are fixed here: the deploy name is read first, and the
 * autopilot tick calls this module on every cycle.
 *
 * WHY THE LOGIC LIVES IN src/ AND NOT NEXT TO THE SCRIPT. tsconfig include is
 * ["src/**\/*", "render-server.ts"] -- `tsc --listFilesOnly` shows ZERO files
 * under scripts/, which is how the top-level-await breakage shipped green. Code
 * left beside the script is invisible to `npm run typecheck`. scripts/
 * telegram-autopost.ts is now a thin CLI wrapper over this module.
 *
 * WHY IT NEVER THROWS AND NEVER EXITS. The caller is the autopilot daemon,
 * which the render server supervises with a 60-second respawn
 * (render-server.ts). The old script called process.exit(1) on a failed send;
 * imported into the daemon that is a crash loop dressed up as a deploy problem.
 * Every failure here is a returned value and a log line.
 *
 * THE TWO SAFETY VALVES, AND WHY BOTH ARE NEEDED.
 *   TG_POST_MAX_PER_RUN (default 1)  -- how many reels ONE run may send.
 *   TG_POST_MAX_PER_DAY (default 0)  -- how many a DAY may send, counted from
 *                                        the database, not from a file.
 * The per-run cap alone is not a cap: the daemon ticks every 30 minutes, so
 * "1 per run" is 48 a day into a channel with 19 subscribers. And the daily
 * count cannot live in loop/state.json -- this Railway project has no volumes,
 * so every merge wipes the file and the counter resets several times a day
 * (the same reason the autopilot's post cap is counted from the feed). Hence a
 * COUNT over the ledger. The day quota defaults to 0, i.e. the drain is OFF
 * until someone deliberately raises it: there is a backlog of unposted reels
 * and a flood would be a self-inflicted wound.
 *
 * SEED THE LEDGER BEFORE RAISING THE DAY QUOTA. Measured against production on
 * 2026-08-31: 37 of the owner's 37 feed rows carry NO tg_posted_at, and about a
 * dozen of them are already visible in the channel -- they were delivered by
 * the live publish path, which until now wrote no mark. Switch the drain on
 * against that state and it re-sends what subscribers have already seen. The
 * rows that are already in the channel must be stamped first, e.g.
 *   UPDATE public_templates SET template_settings = template_settings ||
 *     jsonb_build_object('tg_posted_at', '<the date they went out>')
 *    WHERE id IN (...);
 * Which ids those are is a question for the owner, not for this code.
 *
 * THE LEDGER. A reel counts as delivered when template_settings.tg_posted_at is
 * set, and that mark is written ONLY after Telegram confirms -- a stamp that
 * survives a failed send would silently drop reels forever. A failed send
 * increments tg_post_attempts instead, and after MAX_ATTEMPTS the row steps
 * aside: oldest-first with no attempt counter is a head-of-line block where one
 * unsendable row stalls the queue and logs the same failure every 30 minutes
 * (the defect fixed for notifications in 329e1458).
 */

import { telegramApiFor } from './telegram-api'

/**
 * Structural, deliberately not `import type { Pool } from 'pg'` -- the same
 * trick as src/autopilot-state.ts: a test passes a plain object and needs no
 * database, and this module stays loadable when pg is absent.
 */
export type Db = {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export interface Log {
  (line: string): void
}

/** One row of the publication queue, as the SELECT below returns it. */
export interface PendingReel {
  id: number
  name: string
  video_url: string | null
  description: string | null
  created_at: string
  tg_posted_at: string | null
  tg_post_attempts: number
}

export interface SendResult {
  ok: boolean
  error?: string
}

export type SendVideo = (input: {
  token: string
  chatId: string
  videoUrl: string
  caption: string
}) => Promise<SendResult>

export interface DeliveryOutcome {
  /** True when the run deliberately sent nothing; `reason` says which gate. */
  dryRun: boolean
  reason: string
  sent: number
  failed: number
  /** Rows waiting in the queue when the run started. */
  pending: number
  /** Rows the run did NOT touch. Silent truncation reads as "all delivered". */
  skipped: number
  /** Which env name answered, for the log. Empty when nothing did. */
  tokenFrom: string
  chatIdFrom: string
}

/**
 * ENV NAMES, DEPLOY NAME FIRST.
 *
 * The alias keeps a local .env and the dry-run history working; the deploy name
 * leads because that is the one that actually exists on vibee-render. This
 * table is exported so channel-env-contract.test.ts can compare it against the
 * checked-in list of names the deploy defines -- `process.env.ANYTHING`
 * typechecks, and every test that mocks the environment sets whatever name the
 * code reads, so the fake agrees with the code by construction. The only
 * witness that can disagree lives outside the repo.
 */
export const ENV_NAMES = {
  token: ['TELEGRAM_CHANNEL_BOT_TOKEN', 'TG_POST_BOT_TOKEN'],
  chatId: ['TELEGRAM_CHANNEL_ID', 'TG_POST_CHANNEL_ID'],
  perRun: ['TG_POST_MAX_PER_RUN'],
  perDay: ['TG_POST_MAX_PER_DAY'],
  identity: ['OWNER_TELEGRAM_ID', 'AGENT_KEYS'],
} as const

/** How many reels one run may send when nothing is configured. */
export const DEFAULT_MAX_PER_RUN = 1
/** How many a day may go out when nothing is configured: none. See the header. */
export const DEFAULT_MAX_PER_DAY = 0
/**
 * A ceiling on the ENV OVERRIDE itself. TG_POST_MAX_PER_RUN=100 is a typo, not
 * an instruction, and the cost of honouring it is 100 messages nobody can
 * recall. Raising the real volume is the day quota's job, one tick at a time.
 */
export const HARD_MAX_PER_RUN = 5
/** Failed sends before a row steps aside so it cannot block the queue. */
export const MAX_ATTEMPTS = 3

type Env = Record<string, string | undefined>

function pick(
  names: readonly string[],
  env: Env
): { name: string; value: string } {
  for (const name of names) {
    const value = (env[name] || '').trim()
    if (value) return { name, value }
  }
  return { name: '', value: '' }
}

export interface ChannelConfig {
  token: string
  chatId: string
  tokenFrom: string
  chatIdFrom: string
  maxPerRun: number
  maxPerDay: number
  owner: string
}

/**
 * Non-negative integer or the default; garbage never widens a cap.
 *
 * The empty check is not decoration: pick() returns '' for an unset variable
 * and Number('') is 0, an integer >= 0 -- so without it an unconfigured deploy
 * got a per-run cap of ZERO and the drain would have been silently dead while
 * every other gate reported healthy. Caught by the default-cap test, which is
 * the only reason it is not in production.
 */
function intOr(raw: string, fallback: number): number {
  if (!raw.trim()) return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

export function readChannelConfig(env: Env = process.env): ChannelConfig {
  const token = pick(ENV_NAMES.token, env)
  const chatId = pick(ENV_NAMES.chatId, env)
  const perRun = pick(ENV_NAMES.perRun, env)
  const perDay = pick(ENV_NAMES.perDay, env)
  return {
    token: token.value,
    chatId: chatId.value,
    tokenFrom: token.name,
    chatIdFrom: chatId.name,
    maxPerRun: Math.min(
      HARD_MAX_PER_RUN,
      intOr(perRun.value, DEFAULT_MAX_PER_RUN)
    ),
    maxPerDay: intOr(perDay.value, DEFAULT_MAX_PER_DAY),
    owner: resolveOwner(env),
  }
}

/**
 * Whose reels may reach the channel.
 *
 * The old script fell back to a hardcoded '144022504'. It happened to be right,
 * and nothing enforced it: had it diverged, the query would have returned zero
 * rows and logged "nothing new for the channel" -- a false green. So: the
 * explicit variable, else the id paired into AGENT_KEYS (the same pairing the
 * server uses to resolve an agent key), else NOTHING and the run says so.
 */
export function resolveOwner(env: Env = process.env): string {
  const explicit = (env[ENV_NAMES.identity[0]] || '').trim()
  if (/^\d{5,}$/.test(explicit)) return explicit
  const paired = ((env[ENV_NAMES.identity[1]] || '').split(',')[0] || '')
    .split(':')[1]
    ?.trim()
  return paired && /^\d{5,}$/.test(paired) ? paired : ''
}

/**
 * The queue: the owner's public reels that carry a video and no delivery mark,
 * oldest first so the channel keeps chronology.
 *
 * tg_posted_at and tg_post_attempts are SELECTED as well as filtered on, and
 * the code checks them again before sending. That duplication is deliberate:
 * this WHERE clause is invisible to any test without a Postgres, so the guard
 * in the code is the half a test can see -- and the half that still refuses a
 * double send if the clause is ever edited.
 */
export const SELECT_PENDING = `SELECT id, name, video_url, description, created_at::text,
          template_settings->>'tg_posted_at' AS tg_posted_at,
          COALESCE((template_settings->>'tg_post_attempts')::int, 0) AS tg_post_attempts
     FROM public_templates
    WHERE telegram_id = $1 AND is_public = TRUE AND deleted_at IS NULL
      AND video_url IS NOT NULL
      AND template_settings->>'tg_posted_at' IS NULL
      AND COALESCE((template_settings->>'tg_post_attempts')::int, 0) < $2
    ORDER BY created_at ASC
    LIMIT $3`

/** How many are waiting in total -- the denominator behind "skipped N". */
export const COUNT_PENDING = `SELECT count(*)::int AS n
     FROM public_templates
    WHERE telegram_id = $1 AND is_public = TRUE AND deleted_at IS NULL
      AND video_url IS NOT NULL
      AND template_settings->>'tg_posted_at' IS NULL
      AND COALESCE((template_settings->>'tg_post_attempts')::int, 0) < $2`

/**
 * The day quota, counted from the ledger rather than from a counter file: the
 * stamp is ISO, so a plain string comparison against 'YYYY-MM-DD' is the day.
 */
export const COUNT_TODAY = `SELECT count(*)::int AS n
     FROM public_templates
    WHERE telegram_id = $1
      AND template_settings->>'tg_posted_at' >= $2`

/**
 * now() from the DATABASE, not from this process: two containers overlap during
 * a rolling deploy and the ledger must have one clock.
 */
export const MARK_POSTED = `UPDATE public_templates
      SET template_settings = COALESCE(template_settings, '{}'::jsonb) || jsonb_build_object(
            'tg_posted_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    WHERE id = $1`

export const MARK_ATTEMPT = `UPDATE public_templates
      SET template_settings = COALESCE(template_settings, '{}'::jsonb) || jsonb_build_object(
            'tg_post_attempts', COALESCE((template_settings->>'tg_post_attempts')::int, 0) + 1)
    WHERE id = $1`

/**
 * Channel caption: title, the first line of the description, and the way back
 * into the feed. Telegram refuses a caption over 1024 characters outright.
 */
export function captionFor(reel: PendingReel): string {
  const firstLine =
    String(reel.description || '')
      .split('\n')
      .find(l => l.trim()) ?? ''
  return [
    String(reel.name),
    '',
    firstLine.slice(0, 220),
    '',
    'Смотреть в ленте: https://app.t27.ai/feed',
  ]
    .join('\n')
    .slice(0, 1024)
}

/**
 * A presigned S3 link expires (uploadToS3 in render-server.ts hands out 7-day
 * urls) and Telegram answers "wrong file identifier" a week later, which reads
 * like a corrupt video rather than an expired link. None of today's feed rows
 * are presigned; the sibling render-notification path produces such urls, so a
 * backfill can reach one.
 */
export function isPresigned(url: string): boolean {
  return /[?&]X-Amz-(Signature|Credential)=/i.test(url)
}

async function sendViaTelegram(input: {
  token: string
  chatId: string
  videoUrl: string
  caption: string
}): Promise<SendResult> {
  try {
    const r = await fetch(`${telegramApiFor(input.token)}/sendVideo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: input.chatId,
        video: input.videoUrl,
        caption: input.caption,
        supports_streaming: true,
      }),
      // Telegram downloads the file itself; a minute is generous for 2 MB and
      // still bounded, because an unbounded fetch here hangs the whole tick.
      signal: AbortSignal.timeout(60_000),
    })
    const body = (await r.json().catch(() => ({}))) as {
      ok?: boolean
      description?: string
    }
    if (r.ok && body.ok) return { ok: true }
    return { ok: false, error: body.description || `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function outcome(o: Partial<DeliveryOutcome>): DeliveryOutcome {
  return {
    dryRun: false,
    reason: '',
    sent: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    tokenFrom: '',
    chatIdFrom: '',
    ...o,
  }
}

/**
 * One delivery run. Called from the autopilot tick and from the CLI wrapper.
 *
 * `send` and `env` are parameters only so a test can drive it without a network
 * and without touching process.env; nothing in production passes them.
 */
export async function deliverToChannel(opts: {
  db: Db | null
  log: Log
  env?: Env
  send?: SendVideo
  now?: Date
}): Promise<DeliveryOutcome> {
  const { db, log } = opts
  const env = opts.env || process.env
  const send = opts.send || sendViaTelegram
  const cfg = readChannelConfig(env)
  const base = { tokenFrom: cfg.tokenFrom, chatIdFrom: cfg.chatIdFrom }

  try {
    if (!db) {
      const reason = env.DATABASE_URL
        ? 'канал: база не открылась — ничего не отправляю'
        : 'канал: без DATABASE_URL — ничего не отправляю'
      log(reason)
      return outcome({ ...base, dryRun: true, reason })
    }
    if (!cfg.owner) {
      // Loud, not silent: an unresolved owner used to look exactly like an
      // empty queue, and an empty queue is what "everything is delivered" looks
      // like too.
      const reason = `канал: не определён владелец (${ENV_NAMES.identity.join(' / ')}) — ничего не отправляю`
      log(reason)
      return outcome({ ...base, dryRun: true, reason })
    }

    const pendingRes = await db.query(COUNT_PENDING, [cfg.owner, MAX_ATTEMPTS])
    const pending = Number(pendingRes?.rows?.[0]?.n) || 0

    const missing = [
      !cfg.token && ENV_NAMES.token[0],
      !cfg.chatId && ENV_NAMES.chatId[0],
    ].filter(Boolean)
    if (missing.length) {
      // Missing credentials are a DRY RUN, never a crash: the channel is a
      // deliberate act of the owner, not a precondition of the factory.
      const reason = `канал: нет реквизитов (${missing.join(', ')}) — сухой прогон, в очереди ${pending}`
      log(reason)
      return outcome({
        ...base,
        dryRun: true,
        reason,
        pending,
        skipped: pending,
      })
    }

    const day = (opts.now || new Date()).toISOString().slice(0, 10)
    const todayRes = await db.query(COUNT_TODAY, [cfg.owner, day])
    const sentToday = Number(todayRes?.rows?.[0]?.n) || 0
    const allowance = Math.max(0, cfg.maxPerDay - sentToday)

    if (cfg.maxPerDay === 0) {
      const reason = `канал: суточная квота 0 (${ENV_NAMES.perDay[0]} не задан) — в очереди ${pending}, не отправляю`
      log(reason)
      return outcome({
        ...base,
        dryRun: true,
        reason,
        pending,
        skipped: pending,
      })
    }
    if (allowance === 0) {
      const reason = `канал: суточная квота исчерпана (${sentToday}/${cfg.maxPerDay}), в очереди ${pending}`
      log(reason)
      return outcome({ ...base, reason, pending, skipped: pending })
    }

    const cap = Math.min(cfg.maxPerRun, allowance)
    const rows = (
      await db.query(SELECT_PENDING, [cfg.owner, MAX_ATTEMPTS, cap])
    )?.rows as PendingReel[]
    if (!rows?.length) {
      const reason = 'канал: новых рилсов нет — всё донесено'
      log(reason)
      return outcome({ ...base, reason, pending })
    }

    let sent = 0
    let failed = 0
    for (const reel of rows) {
      if (sent + failed >= cap) break
      // The guards the SQL already applies, applied again where a test can see
      // them. See the comment on SELECT_PENDING.
      if (reel.tg_posted_at) {
        log(
          `канал: рилс «${reel.name}» (id ${reel.id}) уже донесён — пропускаю`
        )
        continue
      }
      if (Number(reel.tg_post_attempts) >= MAX_ATTEMPTS) {
        log(
          `канал: рилс id ${reel.id} отбит ${MAX_ATTEMPTS} раза — отставляю, очередь не держу`
        )
        continue
      }
      const url = String(reel.video_url || '')
      if (!url) {
        log(`канал: у рилса id ${reel.id} нет video_url — пропускаю`)
        continue
      }
      if (isPresigned(url)) {
        log(
          `канал: у рилса id ${reel.id} ссылка со сроком годности — пропускаю, не жгу попытку`
        )
        continue
      }

      const res = await send({
        token: cfg.token,
        chatId: cfg.chatId,
        videoUrl: url,
        caption: captionFor(reel),
      })
      if (res.ok) {
        // Mark AFTER the confirmation, never before.
        await db.query(MARK_POSTED, [reel.id])
        sent++
        // Success is LOGGED. postReelToChannel returns silently on success, so
        // "delivered", "refused" and "never attempted" look identical in the
        // logs -- the absence of an error line is what had to serve as proof.
        log(
          `канал: отправлен рилс «${reel.name}» (id ${reel.id}) в ${cfg.chatId}`
        )
      } else {
        await db.query(MARK_ATTEMPT, [reel.id])
        failed++
        log(
          `канал: отправка не удалась (id ${reel.id}): ${String(res.error).slice(0, 160)}`
        )
        break // one refusal is enough for this tick; the next one retries
      }
    }

    const skipped = Math.max(0, pending - sent)
    if (skipped)
      log(
        `канал: осталось в очереди ${skipped} (потолок прогона ${cap}, за сутки ${sentToday + sent}/${cfg.maxPerDay})`
      )
    return outcome({
      ...base,
      reason: `отправлено ${sent}, не удалось ${failed}`,
      sent,
      failed,
      pending,
      skipped,
    })
  } catch (e) {
    // NEVER throws outward: the caller is a supervised daemon.
    const reason = `канал: сбой доставки (${String(e).slice(0, 160)})`
    log(reason)
    return outcome({ ...base, reason })
  }
}
