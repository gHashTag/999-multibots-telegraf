/**
 * THE 900-FRAME FREEZE-FRAME, AND THE TWO HALVES OF WHY IT HAPPENED.
 *
 * Feed id 20 is a 3.20-second clip published as a 30.06-second reel -- exactly
 * 900 frames at 30 fps -- of one frozen frame. Two independent defects had to
 * meet for that:
 *
 *   1. /render/template read `request.lipSyncVideo` from the TOP LEVEL of the
 *      body, while reel_render sends only `{compositionId, props}`. So the
 *      duration measurement, the face crop and the default segment were dead
 *      code for every render the agent has ever started.
 *   2. `composition.durationInFrames = durationInFrames` ran unconditionally
 *      with the unchanged default of 900, throwing away the number
 *      calculateMetadata had just computed from the video's real metadata.
 *
 * The pure half is tested behaviourally below. The wiring half cannot be:
 * render-server.ts is 7600 lines with no export and a live HTTP server at
 * module scope, so the last two tests assert the CALL SITES statically -- the
 * same technique as no-silent-revert.test.ts. They are the reason a revert of
 * either half goes red instead of going silent for another three months.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  templateDurationInFrames,
  lipSyncVideoOf,
  DEFAULT_FPS,
} from './src/render-duration'

const SERVER = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

describe('an override is only legitimate when something was measured', () => {
  it('turns measured seconds into frames, rounding up', () => {
    expect(templateDurationInFrames({ measuredSeconds: 25.92 })).toBe(778)
    expect(templateDurationInFrames({ measuredSeconds: 3.2 })).toBe(96)
  })

  it('returns null -- not 900, not 0 -- when nothing was measured', () => {
    // null is the instruction "leave calculateMetadata's answer alone".
    // Returning a number here is precisely the bug: a constant length wins
    // over a measurement made from the video itself.
    expect(templateDurationInFrames({ measuredSeconds: null })).toBeNull()
    expect(templateDurationInFrames({})).toBeNull()
    expect(templateDurationInFrames({ measuredSeconds: 0 })).toBeNull()
    expect(templateDurationInFrames({ measuredSeconds: NaN })).toBeNull()
    expect(templateDurationInFrames({ measuredSeconds: -4 })).toBeNull()
  })

  it('honours a non-default fps and falls back to 30', () => {
    expect(templateDurationInFrames({ measuredSeconds: 2, fps: 60 })).toBe(120)
    expect(templateDurationInFrames({ measuredSeconds: 2, fps: 0 })).toBe(
      2 * DEFAULT_FPS
    )
  })
})

describe('the clip is found wherever the caller put it', () => {
  it('reads it out of props -- the only place the agent ever puts it', () => {
    expect(lipSyncVideoOf({ props: { lipSyncVideo: 'https://h/a.mp4' } })).toBe(
      'https://h/a.mp4'
    )
  })

  it('prefers the top level when both are present', () => {
    expect(
      lipSyncVideoOf({
        lipSyncVideo: 'https://h/top.mp4',
        props: { lipSyncVideo: 'https://h/props.mp4' },
      })
    ).toBe('https://h/top.mp4')
  })

  it('is undefined when there is no clip, and does not throw on no props', () => {
    expect(lipSyncVideoOf({})).toBeUndefined()
    expect(lipSyncVideoOf({ props: {} })).toBeUndefined()
    expect(lipSyncVideoOf({ props: { lipSyncVideo: '' } })).toBeUndefined()
    expect(lipSyncVideoOf({ lipSyncVideo: 42 as unknown })).toBeUndefined()
  })
})

describe('the template render actually uses both halves', () => {
  it('no hardcoded 900-frame default is left in the template handler', () => {
    // The literal itself is the defect: it was the value that reached the
    // composition on every agent render.
    expect(SERVER).not.toContain('let durationInFrames = 900')
    expect(SERVER).toContain('let measuredDurationInFrames: number | null')
  })

  it('the clip is read through lipSyncVideoOf, not off the body alone', () => {
    expect(SERVER).toContain('lipSyncVideoOf(request)')
    expect(SERVER).not.toContain('let lipSyncVideoPath = request.lipSyncVideo')
  })

  it('the override is guarded by the measurement', () => {
    const at = SERVER.indexOf(
      'composition as any).durationInFrames = measuredDurationInFrames'
    )
    expect(at).toBeGreaterThan(-1)
    // The guard must sit BEFORE the assignment, in the same branch. Position,
    // not presence: an `if` written after the write guards nothing.
    const guard = SERVER.lastIndexOf('if (measuredDurationInFrames)', at)
    expect(guard).toBeGreaterThan(-1)
    expect(at - guard).toBeLessThan(400)
  })
})
