/**
 * THE OVAL MEDALLION: THE THREE RULES THAT DECIDE WHAT IS IN IT AND WHETHER IT
 * MAKES A SOUND.
 *
 * All three are exported from the composition with a comment saying "exported
 * so a test can pin this", and until this file none of them had one. That is
 * the exact shape of the defect they exist to prevent: a rule that is only
 * written down is a rule that changes when someone reformats the JSX, and a
 * Remotion render of 900 frames reports success whatever the medallion does.
 *
 * WHY PURE FUNCTIONS RATHER THAN A RENDER. Rendering the composition to judge
 * the audio would take a browser, a bundle and about eight minutes; these three
 * decisions are arithmetic and string matching, and the JSX now calls them
 * instead of restating them, so pinning the functions pins the behaviour.
 */
import { describe, it, expect } from 'vitest'
import {
  MEDALLION_VIDEO,
  medallionFrames,
  medallionVolume,
  TrinityBlogReelSchema,
} from './src/compositions/TrinityBlogReel'
import { VIDEO_EXT } from './src/talking-portrait'

describe('what counts as a video in the oval', () => {
  it('a provider link with a query string is still a video', () => {
    // The old test was `$`-anchored. A Kie result URL ends in `?token=...`, so
    // it failed, fell through to the <Img> branch and drew an empty oval while
    // every log line said success.
    expect(MEDALLION_VIDEO.test('https://kie.invalid/a.mp4?token=abc')).toBe(
      true
    )
    expect(MEDALLION_VIDEO.test('https://s3.invalid/a.mov#t=1')).toBe(true)
    expect(MEDALLION_VIDEO.test('https://s3.invalid/a.mp4')).toBe(true)
  })

  it('a still is not a video, and a URL with no extension is not either', () => {
    expect(MEDALLION_VIDEO.test('https://s3.invalid/poster.png')).toBe(false)
    expect(MEDALLION_VIDEO.test('https://s3.invalid/a')).toBe(false)
  })

  it('the factory and the renderer agree on the same test', () => {
    // talking-portrait.ts refuses a mirrored URL the medallion could not play.
    // If these two drifted apart, the module would accept a URL the component
    // then draws as an empty oval -- with the credits already spent.
    expect(VIDEO_EXT.source).toBe(MEDALLION_VIDEO.source)
    expect(VIDEO_EXT.flags).toBe(MEDALLION_VIDEO.flags)
  })
})

describe('how long the medallion stays on screen', () => {
  // The window is the free slice of the 900-frame composition: acts[2].len 270
  // + acts[3].len 198 = 468 frames = 15.6 s at 30 fps.
  const WINDOW = 468

  it('an unmeasured clip gets the whole window, as it always did', () => {
    expect(medallionFrames(undefined, WINDOW, 30)).toBe(WINDOW)
  })

  it('a 6-second talking portrait leaves after 6 seconds, not after 15.6', () => {
    // Freezing a decorative b-roll on its last frame is ugly. Freezing a
    // talking mouth mid-sentence for 9.6 s is broken.
    expect(medallionFrames(6, WINDOW, 30)).toBe(180)
  })

  it('a clip longer than the window is clamped, never run under the colophon', () => {
    expect(medallionFrames(30, WINDOW, 30)).toBe(WINDOW)
  })

  it('nonsense lengths fall back to the window rather than to zero frames', () => {
    // A zero-frame Sequence renders nothing at all: the medallion would vanish
    // and the reel would still be 900 valid frames.
    for (const bad of [0, -3, NaN, Infinity]) {
      expect(medallionFrames(bad, WINDOW, 30)).toBe(WINDOW)
    }
  })
})

describe('whether the medallion is allowed to make a sound', () => {
  const CLIP = 'https://s3.invalid/talk.mp4'

  it('silent by default: every reel published so far wanted that', () => {
    expect(medallionVolume({ avatarVideo: CLIP })).toBe(0)
  })

  it('a talking portrait asks for volume and gets it', () => {
    // `muted` was hardcoded on the video element, so a face animated to a voice
    // track rendered mouthing words in silence and logged success.
    expect(medallionVolume({ avatarVideo: CLIP, avatarVideoVolume: 1 })).toBe(1)
  })

  it('a still poster is never given a volume to argue about', () => {
    expect(medallionVolume({ avatarVideoVolume: 1 })).toBe(0)
  })

  it('a reel that already has a voice-over does not play the words twice', () => {
    // The owner's reel plan gives the face segment the CORRESPONDING SLICE of
    // the one voice-over track. Set both and the same sentence plays from the
    // full-length <Audio> and from the medallion at once -- and Remotion
    // renders that as a success.
    expect(
      medallionVolume({
        avatarVideo: CLIP,
        avatarVideoVolume: 1,
        voiceover: 'https://s3.invalid/vo.mp3',
      })
    ).toBe(0)
  })
})

describe('the props the factory sends survive the schema', () => {
  it('posterUrl, the volume and the length are all declared', () => {
    // Zod strips what it does not know, silently. posterUrl was published into
    // template_settings for weeks and rendered nowhere for exactly this reason.
    const parsed = TrinityBlogReelSchema.parse({
      title: 't',
      subtitle: 's',
      dateline: 'd',
      tags: ['t27'],
      plates: [{ label: 'a', value: '1' }],
      lesson: 'l',
      url: 't27.ai',
      year: '2026',
      posterUrl: 'https://s3.invalid/poster.png',
      avatarVideo: 'https://s3.invalid/talk.mp4',
      avatarVideoVolume: 1,
      avatarVideoSeconds: 6,
    })
    expect(parsed.posterUrl).toBe('https://s3.invalid/poster.png')
    expect(parsed.avatarVideoVolume).toBe(1)
    expect(parsed.avatarVideoSeconds).toBe(6)
  })
})
