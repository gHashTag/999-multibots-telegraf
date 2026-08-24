// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MAX_MEDIA_ATTEMPTS,
  canRetryMedia,
  classifyVideoElementError,
  createFeedMediaState,
  feedMediaReducer,
  isFeedVideoUrl,
} from '../feedMedia'

const feedCardSource = readFileSync(
  new URL('../../components/Panels/FeedCard.tsx', import.meta.url),
  'utf8'
)

describe('feed media lifecycle', () => {
  it('shows an honest no-preview state without treating it as a video failure', () => {
    expect(
      createFeedMediaState('https://cdn.example/video.mp4', undefined)
    ).toMatchObject({
      status: 'idle',
      posterStatus: 'missing',
      reason: 'thumbnail_missing',
    })
  })

  it('distinguishes network, decode and unsupported-source errors', () => {
    expect(classifyVideoElementError(2)).toBe('network_error')
    expect(classifyVideoElementError(3)).toBe('decode_error')
    expect(classifyVideoElementError(4)).toBe('unsupported_codec')
  })

  it('allows only http media sources to reach the video element', () => {
    expect(isFeedVideoUrl('https://cdn.example/video.mp4')).toBe(true)
    expect(isFeedVideoUrl('http://cdn.example/video.mp4')).toBe(true)
    expect(isFeedVideoUrl('javascript:alert(1)')).toBe(false)
    expect(isFeedVideoUrl('/relative/video.mp4')).toBe(false)
  })

  it('records a broken poster and continues with the video lifecycle', () => {
    const initial = createFeedMediaState(
      'https://cdn.example/video.mp4',
      'https://cdn.example/broken.jpg'
    )
    const next = feedMediaReducer(initial, { type: 'poster_error' })

    expect(next.posterStatus).toBe('error')
    expect(next.status).toBe('idle')
    expect(next.reason).toBe('thumbnail_error')
  })

  it('stops retrying after the bounded attempt budget', () => {
    let state = createFeedMediaState('https://cdn.example/video.mp4')
    for (let attempt = 0; attempt < MAX_MEDIA_ATTEMPTS + 3; attempt += 1) {
      state = feedMediaReducer(state, { type: 'load_started' })
      state = feedMediaReducer(state, {
        type: 'video_error',
        reason: 'network_error',
      })
      state = feedMediaReducer(state, { type: 'retry' })
    }

    expect(state.attempts).toBe(MAX_MEDIA_ATTEMPTS)
    expect(canRetryMedia(state)).toBe(false)
    expect(state.status).toBe('error')
  })

  it('turns a stalled load into a visible timeout state', () => {
    const loading = feedMediaReducer(
      createFeedMediaState('https://cdn.example/video.mp4'),
      { type: 'load_started' }
    )

    expect(feedMediaReducer(loading, { type: 'timeout' })).toMatchObject({
      status: 'error',
      reason: 'load_timeout',
    })
  })

  it('resets a failed lifecycle when the same record receives a corrected source', () => {
    const failed = feedMediaReducer(
      {
        ...createFeedMediaState('https://cdn.example/broken.mp4'),
        status: 'error',
        attempts: MAX_MEDIA_ATTEMPTS,
        reason: 'decode_error',
      },
      {
        type: 'source_changed',
        videoUrl: 'https://cdn.example/corrected.mp4',
        thumbnailUrl: 'https://cdn.example/corrected.jpg',
      }
    )

    expect(failed).toEqual({
      status: 'idle',
      posterStatus: 'ready',
      reason: null,
      attempts: 0,
    })
  })

  it('wires the bounded lifecycle without logging signed media URLs', () => {
    expect(feedCardSource).toContain('useReducer(\n    feedMediaReducer')
    expect(feedCardSource).toContain("dispatchMedia({ type: 'poster_error' })")
    expect(feedCardSource).toContain('canRetryMedia(mediaState)')
    expect(feedCardSource).toContain('shouldLoadVideo && hasUsableVideoUrl')
    expect(feedCardSource).toContain('videoError && !hasUsableVideoUrl')
    expect(feedCardSource).toContain("type: 'source_changed'")
    expect(feedCardSource).toContain("video.removeAttribute('src')")
    expect(feedCardSource).toContain('video.src = template.videoUrl')
    expect(feedCardSource).not.toContain('crossOrigin="anonymous"')
    expect(feedCardSource).not.toContain(
      "console.log('[FeedCard] Video loaded:', template.videoUrl)"
    )
    expect(feedCardSource).not.toMatch(/template\.videoUrl,\s*video\.error/)
  })
})
