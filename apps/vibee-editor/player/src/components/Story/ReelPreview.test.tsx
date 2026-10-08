import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as SPEC from '@/spec/plan-reel.gen'
import { ReelPreview } from './ReelPreview'

/**
 * A REEL AS A PICTURE (plan-reel.t27 v3): the server's poster where one is
 * kept, so the card never fetches the video; the browser's frame otherwise.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const REEL = 'https://bucket.example/reel.mp4'

describe('ReelPreview', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  const show = (poster?: string | null) =>
    act(async () =>
      root.render(<ReelPreview url={REEL} poster={poster} label="watch: x" />)
    )

  it('a kept poster is the picture, and the video is never asked for', async () => {
    await show('https://shelf.example/s3/p.jpg')
    const img = host.querySelector('a.reel-preview img')
    expect(img?.getAttribute('src')).toBe('https://shelf.example/s3/p.jpg')
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(host.querySelector('video')).toBeNull()
    expect(host.querySelector('a')?.getAttribute('href')).toBe(REEL)
  })

  it('without a poster the browser draws the frame past the first', async () => {
    for (const none of [undefined, null, '', 'reel-13.jpg']) {
      await show(none)
      expect(host.querySelector('img')).toBeNull()
      const v = host.querySelector('video')
      expect(v?.getAttribute('src')).toBe(
        `${REEL}#t=${SPEC.PREVIEW_SEEK_MS / 1000}`
      )
      expect(v?.muted).toBe(true)
      expect(v?.autoplay).toBe(false)
    }
  })

  it('is 9:16 at the card width either way', async () => {
    await show('https://shelf.example/s3/p.jpg')
    const a = host.querySelector<HTMLAnchorElement>('a.reel-preview')!
    expect(a.style.width).toBe(`${SPEC.PREVIEW_CARD_PX}px`)
    expect(a.style.height).toBe('128px')
  })
})
