import express from 'express'

import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

export const githubWebhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  message: {
    error: 'Too many webhook requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // X-Real-IP is set by the Railway edge; the head of X-Forwarded-For is
    // whatever the caller wrote there.
    const realIp = req.get('X-Real-IP')
    const forwarded = req.get('X-Forwarded-For')
    const clientIp =
      realIp || (forwarded ? forwarded.split(',')[0].trim() : req.ip)

    // ipKeyGenerator(ip, ipv6Subnet). It used to be called as
    // ipKeyGenerator(req, clientIp): a non-IP first argument comes back
    // unchanged, so the key was the request object itself, every request got
    // a fresh counter, and the limiter never limited anything (live
    // 2026-10-03: `ratelimit-remaining: 99` on every request in a row).
    return ipKeyGenerator(clientIp)
  },
})

export const validateGitHubHeaders = (req: any, res: any, next: any): void => {
  const userAgent = req.get('User-Agent')
  const event = req.get('X-GitHub-Event')

  // Проверяем, что запрос идет от GitHub
  if (!userAgent || !userAgent.startsWith('GitHub-Hookshot/')) {
    res.status(400).json({ error: 'Invalid User-Agent' })
    return
  }

  // Проверяем наличие заголовка события
  if (!event) {
    res.status(400).json({ error: 'Missing X-GitHub-Event header' })
    return
  }

  // Добавляем информацию о событии в request
  req.githubEvent = event
  next()
}

export const validatePullRequestEvent = (
  req: any,
  res: any,
  next: any
): void => {
  if (req.githubEvent !== 'pull_request') {
    res.status(200).json({ message: 'Event ignored' })
    return
  }

  const { action, pull_request } = req.body

  if (!action || !pull_request) {
    res.status(400).json({ error: 'Invalid pull request webhook payload' })
    return
  }

  next()
}

export const logWebhookRequest = (req: any, res: any, next: any): void => {
  const timestamp = new Date().toISOString()
  const event = req.githubEvent || 'unknown'
  const action = req.body?.action || 'unknown'
  const prNumber = req.body?.pull_request?.number || 'N/A'

  console.log(
    `🎣 [GitHub Webhook] ${timestamp} | Event: ${event} | Action: ${action} | PR: #${prNumber}`
  )

  next()
}

export const enableRawBody = (req: any, res: any, next: any): void => {
  // Сохраняем raw body для валидации подписи
  req.rawBody = JSON.stringify(req.body)
  next()
}
