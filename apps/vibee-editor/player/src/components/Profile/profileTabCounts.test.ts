import { describe, expect, it } from 'vitest'
import { profileTabCount } from './profileTabCounts'

describe('profileTabCount', () => {
  const profile = {
    templates_count: 40,
    followers_count: 0,
    following_count: 0,
    plan_count: 1,
    files_count: 131,
    skills_count: 3,
  }

  it('shows exact private resource counts returned for the owner', () => {
    expect(profileTabCount(profile, 'plan')).toBe(1)
    expect(profileTabCount(profile, 'files')).toBe(131)
    expect(profileTabCount(profile, 'skills')).toBe(3)
  })

  it('does not turn an unknown count into a misleading zero', () => {
    expect(profileTabCount({}, 'skills')).toBeNull()
    expect(profileTabCount(profile, 'blog')).toBeNull()
  })
})
