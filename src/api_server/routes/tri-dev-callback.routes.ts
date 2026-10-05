import express, { type Router } from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import { logger } from '@/utils/logger'
import {
  CALLBACK_STATUSES,
  isValidCastUrl,
  isValidPrUrl,
  resultText,
  triDevBot,
  updateJob,
  type TriDevStatus,
} from '@/core/bot/managedBots/triDev'

/**
 * POST /api/tri-dev/callback -- THE TRI DEV RUNNER REPORTS ON A JOB.
 *
 * Body: {jobId, chatId, botId, status, prUrl?, castUrl?, summary?}.
 *
 * Public mount, self-authenticated: the runner sends the shared secret
 * TRI_DEV_CALLBACK_SECRET in the `X-Tri-Dev-Secret` header (or as
 * `Authorization: Bearer`), compared in constant time. With no secret
 * configured every call is refused (503) -- fail closed, never open.
 *
 * Even an authenticated call may only message the OWNER of a TRI DEV bot
 * running in this process, through that bot: chatId must be the bot's owner.
 * A cast link must start with https://t27.ai/term/ and a pull request link
 * must be a github.com pull request, or the call is refused -- the bot never
 * sends its owner a link the runner was not supposed to produce.
 */
const router: Router = express.Router()

const digest = (s: string) => createHash('sha256').update(s).digest()

/** Constant-time: both sides are hashed to the same length first. */
export function secretMatches(
  given: unknown,
  expected: string | undefined
): boolean {
  if (!expected || typeof given !== 'string' || !given) return false
  return timingSafeEqual(digest(given), digest(expected))
}

function presentedSecret(req: any): string | undefined {
  const header = req.headers?.['x-tri-dev-secret']
  if (typeof header === 'string' && header) return header
  const auth = req.headers?.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer '))
    return auth.slice('Bearer '.length)
  return undefined
}

const toId = (v: unknown): number | null => {
  const n = typeof v === 'string' && /^-?\d{1,20}$/.test(v) ? Number(v) : v
  return typeof n === 'number' && Number.isSafeInteger(n) && n !== 0 ? n : null
}

export interface TriDevReport {
  jobId: string
  chatId: number
  botId: number
  status: TriDevStatus
  prUrl?: string
  castUrl?: string
  summary?: string
}

/** The report, or the reason it is refused. */
export function readReport(body: unknown): TriDevReport | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'body' }
  const b = body as Record<string, unknown>
  if (typeof b.jobId !== 'string' || !/^[\w.:-]{1,100}$/.test(b.jobId))
    return { error: 'jobId' }
  const chatId = toId(b.chatId)
  const botId = toId(b.botId)
  if (chatId === null) return { error: 'chatId' }
  if (botId === null || botId < 0) return { error: 'botId' }
  if (!CALLBACK_STATUSES.includes(b.status as TriDevStatus))
    return { error: 'status' }
  if (b.prUrl !== undefined && b.prUrl !== null && !isValidPrUrl(b.prUrl))
    return { error: 'prUrl' }
  if (
    b.castUrl !== undefined &&
    b.castUrl !== null &&
    !isValidCastUrl(b.castUrl)
  )
    return { error: 'castUrl' }
  if (
    b.summary !== undefined &&
    b.summary !== null &&
    typeof b.summary !== 'string'
  )
    return { error: 'summary' }
  return {
    jobId: b.jobId,
    chatId,
    botId,
    status: b.status as TriDevStatus,
    ...(typeof b.prUrl === 'string' ? { prUrl: b.prUrl } : {}),
    ...(typeof b.castUrl === 'string' ? { castUrl: b.castUrl } : {}),
    ...(typeof b.summary === 'string' && b.summary.trim()
      ? { summary: b.summary.trim().slice(0, 1000) }
      : {}),
  }
}

router.post('/tri-dev/callback', async (req: any, res: any) => {
  const expected = process.env.TRI_DEV_CALLBACK_SECRET?.trim() || undefined
  if (!expected) {
    logger.warn('[tri-dev] callback refused: no callback secret configured')
    return res.status(503).json({ error: 'not configured' })
  }
  if (!secretMatches(presentedSecret(req), expected)) {
    logger.warn('[tri-dev] callback refused: bad secret')
    return res.status(401).json({ error: 'unauthorized' })
  }
  const report = readReport(req.body)
  if ('error' in report) {
    return res.status(400).json({ error: `invalid ${report.error}` })
  }
  const bot = triDevBot(report.botId)
  if (!bot) return res.status(404).json({ error: 'bot not running here' })
  if (bot.ownerId !== report.chatId) {
    logger.warn('[tri-dev] callback refused: chat is not the bot owner', {
      bot: report.botId,
      job: report.jobId,
    })
    return res.status(403).json({ error: 'chat is not the bot owner' })
  }
  const job = updateJob(report.botId, report.jobId, {
    status: report.status,
    ...(report.prUrl ? { prUrl: report.prUrl } : {}),
    ...(report.castUrl ? { castUrl: report.castUrl } : {}),
    ...(report.summary ? { summary: report.summary } : {}),
  })
  try {
    await bot.send(report.chatId, resultText(report, job?.language))
  } catch (error) {
    logger.error('[tri-dev] owner not reached', {
      bot: report.botId,
      job: report.jobId,
      error: error instanceof Error ? error.message : String(error),
    })
    return res.status(502).json({ error: 'owner not reached' })
  }
  logger.info('[tri-dev] job reported', {
    bot: report.botId,
    job: report.jobId,
    status: report.status,
    known: job !== null,
  })
  return res.json({ ok: true })
})

export default router
