/**
 * A PLAYER THAT CANNOT PLAY MUST SAY SO.
 *
 * `ImageAsset` learned this when a signed S3 link expired: a broken preview
 * and no preview look the same to a person, and only one of them still has a
 * working link to the original. The player was left as a bare <video> and
 * kept the failure -- measured in the browser pane, a source the browser
 * cannot open leaves 152px of black standing with a dead control bar, and up
 * to `max-height: 420px` once a vertical reel has reported its size.
 *
 * Owner, 25.09.2026, on the CRM screen: things are stretched vertically.
 * This is one of the ways it happens, and the honest fix is not a smaller
 * box -- it is a box that admits there is nothing in it.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChatAssets } from './ChatAssets'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const show = (text: string) => {
  act(() => root.render(<ChatAssets text={text} />))
  return host
}

const VIDEO = 'https://example.com/reel.mp4'
const AUDIO = 'https://example.com/voice.mp3'

describe('an asset that fails to load falls back to its link', () => {
  it('a video renders as a player while it is fine', () => {
    const el = show(VIDEO)
    expect(el.querySelector('video')).toBeTruthy()
    expect(el.querySelector('a.chat-assets__link')).toBeNull()
  })

  it('and becomes a link the moment the source fails', () => {
    const el = show(VIDEO)
    const v = el.querySelector('video')!
    act(() => {
      v.dispatchEvent(new Event('error'))
    })
    expect(el.querySelector('video'), 'the black box must go').toBeNull()
    const link = el.querySelector('a.chat-assets__link') as HTMLAnchorElement
    expect(link, 'and a working link must take its place').toBeTruthy()
    expect(link.href).toBe(VIDEO)
  })

  it('the same for audio: a dead control bar is smaller, not more honest', () => {
    const el = show(AUDIO)
    const a = el.querySelector('audio')!
    act(() => {
      a.dispatchEvent(new Event('error'))
    })
    expect(el.querySelector('audio')).toBeNull()
    expect(
      (el.querySelector('a.chat-assets__link') as HTMLAnchorElement).href
    ).toBe(AUDIO)
  })

  it('a working asset is NOT replaced: the fallback waits for a failure', () => {
    // The negative control. "Always show a link" would pass every assertion
    // above while removing the preview this screen exists for.
    const el = show(VIDEO)
    expect(el.querySelector('video')).toBeTruthy()
    expect(el.querySelector('a.chat-assets__link')).toBeNull()
  })
})
