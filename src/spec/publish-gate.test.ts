// Binding test for the publish gate spec (corpus id port/reels/publish-gate).
// Order: owner GO "Spec and implement publish contour V2" (2026-11-27).
// Every `it` title below is copied verbatim from a `test` in
// publish-gate.t27; the vectors mirror the spec asserts one for one, so a
// spec/body contradiction cannot hide (the confirm-gate lesson).
import { describe, expect, it } from 'vitest'
import * as SPEC from './publish-gate.gen'
import * as LOGIC from './publish-gate.logic'

describe('spec publish-gate.t27', () => {
  it('an absent GO flag collapses to false', () => {
    expect(LOGIC.goFlag(false, true)).toBe(false)
    expect(LOGIC.goFlag(false, false)).toBe(false)
    expect(LOGIC.goFlag(true, true)).toBe(true)
    expect(LOGIC.goFlag(true, false)).toBe(false)
  })

  it('armed needs both the owner GO and the provider key', () => {
    expect(LOGIC.armed(true, true, false)).toBe(false)
    expect(LOGIC.armed(true, false, true)).toBe(false)
    expect(LOGIC.armed(false, true, true)).toBe(false)
    expect(LOGIC.armed(true, true, true)).toBe(true)
  })

  it('a render counts as ready only when found and actually executed', () => {
    expect(LOGIC.renderReady(false, true)).toBe(false)
    expect(LOGIC.renderReady(true, false)).toBe(false)
    expect(LOGIC.renderReady(false, false)).toBe(false)
    expect(LOGIC.renderReady(true, true)).toBe(true)
  })

  it('publish happens in exactly one vector and every missing piece blocks it', () => {
    expect(LOGIC.canPublish(true, true, true, true, true, true, true)).toBe(
      true
    )
    expect(LOGIC.canPublish(false, true, true, true, true, true, true)).toBe(
      false
    )
    expect(LOGIC.canPublish(true, false, true, true, true, true, true)).toBe(
      false
    )
    expect(LOGIC.canPublish(true, true, false, true, true, true, true)).toBe(
      false
    )
    expect(LOGIC.canPublish(true, true, true, false, true, true, true)).toBe(
      false
    )
    expect(LOGIC.canPublish(true, true, true, true, false, true, true)).toBe(
      false
    )
    expect(LOGIC.canPublish(true, true, true, true, true, false, true)).toBe(
      false
    )
    expect(LOGIC.canPublish(true, true, true, true, true, true, false)).toBe(
      false
    )
    expect(
      LOGIC.canPublish(false, false, false, false, false, false, false)
    ).toBe(false)
  })

  it('blocked_stage names the first missing piece, owner GO first', () => {
    expect(LOGIC.blockedStage(true, true, true, true, true, true, true)).toBe(
      SPEC.STAGE_PUBLISHABLE
    )
    expect(
      LOGIC.blockedStage(false, false, false, false, false, false, false)
    ).toBe(SPEC.STAGE_OWNER_GO_REQUIRED)
    expect(LOGIC.blockedStage(false, true, true, true, true, true, true)).toBe(
      SPEC.STAGE_OWNER_GO_REQUIRED
    )
    expect(LOGIC.blockedStage(true, true, false, true, true, true, true)).toBe(
      SPEC.STAGE_PROVIDER_KEY_MISSING
    )
    expect(LOGIC.blockedStage(true, true, true, false, true, true, true)).toBe(
      SPEC.STAGE_RENDER_NOT_EXECUTED
    )
    expect(LOGIC.blockedStage(true, true, true, true, false, true, true)).toBe(
      SPEC.STAGE_RENDER_NOT_EXECUTED
    )
    expect(LOGIC.blockedStage(true, true, true, true, true, false, true)).toBe(
      SPEC.STAGE_CONFIRM_MISSING
    )
    expect(LOGIC.blockedStage(true, true, true, true, true, true, false)).toBe(
      SPEC.STAGE_CONFIRM_MISSING
    )
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })

  it('vendored consts match the corpus frame', () => {
    expect(SPEC.KIND).toBe('reels')
    expect(SPEC.ID).toBe('publish-gate')
    expect(SPEC.REPO).toBe('999-multibots-telegraf')
    expect(SPEC.GO_DEFAULT).toBe(false)
    expect(SPEC.STAGE_PUBLISHABLE).toBe(0)
    expect(SPEC.STAGE_OWNER_GO_REQUIRED).toBe(1)
    expect(SPEC.STAGE_PROVIDER_KEY_MISSING).toBe(2)
    expect(SPEC.STAGE_RENDER_NOT_EXECUTED).toBe(3)
    expect(SPEC.STAGE_CONFIRM_MISSING).toBe(4)
    expect(LOGIC.__NOT_LOWERED__).toEqual([])
  })
})
