import * as scenes from '@/scenes'

describe('scenes index', () => {
  it('exports scene modules', () => {
    expect(typeof scenes).toBe('object')
    // Check a couple of scene exports
    expect(scenes).toHaveProperty('avatarBrainWizard')
    expect(typeof scenes.avatarBrainWizard).toBe('object')
    expect(scenes).toHaveProperty('menuScene')
    expect(typeof scenes.menuScene).toBe('object')
  })
})
