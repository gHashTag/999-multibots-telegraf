import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as SPEC from './split-reel.gen'
import {
  framesForSeconds,
  splitReelProps,
  splitSegments,
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
