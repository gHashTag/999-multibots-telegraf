import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as SPEC from './split-reel.gen'
import {
  captionStartMs,
  captionsFromWords,
  faceObjectPosition,
  firstSpeechMs,
  framesForSeconds,
  objectPosPct,
  splitReelProps,
  speechFrames,
  splitSegments,
  STUDIO_FACE,
} from '../split-reel-plan'
import {
  parseSceneCuts,
  parseShotVerdict,
  rhythmAgainstSpec,
  shotsFromCuts,
} from '../agent/reel-analyze'

/**
 * gHashTag/t27 specs/automation/split-reel.t27, vendored beside its
 * `t27c gen-ts` output. Each `test` block of the spec runs here against the
 * host planner (split-reel-plan.ts) and the analyser (agent/reel-analyze.ts).
 */
const segCount = (total: number) => splitSegments(total).length
const lastLen = (total: number) => splitSegments(total).at(-1)!.durationFrames

describe('split-reel.t27 against the host', () => {
  it('the vendored spec is the one the generated module came from', () => {
    const spec = readFileSync(join(__dirname, 'split-reel.t27'), 'utf8')
    expect(spec).toContain(`pub const VERSION : u8 = ${SPEC.VERSION};`)
  })

  it('the reel opens on the face, then split 120 and full 45 by turns', () => {
    expect(segCount(450)).toBe(6)
    expect(lastLen(450)).toBe(60)
    expect(segCount(225)).toBe(3)
    expect(lastLen(225)).toBe(45)
    const s = splitSegments(450)
    expect(s.map(x => x.type)).toEqual([
      'fullscreen',
      'split',
      'fullscreen',
      'split',
      'fullscreen',
      'split',
    ])
    expect(s[0].durationFrames).toBe(SPEC.OPEN_FULL_FRAMES)
    for (let i = 1; i < s.length; i++)
      expect(s[i].startFrame).toBe(
        s[i - 1].startFrame + s[i - 1].durationFrames
      )
  })

  it('a voice shorter than the opening is one shot of the face', () => {
    expect(segCount(50)).toBe(1)
    expect(lastLen(50)).toBe(50)
  })

  it('fifteen seconds is the ceiling and the words are one at a time in yellow', () => {
    expect(framesForSeconds(15)).toBe(450)
    expect(framesForSeconds(40)).toBe(450)
    const p = splitReelProps({ lipSyncVideo: 'https://x/l.mp4', seconds: 15 })
    expect(p.captionColor).toBe('#FFFF00')
    expect(SPEC.WORDS_PER_CAPTION).toBe(1)
    expect(SPEC.OWN_VOICE).toBe(true)
    expect(SPEC.CAPTIONS_FROM_FINAL_VOICE).toBe(true)
    expect(SPEC.CAPTION_DRIFT_MAX_MS).toBeLessThanOrEqual(150)
  })

  it("each caption is a word of the final voice, at that word's time", () => {
    const caps = captionsFromWords(
      [
        { word: ' Доброе', start: 0, end: 0.44 },
        { word: ' ', start: 0.44, end: 0.45 },
        { word: ' утро!', start: 0.44, end: 0.96 },
      ],
      68
    )
    expect(caps).toEqual([
      { text: 'Доброе', startMs: 68, endMs: 508, confidence: 1 },
      { text: 'утро!', startMs: 508, endMs: 1028, confidence: 1 },
    ])
  })

  it('a caption starts where the sound starts, not in the pause before it', () => {
    expect(captionStartMs(5720, 6300, 6380)).toBe(6300)
    expect(captionStartMs(1340, 1340, 1440)).toBe(1340)
    expect(captionStartMs(1000, 1500, 1400)).toBe(1000)
    expect(SPEC.ONSET_FRAME_MS).toBe(10)
    expect(SPEC.CAPTION_ON_SILENCE_MAX_MS).toBeLessThanOrEqual(
      SPEC.CAPTION_DRIFT_MAX_MS
    )
    // 8 kHz voice: 0.5 s loud, 0.5 s silence, 0.5 s loud.
    const rate = 8000
    const pcm = new Int16Array(rate * 1.5)
    for (let i = 0; i < pcm.length; i++)
      if (i < rate / 2 || i >= rate) pcm[i] = i % 2 ? 8000 : -8000
    const speech = speechFrames(pcm, rate)
    expect(speech.length).toBe(150)
    expect(firstSpeechMs(speech, 600, 1200)).toBe(1000)
    expect(firstSpeechMs(speech, 600, 900)).toBe(900)
    // Whisper gave the second word the pause; the caption waits for the sound.
    const caps = captionsFromWords(
      [
        { word: 'Доброе', start: 0, end: 0.5 },
        { word: 'и', start: 0.6, end: 1.2 },
      ],
      0,
      speech
    )
    expect(caps.map(c => c.startMs)).toEqual([0, 1000])
  })

  it('a tail shorter than a second joins the shot before it', () => {
    // A 13.35 s voice (2026-10-02) left an 11-frame split at the very end.
    expect(segCount(401)).toBe(5)
    expect(lastLen(401)).toBe(56)
    expect(segCount(190)).toBe(2)
    expect(lastLen(190)).toBe(130)
    expect(segCount(61)).toBe(1)
    expect(lastLen(61)).toBe(61)
    expect(splitSegments(401).at(-1)!.type).toBe('fullscreen')
  })

  it('in a split the face fills the lower half, not a circle', () => {
    // The first reel from this spec came out with SplitTalkingHead's default:
    // a 25% circle on black under the b-roll.
    const p = splitReelProps({ lipSyncVideo: 'https://x/l.mp4', seconds: 15 })
    expect(SPEC.FACE_FILLS_HALF).toBe(true)
    expect(p.splitIsCircle).toBe(false)
    expect(p.splitCircleSize).toBe(50)
  })

  it('the face is aimed at the middle of its window, never cut at the seam', () => {
    // Reel 2 (2026-10-02): the split showed the middle of the 9:16 lipsync and
    // the top of the head sat on the seam.
    expect(objectPosPct(760, 1920, 960, SPEC.FACE_CENTER_Y_PCT)).toBe(29)
    expect(objectPosPct(537, 1920, 960, SPEC.FACE_CENTER_Y_PCT)).toBe(5)
    expect(objectPosPct(300, 1920, 960, SPEC.FACE_CENTER_Y_PCT)).toBe(0)
    expect(objectPosPct(1900, 1920, 960, SPEC.FACE_CENTER_Y_PCT)).toBe(100)
    expect(objectPosPct(760, 1920, 1920, SPEC.FACE_CENTER_Y_PCT)).toBe(50)
    expect(objectPosPct(518, 1080, 1080, SPEC.FACE_CENTER_X_PCT)).toBe(50)
    expect(SPEC.FACE_CENTER_X_PCT).toBe(50)
    expect(SPEC.HEADROOM_MIN_PCT).toBeGreaterThan(0)
  })

  it('the planner tells the composition where the face is, per window', () => {
    const p = splitReelProps({ lipSyncVideo: 'https://x/l.mp4', seconds: 15 })
    // Unmeasured: the studio's own place, aimed up from the default 50%.
    expect(p.splitFacePosition).toBe('50% 6%')
    expect(p.fullscreenFacePosition).toBe('50% 50%')
    // A 720x1280 lipsync is the same frame at a different size.
    const small = {
      ...STUDIO_FACE,
      cx: 345.6,
      cy: 358.4,
      srcW: 720,
      srcH: 1280,
    }
    expect(faceObjectPosition(small, 1080, 960)).toBe('50% 6%')
    // A measured face low in the frame is aimed lower, never past the edge.
    const low = splitReelProps({
      lipSyncVideo: 'https://x/l.mp4',
      seconds: 15,
      face: { cx: 540, cy: 1700, srcW: 1080, srcH: 1920 },
    })
    expect(low.splitFacePosition).toBe('50% 100%')
  })

  it('b-roll goes to the split shots in turn, video or still by its name', () => {
    const s = splitSegments(450, ['https://x/a.mp4', 'https://x/b.jpg'])
    const splits = s.filter(x => x.type === 'split')
    expect(splits.map(x => x.bRollType)).toEqual(['video', 'image', 'video'])
    expect(s.filter(x => x.type === 'fullscreen').every(x => !x.bRollUrl)).toBe(
      true
    )
  })
})

describe('reel_analyze reads the reference reel back into the spec', () => {
  // The cuts measured on the owner's reference reel, 2026-10-02.
  const stderr = [1.9, 1.93, 5.9, 7.4, 11.4, 12.9, 14.7]
    .map(t => `[Parsed_showinfo_1] n:0 pts:1 pts_time:${t} duration:1`)
    .join('\n')

  it('one cut per change, a flicker after it is the same cut', () => {
    expect(parseSceneCuts(stderr)).toEqual([1.9, 5.9, 7.4, 11.4, 12.9, 14.7])
  })

  it('the reference reel has the spec rhythm', () => {
    const shots = shotsFromCuts(parseSceneCuts(stderr), 14.97, 30)
    expect(shots.map(s => s.durationFrames)).toEqual([
      57, 120, 45, 120, 45, 54, 8,
    ])
    const r = rhythmAgainstSpec(
      shots.slice(0, 6).map((s, i) => ({
        type: i % 2 ? 'split' : 'fullscreen',
        durationFrames: s.durationFrames,
      }))
    )
    expect(r.matches).toBe(true)
  })

  it('the vision answer becomes a layout', () => {
    expect(parseShotVerdict('SPLIT. Superman flying').type).toBe('split')
    expect(parseShotVerdict('Full: a man with headphones').shows).toBe(
      'a man with headphones'
    )
    expect(parseShotVerdict(null).type).toBe('unknown')
  })
})
