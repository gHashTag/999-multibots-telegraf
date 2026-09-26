/**
 * THE OWNER'S MINI-STORY, ASSEMBLED BY REMOTION.
 *
 * 2026-09-26, the owner: "change the picture, not the same one -- a mini
 * story in one style, different settings by the topic; three pictures, three
 * scenes and the cuts, a call to action at the end and a pause to decide; at
 * most 15 seconds, for stories; it is done through Remotion, not scripts".
 *
 * Pinned here: a story with no scenes (or a scene with no clip) is refused at
 * the render's door, the cuts land where each clip ends, the pause follows the
 * last scene, and the agent is taught the recipe with the 15-second cap.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  STORY_MAX_SECONDS,
  StoryReelSchema,
  storyTimeline,
  sceneFramesOf,
  storyDurationFrames,
  sceneVolume,
  FADE_OUT_FRAMES,
} from './src/compositions/StoryReel'
import {
  CHECKED_COMPOSITIONS,
  templateSchemaProblem,
} from './src/template-check'

const CLIP = 'https://bucket.test/vibee-assets/assets/scene.mp4'

describe('StoryReel at the render door', () => {
  it('is on the checked list, so both render doors run its schema', () => {
    expect(Object.keys(CHECKED_COMPOSITIONS)).toContain('StoryReel')
  })

  it('refuses a story with no scenes, or a scene with no clip, naming the field', () => {
    expect(templateSchemaProblem('StoryReel', {})).toMatch(/scenes/)
    expect(templateSchemaProblem('StoryReel', { scenes: [] })).toMatch(/scenes/)
    expect(
      templateSchemaProblem('StoryReel', { scenes: [{ video: '' }] })
    ).toMatch(/scenes\.0\.video/)
  })

  it('takes three scenes, a call to action and a pause', () => {
    const props = {
      scenes: [{ video: CLIP }, { video: CLIP }, { video: CLIP }],
      pauseSec: 2,
      cta: 'Открой @t27ai_bot', // cyrillic-ok: the owner's call to action
    }
    expect(templateSchemaProblem('StoryReel', props)).toBeNull()
    expect(StoryReelSchema.parse(props).pauseSec).toBe(2)
  })

  it('keeps the pause within 0..3 s', () => {
    expect(
      StoryReelSchema.safeParse({ scenes: [{ video: CLIP }], pauseSec: 5 })
        .success
    ).toBe(false)
  })
})

describe('the cuts', () => {
  it('land where each measured clip ends, back to back', () => {
    // Three lines of 3.2, 4.1 and 3.7 s at 30 fps, then a 2 s pause.
    const t = storyTimeline(3, [96, 123, 111], 96 + 123 + 111 + 60, 60)
    expect(t).toEqual([
      { from: 0, frames: 96, breath: 0 },
      { from: 96, frames: 123, breath: 0 },
      { from: 219, frames: 111, breath: 0 },
    ])
    // The pause starts where the last line ends.
    expect(t[2].from + t[2].frames).toBe(330)
  })

  it('without measurements, splits what is left after the pause evenly', () => {
    const t = storyTimeline(3, [], 450, 60)
    expect(t.map(x => x.frames)).toEqual([130, 130, 130])
    expect(t[1].from).toBe(130)
  })
})

/*
 * "THE VOICE IS CUT OFF UNEVENLY" (the owner, 2026-09-26). Three causes, one
 * fix each: a length rounded DOWN clipped the last sound of a line; a hard cut
 * through a waveform clicks; and one line ran straight into the next.
 */
describe('the voice is never cut mid-word', () => {
  it('a clip length is rounded UP, never down', () => {
    // 5.21 s at 30 fps is 156.3 frames: round() gave 156 and cut the tail.
    expect(sceneFramesOf(5.21, 30)).toBe(157)
    expect(sceneFramesOf(1.7, 30)).toBe(51)
    // Float noise does not add a frame: 3.4 s is exactly 102.
    expect(sceneFramesOf(3.4, 30)).toBe(102)
  })

  it('a breath sits between lines, not after the last (the pause is there)', () => {
    const t = storyTimeline(3, [157, 102, 51], 157 + 102 + 51 + 16 + 60, 60, 8)
    expect(t.map(x => x.breath)).toEqual([8, 8, 0])
    expect(t[1].from).toBe(157 + 8)
    expect(t[2].from).toBe(157 + 8 + 102 + 8)
    expect(storyDurationFrames([157, 102, 51], 60, 8)).toBe(
      157 + 102 + 51 + 16 + 60
    )
  })

  it('the three lines, the breaths and the pause stay within the stories cap', () => {
    const frames = [5.2, 3.4, 1.7].map(s => sceneFramesOf(s, 30))
    expect(storyDurationFrames(frames, 60, 8) / 30).toBeLessThanOrEqual(
      STORY_MAX_SECONDS
    )
  })

  it('each line fades at its ends, so a cut does not click', () => {
    expect(sceneVolume(0, 102)).toBe(0)
    expect(sceneVolume(1, 102)).toBe(1)
    expect(sceneVolume(50, 102)).toBe(1)
    expect(sceneVolume(102 - FADE_OUT_FRAMES, 102)).toBe(1)
    expect(sceneVolume(102, 102)).toBe(0)
    // A clip too short to fade is left alone.
    expect(sceneVolume(0, 5)).toBe(1)
  })

  it('the breath defaults to a quarter second and is capped at one', () => {
    expect(StoryReelSchema.parse({ scenes: [{ video: CLIP }] }).breathSec).toBe(
      0.25
    )
    expect(
      StoryReelSchema.safeParse({ scenes: [{ video: CLIP }], breathSec: 2 })
        .success
    ).toBe(false)
  })
})

describe('the recipe the agent is taught', () => {
  const chat = fs.readFileSync(
    path.join(__dirname, 'src/agent/chat.ts'),
    'utf8'
  )
  it('names StoryReel, three scenes and the 15-second cap', () => {
    expect(chat).toMatch(/reel_render StoryReel/)
    expect(chat).toMatch(/3 сцены/) // cyrillic-ok: the prompt copy
    expect(chat).toContain(`${STORY_MAX_SECONDS} с`)
  })

  it('is registered in the one graph the render server bundles', () => {
    const root = fs.readFileSync(path.join(__dirname, 'src/Root.tsx'), 'utf8')
    expect(root).toMatch(/id="StoryReel"/)
    // A scene that cannot be measured stops the render, never a guessed length.
    expect(root).toMatch(/StoryReel: scene \$\{i \+ 1\} could not be measured/)
  })
})
