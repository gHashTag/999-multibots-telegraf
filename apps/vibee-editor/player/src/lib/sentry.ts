// Sentry Error Tracking Configuration
// TODO: Install Sentry: npm install @sentry/react

import * as Sentry from '@sentry/react'

export function initSentry() {
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      // No Session Replay. It recorded the screen unmasked: pairing codes,
      // names, chat text, and the page address with Telegram's launch data in
      // its fragment. src/__tests__/sentry-replay-is-off.test.ts fails if it
      // comes back unmasked.
      integrations: [new Sentry.BrowserTracing()],

      // Performance Monitoring
      tracesSampleRate: 0.1, // 10% of transactions

      // Environment
      environment: import.meta.env.MODE,

      // Release tracking
      release: import.meta.env.VITE_APP_VERSION,

      // Ignore common errors
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
      ],

      // Before send hook
      beforeSend(event, hint) {
        // Don't send events in development
        if (import.meta.env.DEV) {
          console.error('Sentry event (dev):', event, hint)
          return null
        }
        return event
      },
    })
  }
}

// Helper to capture script generation errors
export function captureScriptError(
  error: unknown,
  context: {
    topic: string
    niche: string
    style: string
    duration: number
    language: string
  }
) {
  Sentry.captureException(error, {
    tags: {
      feature: 'script_generation',
      niche: context.niche,
      style: context.style,
      duration: context.duration.toString(),
      language: context.language,
    },
    extra: {
      topic: context.topic,
      context,
    },
    level: 'error',
  })
}

// Helper to track script generation performance
export function trackScriptGeneration(
  duration: number,
  success: boolean,
  context: {
    niche: string
    style: string
    duration: number
  }
) {
  Sentry.addBreadcrumb({
    category: 'script',
    message: success
      ? 'Script generated successfully'
      : 'Script generation failed',
    level: success ? 'info' : 'error',
    data: {
      generation_time: duration,
      ...context,
    },
  })
}
