/**
 * The tests of browser-viewer-boot.t27, run against the code that carries it:
 * the scripts src/browser/skin.ts injects into the live-browser window
 * (BOOT_SCRIPT, LANG_SCRIPT) and src/browser/live-proxy.ts (viewerLangOf).
 *
 * The spec's laws are fns (mode_at, remembered_after, lang_kept, muted); here
 * every vector is answered by the host itself, on the hand-made page in
 * browser-viewer-page.testkit.ts, never by a TypeScript copy of the fn.
 */
import { describe, expect, it } from 'vitest'
import * as SPEC from './browser-viewer-boot.gen'
import {
  BOOT_FAST_WATCH_MS,
  BOOT_GIVE_UP_MS,
  WATCH_KEY_PREFIX,
} from '../browser/skin'
import { viewerLangOf } from '../browser/live-proxy'
import { ID, lang, page, video } from '../../browser-viewer-page.testkit'

const KEY = WATCH_KEY_PREFIX + ID

/* What the window shows: the loader, frames (watch) mode, or nothing. */
function modeOf(p: ReturnType<typeof page>): number {
  if (p.bootAttrs['data-done'] === '1') return SPEC.MODE_DONE
  if (p.bootAttrs['data-watch'] === '1') return SPEC.MODE_FRAMES
  return SPEC.MODE_LOADER
}

/* Lets the timers of BOOT_SCRIPT run up to elapsed, in order. */
function runTo(p: ReturnType<typeof page>, elapsed: number): void {
  for (const ms of [SPEC.BOOT_FAST_WATCH_MS, SPEC.BOOT_GIVE_UP_MS].sort(
    (a, b) => a - b
  ))
    if (elapsed >= ms) p.after(ms)
}

function play(p: ReturnType<typeof page>): void {
  const v = video()
  p.addVideo(v)
  v.paused = false
  v.on.playing?.()
}

/* mode_at(elapsed_ms, frames, playing, remembered), answered by the host. */
function modeAt(
  elapsed: number,
  frames: boolean,
  playing: boolean,
  remembered: boolean
): number {
  const store = new Map<string, string>()
  if (remembered) store.set(KEY, '1')
  const p = page({ store })
  if (frames) p.frame()
  runTo(p, elapsed)
  if (playing) play(p)
  return modeOf(p)
}

/* remembered_after(was, entered_frames, played), answered by the host. */
function rememberedAfter(
  was: boolean,
  enteredFrames: boolean,
  played: boolean
): boolean {
  const store = new Map<string, string>()
  if (was) store.set(KEY, '1')
  const p = page({ store })
  if (enteredFrames) {
    p.frame()
    p.after(SPEC.BOOT_FAST_WATCH_MS)
  }
  if (played) play(p)
  return store.get(KEY) === '1'
}

/* lang_kept(asked): both the window script and the proxy must agree. */
function langKept(asked: string): boolean {
  const inWindow = lang(`?${SPEC.LANG_PARAM}=${asked}`).attrs['data-t27-lang']
  const inProxy = viewerLangOf(asked)
  expect(inWindow ?? null).toBe(inProxy)
  return inProxy !== null
}

/* muted(sound): the video the window finds, with sound=<sound> on the address. */
function muted(sound: string): boolean {
  const p = page({ search: `?usr=you&${SPEC.SOUND_PARAM}=${sound}` })
  const v = video()
  p.addVideo(v)
  expect(v.playsInline).toBe(SPEC.PLAYS_INLINE)
  expect(v.attrs).toHaveProperty('playsinline')
  expect('muted' in v.attrs).toBe(v.muted)
  return v.muted
}

describe('browser-viewer-boot.t27 against the host', () => {
  it('the fast fallback comes well before the give-up', () => {
    expect(BOOT_FAST_WATCH_MS).toBe(SPEC.BOOT_FAST_WATCH_MS)
    expect(BOOT_GIVE_UP_MS).toBe(SPEC.BOOT_GIVE_UP_MS)
    expect(SPEC.BOOT_FAST_WATCH_MS).toBeLessThan(SPEC.BOOT_GIVE_UP_MS)
    expect(SPEC.BOOT_FAST_WATCH_MS * 5).toBeLessThanOrEqual(
      SPEC.BOOT_GIVE_UP_MS
    )
  })

  it('frames and no video go to frames mode at the fast clock', () => {
    expect(modeAt(SPEC.BOOT_FAST_WATCH_MS - 1, true, false, false)).toBe(
      SPEC.MODE_LOADER
    )
    expect(modeAt(SPEC.BOOT_FAST_WATCH_MS, true, false, false)).toBe(
      SPEC.MODE_FRAMES
    )
    expect(modeAt(SPEC.BOOT_GIVE_UP_MS, true, false, false)).toBe(
      SPEC.MODE_FRAMES
    )
  })

  it('no frames keep the loader until the give-up, then it leaves', () => {
    expect(modeAt(SPEC.BOOT_FAST_WATCH_MS, false, false, false)).toBe(
      SPEC.MODE_LOADER
    )
    expect(modeAt(SPEC.BOOT_GIVE_UP_MS - 1, false, false, false)).toBe(
      SPEC.MODE_LOADER
    )
    expect(modeAt(SPEC.BOOT_GIVE_UP_MS, false, false, false)).toBe(
      SPEC.MODE_DONE
    )
  })

  it('a playing video ends the loader at any time', () => {
    expect(modeAt(0, false, true, false)).toBe(SPEC.MODE_DONE)
    expect(modeAt(SPEC.BOOT_FAST_WATCH_MS, true, true, true)).toBe(
      SPEC.MODE_DONE
    )
  })

  it('a reload after frames mode shows the pictures on the first frame', () => {
    expect(SPEC.FRAMES_MODE_PER_SESSION).toBe(true)
    expect(modeAt(0, true, false, true)).toBe(SPEC.MODE_FRAMES)
    expect(modeAt(0, false, false, true)).toBe(SPEC.MODE_LOADER)
    expect(rememberedAfter(false, true, false)).toBe(true)
    expect(rememberedAfter(true, false, false)).toBe(true)
    expect(rememberedAfter(false, false, false)).toBe(false)
  })

  it('a video that plays clears the frames-mode memory', () => {
    expect(SPEC.FRAMES_MODE_CLEARED_ON_PLAY).toBe(true)
    expect(rememberedAfter(true, false, true)).toBe(false)
    expect(rememberedAfter(true, true, true)).toBe(false)
  })

  it('a language outside ru and en is ignored', () => {
    expect(langKept(SPEC.LANG_RU)).toBe(true)
    expect(langKept(SPEC.LANG_EN)).toBe(true)
    expect(langKept('de')).toBe(false)
    expect(langKept('')).toBe(false)
    expect(langKept('RU')).toBe(false)
  })

  it('the video plays inline and muted unless sound=1', () => {
    expect(muted('')).toBe(true)
    expect(muted('0')).toBe(true)
    expect(muted(SPEC.SOUND_ON)).toBe(false)
  })
})
