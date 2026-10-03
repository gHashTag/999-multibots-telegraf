import express, { type Router } from 'express'
import { agentPackageCatalogue } from '@/services/agentPackageCatalogue'

/**
 * GET /api/agents/packages -- THE AGENT PACKAGES, FOR ANYBODY.
 *
 * Public on purpose: the t27.ai site and any other page that sells an agent
 * reads the price from here instead of typing it. It answers the catalogue and
 * nothing else -- ids, titles, Stars, the derived dollars, the order link --
 * reads no secret and writes nothing. Mounted ABOVE the requireInternalKey
 * mounts in api_server/index.ts: below them every /api/* answers 401 (it did in
 * production before this router was moved, 2026-10-03).
 */
const router: Router = express.Router()

const cors = (res: any): void => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

router.options('/agents/packages', (_req: any, res: any) => {
  cors(res)
  res.status(204).end()
})

router.get('/agents/packages', (_req: any, res: any) => {
  cors(res)
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json({ packages: agentPackageCatalogue() })
})

export default router
