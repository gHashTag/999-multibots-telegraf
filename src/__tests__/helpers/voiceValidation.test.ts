/**
 * Tests for voiceValidation.ts
 *
 * Voice avatar validation and error messages. The destructive DB clear must
 * fire ONLY on a DEFINITIVE "voice absent" -- never on a non-authoritative
 * result (no/invalid ElevenLabs key, API outage), which would wipe every user's
 * saved voice pointer during a key gap. loop-fable iter197.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'

// Mock dependencies before imports
vi.mock('@/core/elevenlabs', () => ({
  checkVoiceExists: vi.fn(),
  assertVoiceExistsAuthoritative: vi.fn(),
}))

const mockUpdate = vi.fn().mockReturnThis()
const mockEq = vi.fn().mockResolvedValue({ data: null, error: null })
vi.mock('@/core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: mockUpdate.mockReturnValue({ eq: mockEq }),
    })),
  },
}))

import {
  validateAndCleanVoiceId,
  getVoiceAvatarErrorMessage,
  getCreateVoiceAvatarMessage,
} from '@/helpers/voiceValidation'
import { assertVoiceExistsAuthoritative } from '@/core/elevenlabs'
import { supabase } from '@/core/supabase'

describe('voiceValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('validateAndCleanVoiceId', () => {
    const voiceId = 'voice-123'
    const telegramId = '123456789'

    describe('voice exists (authoritative true)', () => {
      it('returns true and does not touch the database', async () => {
        ;(assertVoiceExistsAuthoritative as Mock).mockResolvedValue(true)

        const result = await validateAndCleanVoiceId(voiceId, telegramId)

        expect(result).toBe(true)
        expect(assertVoiceExistsAuthoritative).toHaveBeenCalledWith(voiceId)
        expect(supabase.from).not.toHaveBeenCalled()
      })
    })

    describe('voice definitively absent (authoritative false)', () => {
      it('returns false', async () => {
        ;(assertVoiceExistsAuthoritative as Mock).mockResolvedValue(false)

        const result = await validateAndCleanVoiceId(voiceId, telegramId)

        expect(result).toBe(false)
      })

      it('clears the saved voice pointer from the database', async () => {
        ;(assertVoiceExistsAuthoritative as Mock).mockResolvedValue(false)

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(supabase.from).toHaveBeenCalledWith('users')
        expect(mockUpdate).toHaveBeenCalledWith({ voice_id_elevenlabs: null })
        expect(mockEq).toHaveBeenCalledWith('telegram_id', telegramId)
      })

      it('handles a database error gracefully (still returns false)', async () => {
        ;(assertVoiceExistsAuthoritative as Mock).mockResolvedValue(false)
        mockEq.mockRejectedValueOnce(new Error('Database error'))

        const result = await validateAndCleanVoiceId(voiceId, telegramId)

        expect(result).toBe(false)
        expect(console.error).toHaveBeenCalled()
      })
    })

    describe('existence NOT authoritative (the fix)', () => {
      it('does NOT clear the database when the check throws', async () => {
        // Simulates no/invalid ElevenLabs key or an API outage: the authoritative
        // check throws. The saved voice pointer MUST be kept, not wiped.
        ;(assertVoiceExistsAuthoritative as Mock).mockRejectedValue(
          new Error('ELEVENLABS_API_KEY not loaded; not authoritative')
        )

        const result = await validateAndCleanVoiceId(voiceId, telegramId)

        expect(result).toBe(false)
        expect(supabase.from).not.toHaveBeenCalled()
        expect(mockUpdate).not.toHaveBeenCalled()
      })

      it('warns that the pointer is kept', async () => {
        ;(assertVoiceExistsAuthoritative as Mock).mockRejectedValue(
          new Error('outage')
        )

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining('not authoritative'),
          expect.any(Error)
        )
      })
    })

    describe('logging', () => {
      it('logs validation start', async () => {
        ;(assertVoiceExistsAuthoritative as Mock).mockResolvedValue(true)

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Starting validation'),
          voiceId
        )
      })

      it('logs validation success on authoritative existence', async () => {
        ;(assertVoiceExistsAuthoritative as Mock).mockResolvedValue(true)

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Voice validation successful'),
          voiceId
        )
      })

      it('logs when the voice is definitively absent', async () => {
        ;(assertVoiceExistsAuthoritative as Mock).mockResolvedValue(false)

        await validateAndCleanVoiceId(voiceId, telegramId)

        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('no longer exists')
        )
      })
    })
  })

  describe('getVoiceAvatarErrorMessage', () => {
    it('returns the Russian error message', () => {
      const result = getVoiceAvatarErrorMessage(true)
      expect(result).toContain('❌')
      expect(result).toContain('больше не доступен')
    })

    it('returns the English error message', () => {
      const result = getVoiceAvatarErrorMessage(false)
      expect(result).toContain('❌')
      expect(result).toContain('no longer available')
    })
  })

  describe('getCreateVoiceAvatarMessage', () => {
    it('returns the Russian create message', () => {
      const result = getCreateVoiceAvatarMessage(true)
      expect(result).toContain('🎯')
      expect(result).toContain('обучите аватар')
    })

    it('returns the English create message', () => {
      const result = getCreateVoiceAvatarMessage(false)
      expect(result).toContain('🎯')
      expect(result).toContain('train the avatar')
    })
  })
})
