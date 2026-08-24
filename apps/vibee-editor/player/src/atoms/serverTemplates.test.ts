import { describe, expect, it } from 'vitest'
import { resolveServerTemplateMediaUrl } from './serverTemplates'

describe('server template media origin', () => {
  const renderOrigin = 'https://render.example.invalid'
  const playerOrigin = 'https://player.example.invalid'

  it('resolves a render-relative media path against render, not player', () => {
    const resolved = resolveServerTemplateMediaUrl(
      '/media/images/relaunch/noir-close.jpg',
      renderOrigin
    )

    expect(resolved).toBe(
      'https://render.example.invalid/media/images/relaunch/noir-close.jpg'
    )
    expect(resolved).not.toContain(playerOrigin)
  })

  it('preserves an explicit HTTPS media origin', () => {
    expect(
      resolveServerTemplateMediaUrl(
        'https://cdn.example.invalid/templates/sample.mp4',
        renderOrigin
      )
    ).toBe('https://cdn.example.invalid/templates/sample.mp4')
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,active',
    '//other.invalid/file',
  ])('rejects an active or scheme-relative value: %s', value => {
    expect(resolveServerTemplateMediaUrl(value, renderOrigin)).toBeUndefined()
  })
})
