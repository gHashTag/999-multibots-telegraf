import { describe, expect, it } from 'vitest'

import { AI_PIPELINE_STAGES } from '@/lib/aiPipeline'
import { PRIMARY_NAV_ITEMS } from '@/lib/primaryNavigation'

describe('AI pipeline primary navigation', () => {
  it('keeps the editor inside AI and starts from the script', () => {
    expect(PRIMARY_NAV_ITEMS.map(tab => tab.id)).toEqual([
      'feed',
      'chat',
      'ai',
      'profile',
    ])

    expect(PRIMARY_NAV_ITEMS.find(tab => tab.id === 'ai')?.route).toBe(
      '/generate/script'
    )

    expect(AI_PIPELINE_STAGES.map(stage => stage.id)).toEqual([
      'script',
      'audio',
      'image',
      'avatar',
      'video',
      'editor',
    ])
  })
})
