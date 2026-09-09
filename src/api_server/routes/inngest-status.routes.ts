/**
 * GET /api/inngest/functions/status — public, READ-ONLY status of the Inngest
 * functions of this app (design: inngest-spec-first §3.8).
 *
 *   - data: manifest (SSOT) × Inngest GraphQL `apps` + `runs` (7d, single page)
 *   - 30 s in-memory cache (see status/functionsStatus.ts)
 *   - CORS allow-list: https://t27.ai and http://localhost:<any port>
 *   - no mutations are reachable through this router
 *
 * Mount order: must be registered BEFORE `app.use('/api/inngest', serve(...))`
 * so the serve handler's signature check does not swallow the request, and
 * before any `requireInternalKey` mount (public endpoint).
 */
import { Router } from 'express'
import { fetchFunctionsStatusSafe } from '@/inngest_app/status/functionsStatus'

export const INNGEST_STATUS_PATH = '/api/inngest/functions/status'

const ALLOWED_ORIGINS_EXACT = new Set(['https://t27.ai'])
const LOCALHOST_RE = /^http:\/\/localhost(:\d+)?$/

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  return ALLOWED_ORIGINS_EXACT.has(origin) || LOCALHOST_RE.test(origin)
}

export function applyCors(req: any, res: any): void {
  const origin = req.headers?.origin as string | undefined
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Max-Age', '600')
  }
}

export async function handleFunctionsStatus(req: any, res: any): Promise<void> {
  applyCors(req, res)
  res.setHeader('Cache-Control', 'public, max-age=30')
  const result = await fetchFunctionsStatusSafe()
  if (result.ok) {
    res.status(200).json(result.payload)
    return
  }
  res.status(503).json({
    generatedAt: result.error.generatedAt,
    error: 'inngest-unreachable',
    detail: result.error.error,
    gqlUrl: result.error.gqlUrl,
  })
}

export function handleFunctionsStatusOptions(req: any, res: any): void {
  applyCors(req, res)
  res.status(204).end()
}

const router: any = Router()
router.options(INNGEST_STATUS_PATH, handleFunctionsStatusOptions)
router.get(INNGEST_STATUS_PATH, handleFunctionsStatus)

export default router
