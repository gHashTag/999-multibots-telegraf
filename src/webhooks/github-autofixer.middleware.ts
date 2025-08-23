import express from 'express'

import rateLimit from 'express-rate-limit'

export const githubWebhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  message: {
    error: 'Too many webhook requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

export const validateGitHubHeaders = (
  req: any,
  res: any,
  next: any
): void => {
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

export const logWebhookRequest = (
  req: any,
  res: any,
  next: any
): void => {
  const timestamp = new Date().toISOString()
  const event = req.githubEvent || 'unknown'
  const action = req.body?.action || 'unknown'
  const prNumber = req.body?.pull_request?.number || 'N/A'

  console.log(
    `🎣 [GitHub Webhook] ${timestamp} | Event: ${event} | Action: ${action} | PR: #${prNumber}`
  )

  next()
}

export const enableRawBody = (
  req: any,
  res: any,
  next: any
): void => {
  // Сохраняем raw body для валидации подписи
  req.rawBody = JSON.stringify(req.body)
  next()
}

// Типы для расширения Request
declare global {
  namespace Express {
    interface Request {
      githubEvent?: string
      rawBody?: string
    }
  }
}