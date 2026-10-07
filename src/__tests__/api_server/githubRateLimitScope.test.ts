import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

/**
 * The GitHub webhook limiter (100 requests / 15 min per IP) used to be a bare
 * `router.use` on a router mounted at '/api'. Express runs router-level
 * middleware for every request that ENTERS the router, so it ran for every
 * /api/* request -- /api/inngest, /api/video-callback, /api/kie-ai/* -- and
 * Inngest, which calls from a single IP, shared GitHub's budget. Measured on
 * the live deploy 2026-10-03: `POST /api/inngest` answered with
 * `ratelimit-policy: 100;w=900`.
 *
 * Mounted exactly as api_server/index.ts mounts it, with a sibling route
 * behind it standing in for every router mounted later.
 */

vi.mock('../../webhooks/github-autofixer.controller', () => ({
  GitHubAutoFixerController: class {
    async handlePullRequestWebhook(_req: any, res: any) {
      res.status(200).json({ ok: true })
    }
    async handleManualFix(_req: any, res: any) {
      res.status(200).json({ ok: true })
    }
  },
}))

let server: Server
let base: string

beforeAll(async () => {
  const { default: githubAutoFixerRouter } = await import(
    '../../api_server/routes/github-autofixer.routes'
  )
  const app = express()
  app.use(express.json())
  app.use('/api', githubAutoFixerRouter)
  app.post('/api/inngest', (_req, res) => {
    res.status(200).json({ ok: true })
  })
  server = app.listen(0)
  await new Promise(r => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise(r => server.close(r))
})

const post = (path: string) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })

describe('the GitHub webhook limiter', () => {
  it('still guards the GitHub webhook itself', async () => {
    // Control: without this, removing the limiter altogether would also
    // make the test below pass.
    const res = await post('/api/webhooks/github/pr-issues')
    expect(res.headers.get('ratelimit-policy')).toBe('100;w=900')
  })

  it('does not touch routes mounted after the router', async () => {
    const res = await post('/api/inngest')
    expect(res.status).toBe(200)
    expect(res.headers.get('ratelimit-policy')).toBeNull()
  })

  it('lets a sibling route through past GitHub budget', async () => {
    const statuses = new Set<number>()
    for (let i = 0; i < 105; i++)
      statuses.add((await post('/api/inngest')).status)
    expect([...statuses]).toEqual([200])
  })

  it('actually limits: the 101st GitHub call from one IP is refused', async () => {
    // The key used to be the request object (ipKeyGenerator called with its
    // arguments swapped), so every call got a fresh counter and this was 200
    // forever. One call is already spent by the control above.
    const statuses: number[] = []
    for (let i = 0; i < 100; i++)
      statuses.push((await post('/api/webhooks/github/pr-issues')).status)
    expect(statuses.at(-2)).not.toBe(429)
    expect(statuses.at(-1)).toBe(429)
  })
})
