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
      { from: 0, frames: 96 },
      { from: 96, frames: 123 },
      { from: 219, frames: 111 },
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
