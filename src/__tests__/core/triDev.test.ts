import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TRI_DEV_COPY,
  clearTriDevBots,
  clearTriDevJobs,
  dispatchConfig,
  dispatchTriDevJob,
  isValidCastUrl,
  isValidPrUrl,
  parseTaskCommand,
  recentJobs,
  registerTriDevBot,
  replyToTriDev,
  statusText,
} from '@/core/bot/managedBots/triDev'
import { logger } from '@/utils/logger'

const OWNER = 144022504
const BOT = 7000000001
const TOKEN = 'test-dispatch-token-not-a-secret' // secret-guard-ok: test fixture

const ctx = (over: Partial<Parameters<typeof replyToTriDev>[0]> = {}) => ({
  botId: BOT,
  ownerId: OWNER,
  fromId: OWNER,
  chatId: OWNER,
  language: 'en',
  text: '/task https://github.com/gHashTag/t27/issues/42 fix the parser',
  paid: true,
  renewUrl: 'https://t.me/t27ai_bot?start=agentpkg_tridev',
  ...over,
})

afterEach(() => {
  clearTriDevJobs()
  clearTriDevBots()
  vi.restoreAllMocks()
})

describe('the cast link a TRI DEV owner may be sent', () => {
  it('is https://t27.ai/term/ and nothing else', () => {
    expect(isValidCastUrl('https://t27.ai/term/abc123')).toBe(true)
    expect(isValidCastUrl('https://t27.ai/term/2026/10/03/job-1.cast')).toBe(
      true
    )
    for (const bad of [
      'https://t27.ai/term/',
      'http://t27.ai/term/abc',
      'https://t27.ai/terms/abc',
      'https://t27.ai.evil.com/term/abc',
      'https://evil.com/?https://t27.ai/term/abc',
      'https://t27.ai@evil.com/term/abc',
      'https://t27.ai:8443/term/abc',
      'https://t27.ai/term/a b',
      'javascript:alert(1)',
      '',
      42,
      undefined,
    ])
      expect(isValidCastUrl(bad), String(bad)).toBe(false)
  })

  it('a pull request link is a github.com pull request', () => {
    expect(isValidPrUrl('https://github.com/gHashTag/t27/pull/7')).toBe(true)
    expect(isValidPrUrl('https://github.com/gHashTag/t27/issues/7')).toBe(false)
    expect(isValidPrUrl('https://evil.com/gHashTag/t27/pull/7')).toBe(false)
  })
})

describe('/task', () => {
  it('reads an issue link and its repository, or plain text', () => {
    expect(
      parseTaskCommand('/task https://github.com/gHashTag/t27/issues/42 fix it')
    ).toEqual({
      task: 'https://github.com/gHashTag/t27/issues/42 fix it',
      issueUrl: 'https://github.com/gHashTag/t27/issues/42',
      repo: 'gHashTag/t27',
    })
    expect(parseTaskCommand('/task@my_tri_dev_bot add a README')).toEqual({
      task: 'add a README',
    })
    expect(parseTaskCommand('/task')).toBeNull()
    expect(parseTaskCommand('/task   ')).toBeNull()
  })
})

describe('with no runner connected', () => {
  it('says so plainly, and sends nothing anywhere', async () => {
    const fetch = vi.fn()
    const reply = await replyToTriDev(ctx(), {
      config: dispatchConfig({}),
      fetch: fetch as any,
    })
    expect(reply).toBe(TRI_DEV_COPY.en.notConnected)
    expect(fetch).not.toHaveBeenCalled()
    expect(recentJobs(BOT)).toEqual([])
  })

  it('an address with no key is not connected either: never sent unauthenticated', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    const fetch = vi.fn()
    expect(
      await dispatchTriDevJob(
        { botId: BOT, ownerId: OWNER, chatId: OWNER, task: 'x' },
        {
          config: dispatchConfig({
            TRI_DEV_DISPATCH_URL: 'https://runner.test',
          }),
          fetch: fetch as any,
        }
      )
    ).toEqual({ ok: false, reason: 'not-connected' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reads the two names from the environment', () => {
    expect(
      dispatchConfig({
        TRI_DEV_DISPATCH_URL: ' https://runner.test ',
        TRI_DEV_DISPATCH_TOKEN: TOKEN,
      })
    ).toEqual({ url: 'https://runner.test', token: TOKEN })
  })
})

describe('with a runner connected', () => {
  const connected = (answer: Response | Error) => {
    const fetch = vi.fn(async () => {
      if (answer instanceof Error) throw answer
      return answer
    })
    return {
      fetch,
      deps: {
        config: { url: 'https://runner.test/', token: TOKEN },
        fetch: fetch as any,
        now: 1000,
      },
    }
  }

  it('POSTs the job to {url}/jobs with the key in Authorization, and never logs the key', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => logger)
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    const { fetch, deps } = connected(
      new Response(JSON.stringify({ jobId: 'job-1' }), { status: 202 })
    )
    const reply = await replyToTriDev(ctx(), deps)
    expect(reply).toBe(TRI_DEV_COPY.en.accepted('job-1'))
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://runner.test/jobs')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`
    )
    expect(JSON.parse(String(init.body))).toEqual({
      botId: BOT,
      ownerId: OWNER,
      chatId: OWNER,
      task: 'https://github.com/gHashTag/t27/issues/42 fix the parser',
      repo: 'gHashTag/t27',
      issueUrl: 'https://github.com/gHashTag/t27/issues/42',
    })
    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls])
    expect(logged).not.toContain(TOKEN)
    expect(recentJobs(BOT).map(j => [j.jobId, j.status])).toEqual([
      ['job-1', 'sent'],
    ])
    expect(statusText(BOT, 'en')).toContain('sent')
  })

  it('a refusal and an unreachable runner are told as they are', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    expect(
      await replyToTriDev(
        ctx(),
        connected(new Response('no', { status: 500 })).deps
      )
    ).toBe(TRI_DEV_COPY.en.refused)
    expect(
      await replyToTriDev(ctx(), connected(new Error('ECONNREFUSED')).deps)
    ).toBe(TRI_DEV_COPY.en.unreachable)
    expect(recentJobs(BOT)).toEqual([])
  })
})

describe('only the owner gives tasks', () => {
  it('anybody else is refused before anything is sent', async () => {
    const fetch = vi.fn()
    expect(
      await replyToTriDev(ctx({ fromId: 1, language: 'ru' }), {
        config: { url: 'https://runner.test', token: TOKEN },
        fetch: fetch as any,
      })
    ).toBe(TRI_DEV_COPY.ru.ownerOnly)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('an unpaid bot takes no task; /status and /help still answer', async () => {
    const fetch = vi.fn()
    const deps = {
      config: { url: 'https://runner.test', token: TOKEN },
      fetch: fetch as any,
    }
    expect(await replyToTriDev(ctx({ paid: false }), deps)).toBe(
      TRI_DEV_COPY.en.unpaid('https://t.me/t27ai_bot?start=agentpkg_tridev')
    )
    expect(await replyToTriDev(ctx({ text: '/status' }), deps)).toBe(
      TRI_DEV_COPY.en.none
    )
    expect(await replyToTriDev(ctx({ text: '/start' }), deps)).toBe(
      TRI_DEV_COPY.en.help
    )
    expect(await replyToTriDev(ctx({ text: '/task' }), deps)).toBe(
      TRI_DEV_COPY.en.usage
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('the runner callback', () => {
  const ENV = 'TRI_DEV_CALLBACK_SECRET'
  const SECRET = 'test-callback-secret-not-a-real-one' // secret-guard-ok: test fixture
  let server: import('node:http').Server | null = null

  afterEach(async () => {
    delete process.env[ENV]
    await new Promise<void>(r => (server ? server.close(() => r()) : r()))
    server = null
  })

  async function app(): Promise<string> {
    const express = (await import('express')).default
    const router = (await import('@/api_server/routes/tri-dev-callback.routes'))
      .default
    const a = express()
    a.use(express.json())
    a.use('/api', router)
    await new Promise<void>(r => {
      server = a.listen(0, '127.0.0.1', () => r())
    })
    const port = (server!.address() as import('node:net').AddressInfo).port
    return `http://127.0.0.1:${port}/api/tri-dev/callback`
  }

  const report = {
    jobId: 'job-1',
    chatId: OWNER,
    botId: BOT,
    status: 'done',
    prUrl: 'https://github.com/gHashTag/t27/pull/7',
    castUrl: 'https://t27.ai/term/job-1',
    summary: 'Parser fixed.',
  }

  const post = (url: string, body: unknown, secret?: string) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'X-Tri-Dev-Secret': secret } : {}),
      },
      body: JSON.stringify(body),
    })

  it('refuses everything while no secret is configured (fail closed)', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    const url = await app()
    expect((await post(url, report, SECRET)).status).toBe(503)
  })

  it('refuses a wrong or missing secret, and messages nobody', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    process.env[ENV] = SECRET
    const send = vi.fn(async () => true)
    registerTriDevBot(BOT, { ownerId: OWNER, send })
    const url = await app()
    expect((await post(url, report)).status).toBe(401)
    expect((await post(url, report, `${SECRET}x`)).status).toBe(401)
    expect(send).not.toHaveBeenCalled()
  })

  it('with the secret, sends the owner the pull request and the cast', async () => {
    vi.spyOn(logger, 'info').mockImplementation(() => logger)
    process.env[ENV] = SECRET
    const send = vi.fn(async () => true)
    registerTriDevBot(BOT, { ownerId: OWNER, send })
    const url = await app()
    const res = await post(url, report, SECRET)
    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
    const [chatId, text] = send.mock.calls[0] as unknown as [number, string]
    expect(chatId).toBe(OWNER)
    expect(text).toContain('https://github.com/gHashTag/t27/pull/7')
    expect(text).toContain('https://t27.ai/term/job-1')
  })

  it('refuses a cast outside t27.ai/term, and a chat that is not the owner', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => logger)
    process.env[ENV] = SECRET
    const send = vi.fn(async () => true)
    registerTriDevBot(BOT, { ownerId: OWNER, send })
    const url = await app()
    expect(
      (
        await post(
          url,
          { ...report, castUrl: 'https://evil.com/term/x' },
          SECRET
        )
      ).status
    ).toBe(400)
    expect((await post(url, { ...report, chatId: 1 }, SECRET)).status).toBe(403)
    expect((await post(url, { ...report, botId: 1 }, SECRET)).status).toBe(404)
    expect(send).not.toHaveBeenCalled()
  })
})
