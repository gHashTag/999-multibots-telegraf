import { describe, expect, it } from 'vitest'
import { assembleArgs, parseLeadingSilenceMs, planReel } from './src/reel-plan'

function plan() {
  return planReel({
    voiceMs: 1800,
    faceCuts: [{ startMs: 0, durationMs: 1800 }],
    stillCount: 0,
  })
}

describe('face clip quality and sync', () => {
  it('reads only initial silence from ffmpeg diagnostics', () => {
    expect(
      parseLeadingSilenceMs(`
[silencedetect] silence_start: 0
[silencedetect] silence_end: 0.313229 | silence_duration: 0.313229
[silencedetect] silence_start: 0.691583
[silencedetect] silence_end: 0.754188 | silence_duration: 0.0626042
`)
    ).toBe(313)
    expect(parseLeadingSilenceMs('[silencedetect] silence_start: 0.5')).toBe(0)
  })

  it('delays a provider clip that trimmed the voice pre-roll', () => {
    const built = assembleArgs(plan(), {
      faceFiles: ['/tmp/face.mp4'],
      faceVisualDelayMs: [113],
      stillFiles: [],
      voiceFile: '/tmp/voice.wav',
      outFile: '/tmp/reel.mp4',
    })
    const filters = built.args[built.args.indexOf('-filter_complex') + 1]
    expect(filters).toContain('tpad=start_mode=clone:start_duration=0.113')
    expect(filters).toContain('minterpolate=fps=30')
    expect(filters).toContain('trim=end=1.800')
  })

  it('raises final encoding quality without changing the master audio contract', () => {
    const built = assembleArgs(plan(), {
      faceFiles: ['/tmp/face.mp4'],
      stillFiles: [],
      voiceFile: '/tmp/voice.wav',
      outFile: '/tmp/reel.mp4',
    })
    expect(built.args.slice(built.args.indexOf('-preset'), -1)).toEqual(
      expect.arrayContaining(['-preset', 'slow', '-crf', '18'])
    )
    expect(built.args).toContain('1:a')
    expect(built.args).toContain('+faststart')
  })
})
