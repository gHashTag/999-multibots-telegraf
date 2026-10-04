/**
 * The call at the end of a split reel is DRAWN in the colour the planner
 * decided (split-reel v10) -- not in a gold the composition keeps for itself.
 *
 * The plan and the tool are bound to the spec in src/spec/split-reel.test.ts;
 * this file closes the last step of the road: the props reach the pixels.
 * The composition is rendered to markup on the frame of the pause, where only
 * the held frame and the call are on screen, and the call's style is read.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// The pause: the voice ends at frame 270, the call is on from there.
const FRAME = vi.hoisted(() => 300)

vi.mock('remotion', async importOriginal => {
  const real: any = await importOriginal()
  const through = ({ children }: { children?: unknown }) => children ?? null
  return {
    ...real,
    useCurrentFrame: () => FRAME,
    useVideoConfig: () => ({
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 400,
    }),
    Sequence: through,
    Freeze: through,
    OffthreadVideo: () => null,
    Video: () => null,
    Audio: () => null,
  }
})
vi.mock('@remotion/google-fonts/Outfit', () => ({
  loadFont: () => ({ fontFamily: 'Outfit' }),
}))
vi.mock('@remotion/google-fonts/Jost', () => ({
  loadFont: () => ({ fontFamily: 'Jost' }),
}))

import { SplitTalkingHead } from './SplitTalkingHead'
import { CallToAction } from './StoryReel'
import { splitReelProps } from '../split-reel-plan'
import * as SPEC from '../spec/split-reel.gen'

const NEUTRAL = 'Write to me'

/** The pause frame of a reel planned with these inputs, as markup. */
function pauseOf(input: Partial<Parameters<typeof splitReelProps>[0]>) {
  const props = splitReelProps({
    lipSyncVideo: 'https://ours/clip.mp4',
    seconds: 9,
    call: { house: false, neutral: NEUTRAL },
    ...input,
  } as Parameters<typeof splitReelProps>[0])
  return renderToStaticMarkup(
    React.createElement(SplitTalkingHead as any, { ...props, lipFrames: 270 })
  )
}

/** Every colour the markup draws, lower case. */
const colours = (html: string) =>
  [...html.matchAll(/(?:^|[;"\s])color:\s*(#[0-9a-fA-F]{3,8})/g)].map(m =>
    m[1].toLowerCase()
  )

describe('the call is drawn in its colour', () => {
  it('draws the colour it is given', () => {
    const html = renderToStaticMarkup(
      React.createElement(CallToAction, { text: NEUTRAL, color: '#e8a0bf' })
    )
    expect(html).toContain(NEUTRAL)
    expect(colours(html)).toEqual(['#e8a0bf'])
  })

  it('a client reel ends in the colour the planner decided for her', () => {
    const html = pauseOf({ callColour: '#e8a0bf' })
    expect(html).toContain(NEUTRAL)
    expect(colours(html)).toContain('#e8a0bf')
    expect(colours(html)).not.toContain(SPEC.HOUSE_CALL_COLOR.toLowerCase())
  })

  it('a client reel with no colour of hers ends neutral, never in the gold', () => {
    const html = pauseOf({})
    expect(html).toContain(NEUTRAL)
    expect(colours(html)).toContain(SPEC.NEUTRAL_CALL_COLOR.toLowerCase())
    expect(colours(html)).not.toContain(SPEC.HOUSE_CALL_COLOR.toLowerCase())
  })

  it("the house's own reel ends in its gold", () => {
    const html = pauseOf({ call: { house: true, neutral: NEUTRAL } })
    expect(colours(html)).toContain(SPEC.HOUSE_CALL_COLOR.toLowerCase())
  })

  it('props with no call colour at all draw neutral, not the gold', () => {
    const props = splitReelProps({
      lipSyncVideo: 'https://ours/clip.mp4',
      seconds: 9,
      call: { house: false, neutral: NEUTRAL },
    })
    const { ctaColor: _dropped, ...older } = props as Record<string, unknown>
    const html = renderToStaticMarkup(
      React.createElement(SplitTalkingHead as any, { ...older, lipFrames: 270 })
    )
    expect(html).toContain(NEUTRAL)
    expect(colours(html)).toContain(SPEC.NEUTRAL_CALL_COLOR.toLowerCase())
    expect(colours(html)).not.toContain(SPEC.HOUSE_CALL_COLOR.toLowerCase())
  })
})
