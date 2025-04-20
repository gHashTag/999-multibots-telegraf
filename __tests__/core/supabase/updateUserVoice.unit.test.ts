import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Mock supabase client
jest.mock('@/core/supabase', () => ({ supabase: { from: jest.fn() } }))
import { supabase } from '@/core/supabase'
import { updateUserVoice } from '@/core/supabase/updateUserVoice'

describe('updateUserVoice', () => {
  const telegram_id = '77'
  const voice_id_elevenlabs = 'voice123'
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('resolves when update succeeds', async () => {
    const eqMock = jest.fn()
    const updateMock = jest.fn().mockReturnValue({ eq: eqMock, error: null })
    ;(supabase.from as jest.Mock).mockReturnValue({ update: updateMock })
    await expect(updateUserVoice(telegram_id, voice_id_elevenlabs)).resolves.toBeUndefined()
    expect(updateMock).toHaveBeenCalledWith({ voice_id_elevenlabs })
    expect(eqMock).toHaveBeenCalledWith('telegram_id', telegram_id)
  })

  it('throws error when update returns error', async () => {
    const errorObj = { message: 'failVoice' }
    const updateMock = jest.fn().mockReturnValue({ error: errorObj })
    ;(supabase.from as jest.Mock).mockReturnValue({ update: updateMock })
    await expect(updateUserVoice(telegram_id, voice_id_elevenlabs))
      .rejects.toThrow(`Ошибка при обновлении пользователя: ${errorObj.message}`)
  })
})