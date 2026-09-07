import { describe, expect, it } from 'vitest'
import {
  MINI_APP_TASK_ROUTES,
  miniAppTaskDestination,
  resolveMiniAppStartRoute,
} from './miniAppRoutes'

describe('bot links open the requested task directly', () => {
  it.each([
    ['chat', '/chat'],
    ['script', '/generate/script'],
    ['audio', '/generate/audio'],
    ['image', '/generate/image'],
    ['avatar', '/generate/avatar'],
    ['video', '/generate/video'],
    ['editor', '/generate/editor'],
    ['plan', '/profile?tab=plan'],
    ['files', '/profile?tab=files'],
    ['skills', '/profile?tab=skills'],
    ['pair', '/profile?tab=agent'],
  ])(
    '%s resolves through signed start_param or the inline query',
    (destination, path) => {
      expect(resolveMiniAppStartRoute(destination, '')).toBe(path)
      expect(
        resolveMiniAppStartRoute(
          undefined,
          `?tgWebAppStartParam=${destination}`
        )
      ).toBe(path)
    }
  )
  it('uses the Telegram start parameter ahead of a query hint', () => {
    expect(resolveMiniAppStartRoute('chat', '?tgWebAppStartParam=audio')).toBe(
      '/chat'
    )
  })
  it.each(['https://evil.example', '../admin', 'constructor', '__proto__'])(
    'rejects arbitrary routes %s',
    path => {
      expect(resolveMiniAppStartRoute(path, '')).toBeUndefined()
      expect(
        miniAppTaskDestination({ type: 'open_mini_app', destination: path })
      ).toBeUndefined()
    }
  )
  it('accepts only known action destinations, never supplied URLs', () => {
    expect(
      miniAppTaskDestination({ type: 'open_mini_app', destination: 'audio' })
    ).toBe('audio')
    expect(
      miniAppTaskDestination({
        type: 'open_mini_app',
        destination: 'audio',
        url: 'https://evil.example',
      })
    ).toBeUndefined()
    expect(
      Object.values(MINI_APP_TASK_ROUTES).every(route => route.startsWith('/'))
    ).toBe(true)
  })
})
