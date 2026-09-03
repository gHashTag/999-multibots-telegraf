import { afterEach, describe, expect, it } from 'vitest'
import { SAFE_BETA_AGENT_POLICY, decideAgentToolAccess } from '../agent-policy'

describe('SAFE BETA agent policy', () => {
  afterEach(() => {
    delete process.env.AGENT_SAFE_BETA
    delete process.env.AGENT_PAID_QUOTA
  })

  it('is fail-closed by default and exposes exactly the reviewed subset', () => {
    expect(SAFE_BETA_AGENT_POLICY.enabled).toBe(true)
    expect(SAFE_BETA_AGENT_POLICY.exposedTools).toEqual([
      'whoami',
      'feed_stats',
      'content_plan_prepare',
    ])
    expect(SAFE_BETA_AGENT_POLICY.executableTools).toEqual(
      SAFE_BETA_AGENT_POLICY.exposedTools
    )
    expect(SAFE_BETA_AGENT_POLICY.allowedEffects).toEqual(['read', 'draft'])
    expect(SAFE_BETA_AGENT_POLICY.allowedScopes).toEqual(['owner'])
    expect(SAFE_BETA_AGENT_POLICY.approvalGroups).toEqual([])
    expect(SAFE_BETA_AGENT_POLICY.paidQuota).toBe(0)
  })

  it('allows only reviewed names carrying reviewed effects', () => {
    expect(
      decideAgentToolAccess({ name: 'whoami', effect: 'read', scope: 'owner' })
    ).toMatchObject({ allowed: true })
    expect(
      decideAgentToolAccess({
        name: 'content_plan_prepare',
        effect: 'draft',
        scope: 'owner',
      })
    ).toMatchObject({ allowed: true })

    expect(decideAgentToolAccess(null)).toMatchObject({
      allowed: false,
      code: 'unknown_tool',
    })
    expect(
      decideAgentToolAccess({
        name: 'feed_publish',
        effect: 'publish',
        scope: 'owner',
      })
    ).toMatchObject({ allowed: false })
    expect(
      decideAgentToolAccess({
        name: 'image_generate',
        effect: 'paid',
        scope: 'owner',
        paid: true,
      })
    ).toMatchObject({ allowed: false })
    expect(
      decideAgentToolAccess({
        name: 'whoami',
        effect: 'access',
        scope: 'owner',
      })
    ).toMatchObject({ allowed: false })
    expect(
      decideAgentToolAccess({ name: 'whoami', effect: 'read', scope: 'global' })
    ).toMatchObject({ allowed: false, code: 'scope_not_allowed' })
    expect(
      decideAgentToolAccess({
        name: 'whoami',
        effect: 'read',
        scope: 'owner',
        approvalGroup: 'owners',
      })
    ).toMatchObject({ allowed: false })
  })

  it('cannot be widened by environment or confirmation-like fields', () => {
    process.env.AGENT_SAFE_BETA = 'false'
    process.env.AGENT_PAID_QUOTA = '999'

    expect(
      decideAgentToolAccess({
        name: 'feed_publish',
        effect: 'publish',
        scope: 'owner',
        paid: false,
        approvalGroup: '',
        confirmed: true,
      })
    ).toMatchObject({ allowed: false })
  })
})
