import { jest, describe, it, expect, beforeEach } from '@jest/globals'

describe('getVoiceId', () => {
  let getVoiceId: typeof import('@/core/supabase/getVoiceId').getVoiceId
  let builder: any
  const telegram_id = '77'
  beforeEach(() => {
    jest.resetModules()
    const { supabase } = require('@/core/supabase')
    builder = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn() }
    jest.spyOn(supabase, 'from').mockReturnValue(builder)
    // import function under test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    getVoiceId = require('@/core/supabase/getVoiceId').getVoiceId
  })

  it('returns voice_id when present', async () => {
    const voice = 'vid'
    builder.maybeSingle.mockResolvedValue({ data: { voice_id_elevenlabs: voice }, error: null })
    const res = await getVoiceId(telegram_id)
    expect(res).toBe(voice)
    const { supabase } = require('@/core/supabase')
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(builder.select).toHaveBeenCalledWith('voice_id_elevenlabs')
    expect(builder.eq).toHaveBeenCalledWith('telegram_id', telegram_id)
  })

  it('returns undefined when no data', async () => {
    builder.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await getVoiceId(telegram_id)
    expect(res).toBeUndefined()
  })

  it('throws when error', async () => {
    const err = { message: 'fail' }
    builder.maybeSingle.mockResolvedValue({ data: null, error: err })
    await expect(getVoiceId(telegram_id)).rejects.toThrow(
      `Ошибка при получении voice_id_elevenlabs: ${err.message}`
    )
  })
})