import { beforeEach, describe, expect, it, vi } from 'vitest'

const { maybeSingle, single, eq, select, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const single = vi.fn()
  const eq = vi.fn(() => ({ maybeSingle, single }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { maybeSingle, single, eq, select, from }
})

vi.mock('@/core/supabase', () => ({
  supabase: { from },
}))

import { setBotCommands } from '@/setCommands'

describe('setBotCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    maybeSingle.mockResolvedValue({ data: null, error: null })
  })

  it('treats a missing optional bot owner as an ordinary empty result', async () => {
    const telegram = {
      getMe: vi.fn().mockResolvedValue({ username: 'bot_without_owner' }),
      deleteMyCommands: vi.fn().mockResolvedValue(undefined),
      setMyCommands: vi.fn().mockResolvedValue(undefined),
      setChatMenuButton: vi.fn().mockResolvedValue(undefined),
    }

    await setBotCommands({ telegram } as never)

    expect(maybeSingle).toHaveBeenCalledOnce()
    expect(single).not.toHaveBeenCalled()
    expect(telegram.setMyCommands).toHaveBeenCalledTimes(2)
    expect(telegram.setChatMenuButton).toHaveBeenCalledExactlyOnceWith({
      menuButton: {
        type: 'web_app',
        text: 'APP',
        web_app: { url: 'https://app.t27.ai/chat' },
      },
    })
  })
})
