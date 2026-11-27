// Spec reels-brief.t27 binding test (owner order REELS_MCP_V1, 2026-11-26).
// Runs every vector of the vendored spec against its compiled logic (wasm).
import { describe, expect, it } from 'vitest'
import * as SPEC from './reels-brief.gen'
import * as LOGIC from './reels-brief.logic'

describe('spec reels-brief.t27', () => {
  it('a brief keeps its seconds inside the working window', () => {
    expect(LOGIC.secondsOk(5)).toBe(true)
    expect(LOGIC.secondsOk(60)).toBe(true)
    expect(LOGIC.secondsOk(4)).toBe(false)
    expect(LOGIC.secondsOk(61)).toBe(false)
    expect(SPEC.SECONDS_MIN).toBe(5)
    expect(SPEC.SECONDS_MAX).toBe(60)
  })

  it('scene count grows with seconds and stays between two and six', () => {
    expect(LOGIC.sceneCount(5)).toBe(2)
    expect(LOGIC.sceneCount(10)).toBe(2)
    expect(LOGIC.sceneCount(15)).toBe(3)
    expect(LOGIC.sceneCount(30)).toBe(6)
    expect(LOGIC.sceneCount(31)).toBe(6)
    expect(LOGIC.sceneCount(60)).toBe(6)
    expect(SPEC.SECONDS_PER_SCENE).toBe(5)
    expect(SPEC.SCENE_MIN).toBe(2)
    expect(SPEC.SCENE_MAX).toBe(6)
  })

  it('per-scene duration divides the reel and a zero-scene brief fails closed', () => {
    expect(LOGIC.perSceneMs(15, 3)).toBe(5000)
    expect(LOGIC.perSceneMs(10, 2)).toBe(5000)
    expect(LOGIC.perSceneMs(60, 6)).toBe(10000)
    expect(LOGIC.perSceneMs(15, 0)).toBe(0)
    expect(SPEC.MS_PER_SECOND).toBe(1000)
  })

  it('a rendered reel never outlives the window', () => {
    expect(LOGIC.durationOk(15000)).toBe(true)
    expect(LOGIC.durationOk(60000)).toBe(true)
    expect(LOGIC.durationOk(60001)).toBe(false)
    expect(LOGIC.durationOk(0)).toBe(false)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
