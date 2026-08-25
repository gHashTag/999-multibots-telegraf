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

  it('preserves an explicit same-render-origin media URL', () => {
    expect(
      resolveServerTemplateMediaUrl(
        'https://render.example.invalid/media/images/relaunch/sample.mp4',
        renderOrigin
      )
    ).toBe('https://render.example.invalid/media/images/relaunch/sample.mp4')
  })

  it.each([
    'http://external.example.invalid/media/images/relaunch/sample.mp4',
    'https://external.example.invalid/media/images/relaunch/sample.mp4',
    'https://render.example.invalid:444/media/images/relaunch/sample.mp4',
    'https://user:password@render.example.invalid/media/images/relaunch/sample.mp4',
    'https://project.supabase.invalid/storage/v1/object/public/images/sample.mp4',
    'https://render.example.invalid/templates/sample.mp4',
  ])('rejects media outside the exact render /media boundary: %s', value => {
    expect(resolveServerTemplateMediaUrl(value, renderOrigin)).toBeUndefined()
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,active',
    '//other.invalid/file',
  ])('rejects an active or scheme-relative value: %s', value => {
    expect(resolveServerTemplateMediaUrl(value, renderOrigin)).toBeUndefined()
  })
})
