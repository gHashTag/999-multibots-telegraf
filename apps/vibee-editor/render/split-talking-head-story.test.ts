import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { filmGrainFrame, segmentsWithBRoll } from './src/storyboard-contract'

interface Segment {
  type: 'split' | 'fullscreen'
  startFrame: number
  durationFrames: number
  bRollUrl?: string
  bRollType?: 'video' | 'image'
}

const here = path.dirname(fileURLToPath(import.meta.url))
const renderSource = fs.readFileSync(
  path.join(here, 'src/compositions/SplitTalkingHead.tsx'),
  'utf8'
)
const playerSource = fs.readFileSync(
  path.resolve(here, '../player/src/compositions/SplitTalkingHead.tsx'),
  'utf8'
)

describe('SplitTalkingHead storyboard contract', () => {
  it('renders a supplied b-roll in both split and fullscreen scene types', () => {
    const segments: Segment[] = [
      {
        type: 'fullscreen',
        startFrame: 0,
        durationFrames: 30,
        bRollUrl: 'https://media.invalid/scene-1.mp4',
        bRollType: 'video',
      },
      {
        type: 'split',
        startFrame: 30,
        durationFrames: 30,
        bRollUrl: 'https://media.invalid/scene-2.mp4',
        bRollType: 'video',
      },
    ]

    expect(segmentsWithBRoll(segments)).toEqual(segments)
  })

  it('keeps one master voice spine independent from muted visual layers', () => {
    for (const source of [renderSource, playerSource]) {
      expect(source).toContain('MASTER VOICE SPINE')
      expect(source).toMatch(
        /<Audio[\s\S]*?src=\{resolveMediaPath\(lipSyncVideo\)\}[\s\S]*?volume=\{videoVolume\}/
      )
      expect(source.match(/volume=\{videoVolume\}/g)).toHaveLength(1)
      expect(
        source.match(/<(?:OffthreadVideo|Video)[\s\S]*?muted/g)?.length
      ).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps cinematic grain deterministic and below readable captions', () => {
    expect(filmGrainFrame(42)).toEqual(filmGrainFrame(42))
    expect(filmGrainFrame(42)).not.toEqual(filmGrainFrame(43))

    for (const source of [renderSource, playerSource]) {
      expect(source).toContain('FILM GRAIN OVERLAY')
      expect(source).toContain('filmGrainOpacity')
      expect(source).toContain("mixBlendMode: 'soft-light'")
      expect(source).toContain('zIndex: 52')
    }
  })
})
