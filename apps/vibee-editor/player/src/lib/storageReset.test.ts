import { describe, expect, it } from 'vitest'
import { survivesStorageReset } from './storageReset'
import {
  clientThreadStorageKey,
  marketplaceAgentThreadStorageKey,
  queenThreadStorageKey,
} from '@/atoms/agentChat'

describe('survivesStorageReset', () => {
  it('keeps every conversation and every draft the person wrote', () => {
    for (const key of [
      'vibee-agent-chat',
      'vibee-agent-chat-draft',
      clientThreadStorageKey('900000071'),
      queenThreadStorageKey('900000071'),
      marketplaceAgentThreadStorageKey('blogger'),
      'vibee-agent-chat~c1',
      `${marketplaceAgentThreadStorageKey('rtl')}~c2`,
      'vibee-agent-chat-draft:client:900000071',
      'vibee-last-route',
      'vibee-soul',
    ])
      expect(survivesStorageReset(key), key).toBe(true)
  })

  it('still resets the editor defaults it exists for', () => {
    for (const key of [
      'vibee-editor-storage-v4',
      'vibee-agent-chatter',
      'vibee-tab',
      'vibee-agent-chat-draftX',
    ])
      expect(survivesStorageReset(key), key).toBe(false)
  })
})
